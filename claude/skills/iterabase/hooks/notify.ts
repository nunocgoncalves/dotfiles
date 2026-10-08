/**
 * macOS notifications for Claude Code sessions.
 *
 * As a hook (`notify.ts hook`), fires a Notification Center alert when Claude
 * finishes and is waiting for you (Stop) or needs your attention, e.g. a
 * permission prompt (Notification), with enough context to tell sessions apart:
 *
 *   title:    Claude — <repo>                      (e.g. "Claude — iterabase-mono")
 *   subtitle: <branch> · <session title|topic>     (e.g. "HOR-264-notify · Review fixes")
 *   body:     first line of the last assistant message, or the notification text
 *
 * Backends (config.backend = "auto" | "terminal-notifier" | "osascript"):
 * - terminal-notifier: used automatically when installed; per-session grouping
 *   and click-to-activate the terminal app.
 * - osascript: built into macOS, no install required.
 *
 * As a CLI (`notify.ts config [status|on|off|toggle|test|sound <name|none>|snippet on|off]`)
 * it reads/updates ~/.config/iterabase/notify.json; the /notify skill drives it.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

type Backend = "auto" | "terminal-notifier" | "osascript";

interface NotifyConfig {
  enabled: boolean;
  /** macOS sound name (e.g. "Glass", "Ping") or "none". */
  sound: string;
  /** Include a snippet of the last assistant message in the body. */
  snippet: boolean;
  /** Also notify on Notification events (permission prompts, idle input). */
  attention: boolean;
  backend: Backend;
}

const DEFAULTS: NotifyConfig = {
  enabled: true,
  sound: "Glass",
  snippet: true,
  attention: true,
  backend: "auto",
};

const CONFIG_PATH = join(
  process.env.XDG_CONFIG_HOME || join(homedir(), ".config"),
  "iterabase",
  "notify.json",
);

