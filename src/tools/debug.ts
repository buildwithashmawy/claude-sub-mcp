import { runClaudeCode } from "../services/claude-code-runner.js";
import { parseDebugOutput } from "../services/output-parser.js";
import { READ_ONLY_TOOLS, DEFAULT_TIMEOUT } from "../constants.js";
import type { DebugOutput } from "../types.js";

interface DebugInput {
  error: string;
  workingDirectory: string;
  autoFix: boolean;
  relatedFiles?: string[];
}

export async function debugError(input: DebugInput): Promise<DebugOutput> {
  const relatedFilesNote =
    input.relatedFiles && input.relatedFiles.length > 0
      ? `\n\nRelated files to examine:\n${input.relatedFiles.map((f) => `- ${f}`).join("\n")}`
      : "";

  const fixInstruction = input.autoFix
    ? "After diagnosing the issue, apply the fix directly to the code."
    : "Only diagnose the issue and suggest a fix. Do NOT modify any files.";

  const prompt =
    `Debug the following error:\n\n${input.error}\n\n` +
    `${fixInstruction}${relatedFilesNote}\n\n` +
    `Provide:\n` +
    `1. A diagnosis of what's happening\n` +
    `2. The root cause\n` +
    `3. A description of the fix (and apply it if auto-fix is enabled)`;

  const allowedTools = input.autoFix
    ? undefined // all tools
    : READ_ONLY_TOOLS;

  const result = await runClaudeCode({
    prompt,
    workingDirectory: input.workingDirectory,
    allowedTools,
    maxTurns: input.autoFix ? 30 : 10,
    timeout: DEFAULT_TIMEOUT,
  });

  if (result.timedOut) {
    return {
      diagnosis: "Debugging timed out.",
      rootCause: "Could not determine — process timed out.",
      fix: { description: "", filesModified: [] },
      success: false,
    };
  }

  return parseDebugOutput(result.stdout, result.exitCode, input.autoFix);
}
