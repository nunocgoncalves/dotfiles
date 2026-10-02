import { realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";

// Pi auto-discovers this extension through a symlink under ~/.pi/agent/extensions.
// Resolve that symlink before deriving the sibling skills directory.
const baseDir = realpathSync(dirname(fileURLToPath(import.meta.url)));
const skillsDir = join(baseDir, "..", "..", "skills");

const workflows = [
  {
    command: "start-ticket",
    skill: "implement-ticket",
    label: "Start ticket — validate, design, implement, open PR, and wait for CI",
    usage: "/start-ticket <HOR-123>",
  },
  {
    command: "release-ticket",
    skill: "release-ticket",
    label: "Release ticket — validate, candidate, approve, and promote exact artifacts",
    usage: "/release-ticket <HOR-123> [--targets target-a,target-b]",
  },
  {
    command: "accept-ticket",
    skill: "accept-ticket",
    label: "Accept ticket — verify merged delivery and move to Done",
    usage: "/accept-ticket <HOR-123>",
  },
] as const;

type Workflow = (typeof workflows)[number];

function startWorkflow(
  pi: ExtensionAPI,
  workflow: Workflow,
  args: string,
  ctx: ExtensionCommandContext,
): void {
  if (!ctx.isIdle()) {
    ctx.ui.notify("Wait for the current agent run to settle before starting an engineering workflow.", "warning");
    return;
  }

  const input = args.trim();
  if (!input) {
    ctx.ui.notify(`Usage: ${workflow.usage}`, "warning");
    return;
  }

  pi.setSessionName(`${workflow.command}: ${input}`);
  pi.sendUserMessage(`/skill:${workflow.skill} ${input}`);
}

export default function engineeringWorkflow(pi: ExtensionAPI) {
  pi.on("resources_discover", () => ({
    skillPaths: workflows.map((workflow) => join(skillsDir, workflow.skill)),
  }));

  pi.registerCommand("engineering", {
    description: "Choose and start an engineering ticket workflow",
    handler: async (args, ctx) => {
      const input = args.trim();
      if (input) {
        const [name, ...rest] = input.split(/\s+/);
        const workflow = workflows.find(
          (candidate) => candidate.command === name || candidate.skill === name,
        );
        if (!workflow) {
          ctx.ui.notify(`Unknown engineering workflow: ${name}`, "warning");
          return;
        }
        startWorkflow(pi, workflow, rest.join(" "), ctx);
        return;
      }

      if (!ctx.isIdle()) {
        ctx.ui.notify("Wait for the current agent run to settle before starting an engineering workflow.", "warning");
        return;
      }
      if (!ctx.hasUI) {
        ctx.ui.notify("Use /engineering <workflow> <HOR-123> outside interactive mode.", "warning");
        return;
      }

      const selected = await ctx.ui.select(
        "Start engineering workflow",
        workflows.map((workflow) => workflow.label),
      );
      if (!selected) return;

      const workflow = workflows.find((candidate) => candidate.label === selected);
      if (!workflow) return;
      const ticket = await ctx.ui.input("Linear ticket", "HOR-123");
      if (ticket) startWorkflow(pi, workflow, ticket, ctx);
    },
  });

  for (const workflow of workflows) {
    pi.registerCommand(workflow.command, {
      description: workflow.label,
      handler: async (args, ctx) => startWorkflow(pi, workflow, args, ctx),
    });
  }
}
