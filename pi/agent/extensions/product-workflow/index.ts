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
    command: "product-housekeeping",
    skill: "product-housekeeping",
    label: "Housekeeping — reconcile Obsidian and Linear scope",
  },
  {
    command: "product-discovery",
    skill: "product-discovery",
    label: "Discovery — shape a signal or opportunity",
  },
  {
    command: "product-requirements",
    skill: "product-requirements",
    label: "Requirements — write or revise a PRD",
  },
  {
    command: "product-design-brief",
    skill: "product-design-brief",
    label: "Design brief — explore, design, or verify product UX",
  },
  {
    command: "product-roadmap",
    skill: "product-roadmap",
    label: "Roadmap — prioritize Now / Next / Later",
  },
  {
    command: "product-to-engineering",
    skill: "product-to-engineering",
    label: "Product → Engineering — shape Linear delivery",
  },
  {
    command: "product-release-review",
    skill: "product-release-review",
    label: "Release review — validate outcome and learning",
  },
  {
    command: "product-weekly",
    skill: "product-weekly-review",
    label: "Weekly review — evidence, WIP, risk, and focus",
  },
] as const;

type Workflow = (typeof workflows)[number];

function startWorkflow(pi: ExtensionAPI, workflow: Workflow, args: string, ctx: ExtensionCommandContext) {
  if (!ctx.isIdle()) {
    ctx.ui.notify("Wait for the current agent run to settle before starting a product workflow.", "warning");
    return;
  }

  const suffix = args.trim() ? ` ${args.trim()}` : "";
  pi.setSessionName(workflow.label.split(" — ")[0]);
  pi.sendUserMessage(`/skill:${workflow.skill}${suffix}`);
}

export default function productWorkflow(pi: ExtensionAPI) {
  // Load only the product-management suite. The pre-existing engineering
  // skills are already globally discovered through their own symlinks; adding
  // the whole sibling skills directory here would create name collisions.
  pi.on("resources_discover", () => ({
    skillPaths: workflows.map((workflow) => join(skillsDir, workflow.skill)),
  }));

  pi.registerCommand("product", {
    description: "Choose and start a product-management workflow",
    handler: async (args, ctx) => {
      if (!ctx.isIdle()) {
        ctx.ui.notify("Wait for the current agent run to settle before starting a product workflow.", "warning");
        return;
      }

      if (args.trim()) {
        const query = args.trim().toLowerCase();
        const match = workflows.find(
          (workflow) => workflow.command === query || workflow.skill === query,
        );
        if (!match) {
          ctx.ui.notify(`Unknown product workflow: ${args.trim()}`, "warning");
          return;
        }
        startWorkflow(pi, match, "", ctx);
        return;
      }

      if (!ctx.hasUI) {
        ctx.ui.notify("Use /product <workflow> outside interactive mode.", "warning");
        return;
      }

      const selected = await ctx.ui.select(
        "Start product workflow",
        workflows.map((workflow) => workflow.label),
      );
      if (!selected) return;

      const workflow = workflows.find((candidate) => candidate.label === selected);
      if (workflow) startWorkflow(pi, workflow, "", ctx);
    },
  });

  for (const workflow of workflows) {
    pi.registerCommand(workflow.command, {
      description: workflow.label,
      handler: async (args, ctx) => startWorkflow(pi, workflow, args, ctx),
    });
  }

  pi.registerCommand("product-opportunity", {
    description: "Register and shape a customer opportunity or opportunity portfolio",
    handler: async (args, ctx) => {
      const workflow = workflows.find((candidate) => candidate.skill === "product-discovery");
      if (workflow) startWorkflow(pi, workflow, args, ctx);
    },
  });

  pi.registerCommand("product-status", {
    description: "Show a read-only product operating status",
    handler: async (_args, ctx) => {
      const workflow = workflows.find((candidate) => candidate.skill === "product-weekly-review");
      if (workflow) startWorkflow(pi, workflow, "status-only", ctx);
    },
  });
}
