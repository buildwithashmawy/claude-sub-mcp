import { runClaudeCode } from "../services/claude-code-runner.js";
import { parseExecuteTaskOutput } from "../services/output-parser.js";
import { DEFAULT_MAX_TURNS, DEFAULT_TIMEOUT } from "../constants.js";
import type { ExecuteTaskOutput, ProgressCallback } from "../types.js";

interface ExecuteTaskInput {
  task: string;
  workingDirectory: string;
  allowedTools?: string[];
  maxTurns?: number;
  timeout?: number;
}

export async function executeTask(
  input: ExecuteTaskInput,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<ExecuteTaskOutput> {
  const timeout = input.timeout ?? DEFAULT_TIMEOUT;

  const result = await runClaudeCode({
    prompt: input.task,
    workingDirectory: input.workingDirectory,
    allowedTools: input.allowedTools,
    maxTurns: input.maxTurns ?? DEFAULT_MAX_TURNS,
    timeout,
    onProgress,
    signal,
  });

  if (result.timedOut) {
    return {
      summary: `Task timed out after ${timeout}ms. Partial output may be available below.`,
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
      summary: "Task was cancelled by the client.",
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
