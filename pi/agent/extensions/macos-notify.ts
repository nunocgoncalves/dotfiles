/**
 * macOS Notify Extension
 *
 * Sends a native macOS Notification Center notification when a turn finishes,
 * with enough context to tell *which* pi session it belongs to:
 *
 *   title:    pi — <repo>                        (e.g. "pi — dotfiles")
 *   subtitle: <branch> · <session name|topic>    (e.g. "HOR-264-notify · review item 3")
 *   body:     snippet of the last assistant message (e.g. "review finished")
 *
 * By default it fires on `agent_settled`, which means pi is completely done:
 * no retries, compaction, or queued follow-ups left, and it is waiting for you.
 * Set `trigger: "turn"` to instead notify on every `turn_end` (each LLM
 * response + tool calls), which can be several notifications per prompt.
 *
 * Backends (config.backend = "auto" | "terminal-notifier" | "osascript"):
 * - terminal-notifier: used automatically when installed; supports per-session
 *   grouping and click-to-activate the terminal app.
 * - osascript: built into macOS, no install required.
 *
 * Config: ~/.pi/agent/macos-notify.json
 * Commands: /notify [status|on|off|toggle|test|trigger settled|turn|sound <name|none>|snippet on|off]
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

type Trigger = "settled" | "turn";
type Backend = "auto" | "terminal-notifier" | "osascript";

interface NotifyConfig {
	enabled: boolean;
	trigger: Trigger;
	/** macOS sound name (e.g. "Glass", "Ping") or "none". */
	sound: string;
	/** Include a snippet of the last assistant message in the body. */
	snippet: boolean;
	/** Also notify in non-interactive modes (json/print). */
	headless: boolean;
	backend: Backend;
}

const DEFAULTS: NotifyConfig = {
	enabled: true,
	trigger: "settled",
	sound: "Glass",
	snippet: true,
	headless: false,
	backend: "auto",
};

const CONFIG_PATH = join(homedir(), ".pi", "agent", "macos-notify.json");
const IS_MACOS = process.platform === "darwin";

/** Collapse whitespace/control characters and truncate. */
function plain(value: string, max = 200): string {
	return value
		.replace(/\r?\n/g, " ")
		.replace(/[\u0000-\u001f\u007f]/g, "")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, max);
}

