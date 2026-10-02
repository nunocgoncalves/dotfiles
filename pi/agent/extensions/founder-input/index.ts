/**
 * Structured founder-input pause for headless Pi workflows.
 *
 * The tool gives an outer Codex orchestrator a stable JSON event to relay,
 * while the hook prevents the agent from continuing with dependent tool calls
 * in the same run. A later dispatcher resume supplies the answer to the same
 * Pi session; no process needs to remain alive while the founder decides.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  details: Record<string, unknown>;
};

export default function (pi: ExtensionAPI) {
  let paused = false;

  pi.registerTool({
    name: "request_founder_input",
    label: "Request founder input",
    description:
      "Pause a headless workflow for one decision that cannot be resolved from canonical sources. " +
      "Provide one question, your recommended answer, and why the decision is required.",
    promptSnippet: "Pause and request one founder decision",
    promptGuidelines: [
      "Use only when a founder/product/architecture/exception decision is genuinely required and cannot be discovered.",
      "Call this as the only tool in the assistant message, before any action that depends on the answer.",
      "Ask exactly one question and include a concrete recommendation.",
      "After this tool returns, stop the run. The outer orchestrator will resume this same session with the answer.",
    ],
    parameters: Type.Object({
      question: Type.String({ description: "The single decision question to relay to the founder." }),
      recommendation: Type.String({ description: "The agent's recommended answer." }),
      reason: Type.String({ description: "Why this decision is required now and what it affects." }),
      options: Type.Optional(
        Type.Array(Type.String(), {
          description: "Optional short, mutually exclusive choices when they materially clarify the decision.",
          maxItems: 4,
        }),
      ),
    }),
    async execute(_id, params) {
      const details = {
        question: params.question,
        recommendation: params.recommendation,
        reason: params.reason,
        options: params.options ?? [],
      };
      const result: ToolResult = {
        content: [
          {
            type: "text",
            text:
              "Founder input requested. End this run now without making dependent changes. " +
              "The outer Codex orchestrator will relay the decision and resume this same Pi session.",
          },
        ],
        details,
      };
      return result;
    },
  });

  pi.on("tool_call", async (event) => {
    if (event.toolName === "request_founder_input") {
      paused = true;
      return;
    }
    if (!paused) return;
    return {
      block: true,
      terminate: true,
      reason: "Founder input is pending. Stop this run; the dispatcher will resume the same session with the answer.",
    };
  });
}
