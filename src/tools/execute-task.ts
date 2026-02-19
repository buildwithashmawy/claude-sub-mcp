import { runClaudeCode } from "../services/claude-code-runner.js";
import { parseExecuteTaskOutput } from "../services/output-parser.js";
import { DEFAULT_MAX_TURNS, DEFAULT_TIMEOUT } from "../constants.js";
import type { ExecuteTaskOutput } from "../types.js";

interface ExecuteTaskInput {
  task: string;
  workingDirectory: string;
  allowedTools?: string[];
  maxTurns?: number;
  timeout?: number;
}

export async function executeTask(
  input: ExecuteTaskInput
): Promise<ExecuteTaskOutput> {
  const result = await runClaudeCode({
    prompt: input.task,
    workingDirectory: input.workingDirectory,
    allowedTools: input.allowedTools,
    maxTurns: input.maxTurns ?? DEFAULT_MAX_TURNS,
    timeout: input.timeout ?? DEFAULT_TIMEOUT,
  });

  if (result.timedOut) {
    return {
      summary: `Task timed out after ${input.timeout ?? DEFAULT_TIMEOUT}ms. Partial output may be available.`,
      filesCreated: [],
      filesModified: [],
      commandsRun: [],
      success: false,
      rawOutput: result.stdout || result.stderr,
    };
  }

  return parseExecuteTaskOutput(result.stdout, result.exitCode);
}
