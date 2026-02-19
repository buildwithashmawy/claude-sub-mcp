import { runClaudeCode } from "../services/claude-code-runner.js";
import { parseExecuteTaskOutput } from "../services/output-parser.js";
import { DEFAULT_MAX_TURNS, DEFAULT_TIMEOUT } from "../constants.js";
import type { ContinueOutput, ProgressCallback } from "../types.js";

interface ContinueInput {
  instruction: string;
  workingDirectory: string;
  resumeConversation: boolean;
}

export async function continueTask(
  input: ContinueInput,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<ContinueOutput> {
  const result = await runClaudeCode({
    prompt: input.instruction,
    workingDirectory: input.workingDirectory,
    continueConversation: input.resumeConversation,
    maxTurns: DEFAULT_MAX_TURNS,
    timeout: DEFAULT_TIMEOUT,
    onProgress,
    signal,
  });

  if (result.timedOut) {
    return {
      summary: `Continuation timed out after ${DEFAULT_TIMEOUT}ms.`,
      filesCreated: [],
      filesModified: [],
      commandsRun: [],
      success: false,
      rawOutput: result.stdout || result.stderr,
      durationMs: result.durationMs,
    };
  }

  if (result.cancelled) {
    return {
      summary: "Continuation was cancelled by the client.",
      filesCreated: [],
      filesModified: [],
      commandsRun: [],
      success: false,
      rawOutput: result.stdout || result.stderr,
      durationMs: result.durationMs,
    };
  }

  return parseExecuteTaskOutput(result.stdout, result);
}