/** Build a safe AppleScript string literal (no raw newlines/control chars). */
function asString(value: string, max = 300): string {
	return `"${plain(value, max).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function firstLine(text: string, max = 120): string {
	const line = text
		.split(/\r?\n/)
		.map((part) => part.trim())
		.find((part) => part.length > 0);
	if (!line) return "";
	return plain(line, max);
}

function messageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((part): part is { type: "text"; text: string } => {
			return typeof part === "object" && part !== null && (part as { type?: string }).type === "text" && typeof (part as { text?: unknown }).text === "string";
		})
		.map((part) => part.text)
		.join("\n");
}

/** Map the terminal that launched pi to its bundle id, for click-to-activate. */
function detectTerminalBundle(): string | undefined {
	if (process.env.KITTY_WINDOW_ID) return "net.kovidgoyal.kitty";
	const byProgram: Record<string, string> = {
		Apple_Terminal: "com.apple.Terminal",
		"iTerm.app": "com.googlecode.iterm2",
		ghostty: "com.mitchellh.ghostty",
		WezTerm: "com.github.wez.wezterm",
		vscode: "com.microsoft.VSCode",
		WarpTerminal: "dev.warp.Warp-Stable",
		Hyper: "co.zeit.hyper",
		Tabby: "org.tabby",
	};
	const program = process.env.TERM_PROGRAM;
	return program ? byProgram[program] : undefined;
}

interface GitInfo {
	repo: string;
	branch?: string;
}

function abbrevPath(path: string): string {
	const home = homedir();
	return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
}

export default function (pi: ExtensionAPI) {
	let config: NotifyConfig = { ...DEFAULTS };
	let configLoaded = false;
	let terminalNotifierAvailable: boolean | null = null;
	let sessionName: string | undefined;
	let sessionTopic: string | undefined;
	let lastAssistantText = "";
	let lastStopReason: string | undefined;
	let turnsSinceNotify = 0;

	async function loadConfig(): Promise<void> {
		if (configLoaded) return;
		configLoaded = true;
		try {
			const raw = await readFile(CONFIG_PATH, "utf8");
			const parsed = JSON.parse(raw) as Partial<NotifyConfig>;
			config = { ...DEFAULTS, ...parsed };
		} catch {
			config = { ...DEFAULTS };
		}
	}

	async function saveConfig(): Promise<void> {
		try {
			await mkdir(dirname(CONFIG_PATH), { recursive: true });
			await writeFile(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, "utf8");
		} catch {
			// Best effort: never break a session over config persistence.
		}
	}

	async function run(command: string, args: string[], cwd?: string): Promise<{ code: number; stdout: string } | undefined> {
		try {
			const result = await pi.exec(command, args, cwd ? { cwd } : undefined);
			return { code: result.code, stdout: result.stdout };
		} catch {
			return undefined;
		}
	}

	/** Repo name (works from linked worktrees) and current branch, best effort. */
	async function gitInfo(cwd: string): Promise<GitInfo> {
		const fallback: GitInfo = { repo: basename(cwd) || cwd };
		const result = await run("git", ["rev-parse", "--show-toplevel", "--git-common-dir", "--abbrev-ref", "HEAD"], cwd);
		if (!result || result.code !== 0) return fallback;

		const [toplevel, commonDir, head] = result.stdout.trim().split("\n");
		if (!toplevel) return fallback;

		let repo = basename(toplevel);
		if (commonDir) {
			const gitDir = resolve(toplevel, commonDir.trim());
			if (basename(gitDir) === ".git") {
				repo = basename(dirname(gitDir));
			} else {
				repo = basename(gitDir);
			}
		}
		const branch = head && head.trim() !== "HEAD" ? head.trim() : undefined;
		return { repo: repo || fallback.repo, branch };
	}

	async function notify(input: { title: string; subtitle: string; body: string; group: string }): Promise<void> {
		const backend = config.backend;
		const useTerminalNotifier = backend === "terminal-notifier" || (backend === "auto" && terminalNotifierAvailable === true);

		if (useTerminalNotifier) {
			const args = ["-title", input.title, "-message", input.body, "-group", input.group];
			if (input.subtitle) args.push("-subtitle", input.subtitle);
			if (config.sound && config.sound !== "none") args.push("-sound", config.sound);
			const bundle = detectTerminalBundle();
			if (bundle) args.push("-activate", bundle);
			const result = await run("terminal-notifier", args);
			if (result?.code === 0) return;
			// Otherwise fall through to osascript.
		}

		const soundClause = config.sound && config.sound !== "none" ? ` sound name ${asString(config.sound, 40)}` : "";
		const subtitleClause = input.subtitle ? ` subtitle ${asString(input.subtitle, 120)}` : "";
		await run("osascript", [
			"-e",
			`display notification ${asString(input.body)} with title ${asString(input.title, 80)}${subtitleClause}${soundClause}`,
		]);
	}

	function shouldNotify(ctx: ExtensionContext, override = false): boolean {
		if (!IS_MACOS) return false;
		if (!config.enabled && !override) return false;
		if (!config.headless && ctx.mode !== "tui" && ctx.mode !== "rpc") return false;
		return true;
	}

	async function fire(ctx: ExtensionContext, turn: number | undefined, override = false): Promise<void> {
		if (!shouldNotify(ctx, override)) return;
		if (!override && lastStopReason === "aborted") {
			// The user interrupted the run; they are already looking at pi.
			turnsSinceNotify = 0;
			return;
		}
		if (!override && turnsSinceNotify === 0) return;

		const { repo, branch } = await gitInfo(ctx.cwd);
		const name = sessionName ?? pi.getSessionName();

		// Subtitle: prefer user-chosen session name, else first-prompt topic.
		const label = name ?? sessionTopic;
		const subtitleParts: string[] = [];
		if (branch) subtitleParts.push(branch);
		if (label) subtitleParts.push(plain(label, 70));
		let subtitle = subtitleParts.join(" · ");
		if (!subtitle) subtitle = abbrevPath(ctx.cwd);
		if (turn !== undefined) subtitle = subtitle ? `${subtitle} · turn ${turn + 1}` : `turn ${turn + 1}`;

		const snippet = config.snippet ? firstLine(lastAssistantText) : "";
		const body = snippet || (turn === undefined ? "Ready for input" : `Turn ${turn + 1} finished`);

		let group = "pi-notify";
		try {
			const id = ctx.sessionManager.getSessionId();
			if (id) group = `pi-notify-${id.slice(0, 8)}`;
		} catch {
			// Keep the shared group.
		}

		turnsSinceNotify = 0;
		await notify({ title: `pi — ${plain(repo, 40)}`, subtitle: plain(subtitle, 120), body, group });
	}

	/** Seed the topic from history so resumed/continued sessions get a label too. */
	function seedTopicFromHistory(ctx: ExtensionContext): void {
		try {
			for (const entry of ctx.sessionManager.getEntries()) {
				const candidate = entry as { type?: string; message?: { role?: string; content?: unknown } };
				if (candidate.type !== "message" || candidate.message?.role !== "user") continue;
				const topic = firstLine(messageText(candidate.message.content), 70);
				if (!topic) continue;
				// Skip markup-ish or bare-slash-command lines from skill/template expansion.
				if (/^[<{[]/.test(topic) || /^\/\S*$/.test(topic)) continue;
				sessionTopic = topic;
				return;
			}
		} catch {
			// History is best effort.
		}
	}

	pi.on("session_start", async (_event, ctx) => {
		await loadConfig();
		sessionName = pi.getSessionName();
		sessionTopic = undefined;
		lastAssistantText = "";
		lastStopReason = undefined;
		turnsSinceNotify = 0;
		seedTopicFromHistory(ctx);

		if (!IS_MACOS) return;
		if (config.backend !== "terminal-notifier") {
			const probe = await run("which", ["terminal-notifier"]);
			terminalNotifierAvailable = probe?.code === 0 && probe.stdout.trim().length > 0;
		}
	});

	pi.on("session_info_changed", async (event) => {
		sessionName = event.name;
	});

	pi.on("message_end", async (event) => {
		if (event.message.role === "user") {
			if (!sessionTopic) {
				const topic = firstLine(messageText(event.message.content), 70);
				if (topic) sessionTopic = topic;
			}
			return;
		}
		if (event.message.role !== "assistant") return;

		lastStopReason = event.message.stopReason;
		const text = messageText(event.message.content);
		if (text.trim().length > 0) lastAssistantText = text;
	});

	pi.on("turn_end", async (event, ctx) => {
		turnsSinceNotify += 1;
		if (config.trigger !== "turn") return;
		await fire(ctx, event.turnIndex);
	});

	pi.on("agent_settled", async (_event, ctx) => {
		// `agent_settled` is the only signal that pi will not keep running
		// automatically (retry, auto-compact, queued follow-ups).
		await fire(ctx, undefined);
	});

	pi.registerCommand("notify", {
		description: "Configure macOS turn-finished notifications",
		getArgumentCompletions: (prefix: string) => {
			const options = [
				"status",
				"on",
				"off",
				"toggle",
				"test",
				"trigger settled",
				"trigger turn",
				"sound Glass",
				"sound Ping",
				"sound none",
				"snippet on",
				"snippet off",
			];
			const items = options
				.filter((option) => option.startsWith(prefix))
				.map((option) => ({ value: option, label: option }));
			return items.length > 0 ? items : null;
		},
		handler: async (args, ctx) => {
			await loadConfig();
			const parts = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
			const [action, value] = parts;

			switch (action) {
				case "":
				case "status": {
					if (!IS_MACOS) {
						ctx.ui.notify("macOS notifications are only available on macOS.", "warning");
						return;
					}
					const backend = config.backend === "auto" ? `auto (${terminalNotifierAvailable ? "terminal-notifier" : "osascript"})` : config.backend;
					ctx.ui.notify(
						`macOS notify: ${config.enabled ? "on" : "off"} · trigger=${config.trigger} · backend=${backend} · sound=${config.sound} · snippet=${config.snippet ? "on" : "off"}`,
						"info",
					);
					return;
				}
				case "on":
				case "off": {
					config.enabled = action === "on";
					break;
				}
				case "toggle": {
					config.enabled = !config.enabled;
					break;
				}
				case "trigger": {
					if (value !== "settled" && value !== "turn") {
						ctx.ui.notify("Usage: /notify trigger settled|turn", "warning");
						return;
					}
					config.trigger = value;
					break;
				}
				case "sound": {
					if (!value) {
						ctx.ui.notify("Usage: /notify sound <name|none> (e.g. Glass, Ping, Submarine, none)", "warning");
						return;
					}
					config.sound = value;
					break;
				}
				case "snippet": {
					if (value !== "on" && value !== "off") {
						ctx.ui.notify("Usage: /notify snippet on|off", "warning");
						return;
					}
					config.snippet = value === "on";
					break;
				}
				case "test": {
					await fire(ctx, undefined, true);
					ctx.ui.notify("Sent test notification.", "info");
					return;
				}
				default: {
					ctx.ui.notify("Usage: /notify [status|on|off|toggle|test|trigger settled|turn|sound <name|none>|snippet on|off]", "warning");
					return;
				}
			}

			await saveConfig();
			ctx.ui.notify(`macOS notify: ${config.enabled ? "on" : "off"} · trigger=${config.trigger} · sound=${config.sound}`, "info");
		},
	});

	// Escape hatch for other extensions: pi.events.emit("macos-notify", { title?, subtitle?, body? })
	const unsubscribe = pi.events.on("macos-notify", async (payload) => {
		const data = (payload ?? {}) as { title?: string; subtitle?: string; body?: string };
		await notify({
			title: data.title ?? "pi",
			subtitle: data.subtitle ?? "",
			body: data.body ?? "Ready for input",
			group: "pi-notify",
		});
	});
	pi.on("session_shutdown", async () => {
		unsubscribe();
	});
}
