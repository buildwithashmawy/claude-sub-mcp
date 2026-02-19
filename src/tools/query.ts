import { runClaudeCode } from "../services/claude-code-runner.js";
import { READ_ONLY_TOOLS, DEFAULT_MAX_TURNS, DEFAULT_TIMEOUT } from "../constants.js";
import type { ProgressCallback } from "../types.js";

const EDIT_TOOLS = ["Read", "Write", "Edit", "Glob", "Grep"];

interface QueryInput {
  prompt: string;
  workingDirectory: string;
  mode: "read" | "edit" | "agent";
  maxTurns?: number;
  timeout?: number;
}

export interface QueryOutput {
  response: string;
  success: boolean;
  durationMs: number;
  numTurns?: number;
  sessionId?: string;
}

export async function query(
  input: QueryInput,
  onProgress?: ProgressCallback,
  signal?: AbortSignal,
): Promise<QueryOutput> {
  const timeout = input.timeout ?? DEFAULT_TIMEOUT;

  let allowedTools: string[] | undefined;
  let maxTurns: number;

  switch (input.mode) {
    case "read":
      allowedTools = READ_ONLY_TOOLS;
      maxTurns = input.maxTurns ?? 10;
      break;
    case "edit":
      allowedTools = EDIT_TOOLS;
      maxTurns = input.maxTurns ?? 20;
      break;
    case "agent":
    default:
      allowedTools = undefined; // all tools
      maxTurns = input.maxTurns ?? DEFAULT_MAX_TURNS;
      break;
  }

  const result = await runClaudeCode({
    prompt: input.prompt,
    workingDirectory: input.workingDirectory,
    allowedTools,
    maxTurns,
    timeout,
    onProgress,
    signal,
  });

  // Extract result text from JSON output
  let response: string;
  try {
    const parsed = JSON.parse(result.stdout);
    response = parsed.result || result.stdout;
  } catch {
    response = result.stdout || result.stderr;
  }

  if (result.timedOut) {
    return {
      response: `Request timed out after ${timeout}ms. Partial response:\n\n${response}`,
      success: false,
      durationMs: result.durationMs,
    };
  }

  if (result.cancelled) {
    return {
      response: "Request was cancelled by the client.",
      success: false,
      durationMs: result.durationMs,
    };
  }

  return {
    response,
    success: result.exitCode === 0,
    durationMs: result.durationMs,
    numTurns: result.numTurns,
    sessionId: result.sessionId,
  };
}
