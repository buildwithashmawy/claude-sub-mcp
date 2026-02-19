import { runClaudeCode } from "../services/claude-code-runner.js";
import { parsePlanTaskOutput } from "../services/output-parser.js";
import { PLAN_TIMEOUT } from "../constants.js";
import type { PlanTaskOutput } from "../types.js";

interface PlanTaskInput {
  task: string;
  workingDirectory: string;
  context?: string;
}

export async function planTask(input: PlanTaskInput): Promise<PlanTaskOutput> {
  const contextNote = input.context
    ? `\n\nAdditional context: ${input.context}`
    : "";

  const prompt =
    `Create a detailed step-by-step implementation plan for the following task. ` +
    `Do NOT execute anything — do not create, modify, or delete any files, and do not run any commands. ` +
    `Only output the plan with numbered steps, files to create/modify, and any dependencies needed.\n\n` +
    `Task: ${input.task}${contextNote}`;

  const result = await runClaudeCode({
    prompt,
    workingDirectory: input.workingDirectory,
    allowedTools: [],
    maxTurns: 5,
    timeout: PLAN_TIMEOUT,
  });

  if (result.timedOut) {
    return {
      plan: "Planning timed out. Try again with a simpler task description.",
      steps: [],
      estimatedFiles: [],
    };
  }

  return parsePlanTaskOutput(result.stdout);
}
