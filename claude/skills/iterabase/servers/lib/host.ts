/**
 * Tool host: the small surface the Linear and review tools are written
 * against (`registerTool` + `exec`), served to Claude Code over MCP stdio.
 *
 * Zero dependencies on purpose — Node runs these .ts files directly (type
 * stripping), so the plugin needs no install step. Only the MCP methods a
 * tools-only server needs are implemented: initialize, ping, tools/list,
 * tools/call, and notifications/cancelled (which aborts the call's signal, so
 * long CI waits stop when the user interrupts).
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { validate, type Schema } from "./schema.ts";

export interface ToolContent {
  type: "text";
  text: string;
}

export interface ToolResult {
  content: ToolContent[];
  details?: unknown;
  isError?: boolean;
}

export interface ToolContext {
  /** Project directory of the Claude Code session that started this server. */
  cwd: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Schema;
  /** Extra usage rules; appended to the description the model sees. */
  promptGuidelines?: string[];
  // Display-only metadata kept for parity with the original definitions.
  label?: string;
  promptSnippet?: string;
  execute(
    toolCallId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params: any,
    signal: AbortSignal,
    onUpdate: undefined,
    ctx: ToolContext,
  ): Promise<ToolResult>;
}

export interface ExecOptions {
  cwd?: string;
  timeout?: number;
  signal?: AbortSignal;
}

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
}

export interface Host {
  registerTool(tool: ToolDefinition): void;
  exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

/** Run a command without a shell. Never rejects: failures surface as a non-zero code. */
export function exec(command: string, args: string[], options: ExecOptions = {}): Promise<ExecResult> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (result: ExecResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      resolve(result);
    };

    const child = spawn(command, args, {
      cwd: options.cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const onAbort = () => {
      child.kill("SIGTERM");
      finish({ code: 130, stdout, stderr: `${stderr}\n${command} aborted`.trim() });
    };
    const timer = options.timeout
      ? setTimeout(() => {
          child.kill("SIGTERM");
          finish({ code: 124, stdout, stderr: `${stderr}\n${command} timed out after ${options.timeout}ms`.trim() });
        }, options.timeout)
      : undefined;
    if (options.signal?.aborted) onAbort();
    else options.signal?.addEventListener("abort", onAbort, { once: true });

    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("error", (error) => finish({ code: 127, stdout, stderr: `${command}: ${error.message}` }));
    child.on("close", (code) => finish({ code: code ?? 1, stdout, stderr }));
  });
}

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  params?: any;
}

export interface ServerInfo {
  name: string;
  version: string;
  instructions?: string;
}

export function createHost(): Host & { serve(info: ServerInfo): void } {
  const tools = new Map<string, ToolDefinition>();
  const inflight = new Map<number | string, AbortController>();

  const send = (message: object) => process.stdout.write(`${JSON.stringify(message)}\n`);
  const reply = (id: number | string, result: object) => send({ jsonrpc: "2.0", id, result });
  const fail = (id: number | string, code: number, message: string) =>
    send({ jsonrpc: "2.0", id, error: { code, message } });

  const describe = (tool: ToolDefinition) =>
    tool.promptGuidelines?.length
      ? `${tool.description}\n\nGuidelines:\n${tool.promptGuidelines.map((g) => `- ${g}`).join("\n")}`
      : tool.description;

  async function callTool(id: number | string, name: string, args: unknown): Promise<void> {
    const tool = tools.get(name);
    if (!tool) return fail(id, -32602, `Unknown tool: ${name}`);
    const params = args ?? {};
    const problems = validate(tool.parameters, params);
    if (problems.length) {
      return reply(id, { content: [{ type: "text", text: `Invalid arguments: ${problems.join("; ")}` }], isError: true });
    }

    const controller = new AbortController();
    inflight.set(id, controller);
    try {
      const ctx: ToolContext = { cwd: process.env.CLAUDE_PROJECT_DIR || process.cwd() };
      const result = await tool.execute(String(id), params, controller.signal, undefined, ctx);
      if (controller.signal.aborted) return;
      reply(id, { content: result.content, ...(result.isError ? { isError: true } : {}) });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : String(error);
      reply(id, { content: [{ type: "text", text: message }], isError: true });
    } finally {
      inflight.delete(id);
    }
  }

  function handle(message: JsonRpcMessage, info: ServerInfo): void {
    const { id, method, params } = message;
    if (method === "notifications/cancelled") {
      inflight.get(params?.requestId)?.abort();
      return;
    }
    if (id === undefined || !method) return; // other notifications / stray responses

    switch (method) {
      case "initialize":
        return reply(id, {
          protocolVersion: params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name: info.name, version: info.version },
          ...(info.instructions ? { instructions: info.instructions } : {}),
        });
      case "ping":
        return reply(id, {});
      case "tools/list":
        return reply(id, {
          tools: [...tools.values()].map((tool) => ({
            name: tool.name,
            description: describe(tool),
            inputSchema: tool.parameters,
          })),
        });
      case "tools/call":
        void callTool(id, params?.name, params?.arguments);
        return;
      default:
        return fail(id, -32601, `Method not found: ${method}`);
    }
  }

  return {
    registerTool(tool) {
      if (tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
      tools.set(tool.name, tool);
    },
    exec,
    serve(info) {
      const lines = createInterface({ input: process.stdin });
      lines.on("line", (line) => {
        if (!line.trim()) return;
        let message: JsonRpcMessage;
        try {
          message = JSON.parse(line) as JsonRpcMessage;
        } catch {
          return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
        }
        handle(message, info);
      });
      lines.on("close", () => process.exit(0));
    },
  };
}