function loadConfig(): NotifyConfig {
  try {
    return { ...DEFAULTS, ...(JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Partial<NotifyConfig>) };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveConfig(config: NotifyConfig): void {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`);
}

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
  return line ? plain(line, max) : "";
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text as string)
    .join("\n");
}

/** Map the terminal that launched Claude to its bundle id, for click-to-activate. */
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

function run(command: string, args: string[], cwd?: string): { code: number; stdout: string } {
  const res = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 5_000 });
  return { code: res.status ?? 1, stdout: res.stdout ?? "" };
}

/** Repo name (works from linked worktrees) and current branch, best effort. */
function gitInfo(cwd: string): { repo: string; branch?: string } {
  const fallback = { repo: basename(cwd) || cwd };
  const result = run("git", ["rev-parse", "--show-toplevel", "--git-common-dir", "--abbrev-ref", "HEAD"], cwd);
  if (result.code !== 0) return fallback;
  const [toplevel, commonDir, head] = result.stdout.trim().split("\n");
  if (!toplevel) return fallback;
  let repo = basename(toplevel);
  if (commonDir) {
    const gitDir = resolve(toplevel, commonDir.trim());
    repo = basename(gitDir) === ".git" ? basename(dirname(gitDir)) : basename(gitDir);
  }
  const branch = head && head.trim() !== "HEAD" ? head.trim() : undefined;
  return { repo: repo || fallback.repo, branch };
}

interface TranscriptInfo {
  title?: string;
  topic?: string;
  lastAssistantText: string;
}

/** Session title (custom, else AI-generated), first prompt topic, and last reply. */
function readTranscript(path: string | undefined): TranscriptInfo {
  const info: TranscriptInfo = { lastAssistantText: "" };
  if (!path) return info;
  let customTitle: string | undefined;
  let aiTitle: string | undefined;
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      if (!line) continue;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry.type === "custom-title" && entry.customTitle) customTitle = entry.customTitle;
      else if (entry.type === "ai-title" && entry.aiTitle) aiTitle = entry.aiTitle;
      else if (entry.type === "user" && !info.topic && !entry.isMeta) {
        const topic = firstLine(messageText(entry.message?.content), 70);
        // Skip markup-ish lines from command/skill expansion and tool results.
        if (topic && !/^[<{[]/.test(topic)) info.topic = topic;
      } else if (entry.type === "assistant") {
        const text = messageText(entry.message?.content);
        if (text.trim()) info.lastAssistantText = text;
      }
    }
  } catch {
    // Transcript is best effort.
  }
  info.title = customTitle ?? aiTitle;
  return info;
}

function deliver(config: NotifyConfig, input: { title: string; subtitle: string; body: string; group: string }): void {
  const terminalNotifier =
    config.backend === "terminal-notifier" ||
    (config.backend === "auto" && run("which", ["terminal-notifier"]).code === 0);

  if (terminalNotifier) {
    const args = ["-title", input.title, "-message", input.body, "-group", input.group];
    if (input.subtitle) args.push("-subtitle", input.subtitle);
    if (config.sound && config.sound !== "none") args.push("-sound", config.sound);
    const bundle = detectTerminalBundle();
    if (bundle) args.push("-activate", bundle);
    if (run("terminal-notifier", args).code === 0) return;
    // Otherwise fall through to osascript.
  }

  const soundClause = config.sound && config.sound !== "none" ? ` sound name ${asString(config.sound, 40)}` : "";
  const subtitleClause = input.subtitle ? ` subtitle ${asString(input.subtitle, 120)}` : "";
  run("osascript", [
    "-e",
    `display notification ${asString(input.body)} with title ${asString(input.title, 80)}${subtitleClause}${soundClause}`,
  ]);
}

interface HookInput {
  hook_event_name?: string;
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  message?: string;
  stop_hook_active?: boolean;
}

function fire(config: NotifyConfig, input: HookInput): void {
  const cwd = input.cwd ?? process.cwd();
  const { repo, branch } = gitInfo(cwd);
  const transcript = readTranscript(input.transcript_path);

  const label = transcript.title ?? transcript.topic;
  const subtitle = [branch, label && plain(label, 70)].filter(Boolean).join(" · ") || cwd.replace(homedir(), "~");

  const attention = input.hook_event_name === "Notification";
  const snippet = config.snippet ? firstLine(transcript.lastAssistantText) : "";
  const body = attention ? plain(input.message ?? "Needs your attention", 200) : snippet || "Ready for input";

  const group = input.session_id ? `claude-notify-${input.session_id.slice(0, 8)}` : "claude-notify";
  deliver(config, { title: `Claude — ${plain(repo, 40)}`, subtitle: plain(subtitle, 120), body, group });
}

function hook(): void {
  if (process.platform !== "darwin") return;
  const config = loadConfig();
  if (!config.enabled) return;
  let input: HookInput;
  try {
    input = JSON.parse(readFileSync(0, "utf8")) as HookInput;
  } catch {
    return;
  }
  if (input.hook_event_name === "Notification" && !config.attention) return;
  fire(config, input);
}

function configure(args: string[]): void {
  const config = loadConfig();
  const [action = "status", value] = args.map((arg) => arg.toLowerCase());
  const usage = "Usage: notify [status|on|off|toggle|test|sound <name|none>|snippet on|off|attention on|off]";
  switch (action) {
    case "status":
      break;
    case "on":
    case "off":
      config.enabled = action === "on";
      break;
    case "toggle":
      config.enabled = !config.enabled;
      break;
    case "sound":
      if (!value) return void console.log("Usage: notify sound <name|none> (e.g. Glass, Ping, Submarine, none)");
      config.sound = args[1];
      break;
    case "snippet":
    case "attention":
      if (value !== "on" && value !== "off") return void console.log(`Usage: notify ${action} on|off`);
      config[action] = value === "on";
      break;
    case "test":
      fire(config, { hook_event_name: "Stop", cwd: process.cwd() });
      return void console.log("Sent test notification.");
    default:
      return void console.log(usage);
  }
  if (action !== "status") saveConfig(config);
  console.log(
    `macOS notify: ${config.enabled ? "on" : "off"} · backend=${config.backend} · sound=${config.sound} · ` +
      `snippet=${config.snippet ? "on" : "off"} · attention=${config.attention ? "on" : "off"} (${CONFIG_PATH})`,
  );
}

const [mode, ...rest] = process.argv.slice(2);
if (mode === "hook") hook();
else configure(mode === "config" ? rest : [mode ?? "status", ...rest].filter(Boolean));
