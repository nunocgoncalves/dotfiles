/**
 * Structured founder-input pause.
 *
 * The tool gives the agent one escalation channel for a decision it cannot
 * discover, and the hook prevents it from continuing on a guess: after the tool
 * returns, every dependent tool call in that run is blocked. The decision is
 * answered in the next turn of the same session, so canonical systems — not
 * conversation memory — carry the workflow forward.
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
      "Pause for one decision that cannot be resolved from canonical sources. " +
      "Provide one question, your recommended answer, and why the decision is required.",
    promptSnippet: "Pause and request one founder decision",
    promptGuidelines: [
      "Use only when a founder/product/architecture/exception decision is genuinely required and cannot be discovered.",
      "Call this as the only tool in the assistant message, before any action that depends on the answer.",
      "Ask exactly one question and include a concrete recommendation.",
      "After this tool returns, stop the run. The decision arrives in the next turn of this session.",
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
              "Founder input requested. Stop here without making dependent changes; " +
              "the decision arrives in the next turn of this session.",
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
      reason: "Founder input is pending. Stop this run; the decision arrives in the next turn of this session.",
    };
  });
}
