import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  CLAUDE_COMMAND,
  DEFAULT_MAX_TURNS,
  DEFAULT_TIMEOUT,
  PROGRESS_INTERVAL_MS,
} from "../constants.js";
import type { ClaudeCodeRunnerOptions, ClaudeCodeResult } from "../types.js";
import { trackProcess, killProcess } from "./process-manager.js";

export class ClaudeCodeNotFoundError extends Error {
  constructor() {
    super(
      `Claude Code CLI ("${CLAUDE_COMMAND}") not found. ` +
        "Please install it and ensure it's on your PATH. " +
        "Set CLAUDE_CODE_PATH env var to provide a custom path. " +
        "See: https://docs.anthropic.com/en/docs/claude-code"
    );
    this.name = "ClaudeCodeNotFoundError";
  }
}

export class WorkingDirectoryError extends Error {
  constructor(dir: string) {
    super(`Working directory does not exist: ${dir}`);
    this.name = "WorkingDirectoryError";
  }
}

export class ClaudeCodeTimeoutError extends Error {
  constructor(timeout: number) {
    super(
      `Claude Code process timed out after ${timeout}ms. ` +
        "Cursor enforces a 5-minute hard timeout on MCP tools. " +
        "Consider breaking the task into smaller pieces."
    );
    this.name = "ClaudeCodeTimeoutError";
  }
}

export class ClaudeCodeCancelledError extends Error {
  constructor() {
    super("Claude Code task was cancelled by the client.");
    this.name = "ClaudeCodeCancelledError";
  }
}

/**
 * Check if the Claude Code CLI is available and return its version.
 */
export function checkClaudeCodeAvailability(): { available: boolean; version: string } {
  try {
    const output = execFileSync(CLAUDE_COMMAND, ["--version"], {
      timeout: 5000,
      env: { ...process.env, CLAUDECODE: "" },
      encoding: "utf-8",
    });
    return { available: true, version: output.trim() };
  } catch {
    return { available: false, version: "" };
  }
}

export async function runClaudeCode(
  options: ClaudeCodeRunnerOptions
): Promise<ClaudeCodeResult> {
  const {
    prompt,
    workingDirectory,
    allowedTools,
    maxTurns = DEFAULT_MAX_TURNS,
    timeout = DEFAULT_TIMEOUT,
    continueConversation = false,
    outputFormat = "json",
    onProgress,
    signal,
  } = options;

  // Validate working directory
  if (!existsSync(workingDirectory)) {
    throw new WorkingDirectoryError(workingDirectory);
  }

  // Build CLI arguments
  const args: string[] = [];

  if (continueConversation) {
    args.push("--continue");
  }

  // Non-interactive mode with prompt
  args.push("-p", prompt);

  // Output format
  args.push("--output-format", outputFormat);

  // Max turns
  args.push("--max-turns", String(maxTurns));

  // Allowed tools
  if (allowedTools !== undefined) {
    if (allowedTools.length === 0) {
      args.push("--allowedTools", "");
    } else {
      args.push("--allowedTools", allowedTools.join(","));
    }
  }

  // Verbose for more output detail
  args.push("--verbose");

  const startTime = Date.now();

  return new Promise<ClaudeCodeResult>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let cancelled = false;

    const proc = spawn(CLAUDE_COMMAND, args, {
      cwd: workingDirectory,
      env: {
        ...process.env,
        // Unset CLAUDECODE to avoid nested session detection
        CLAUDECODE: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    trackProcess(proc);

    // Timeout handling
    const timer = setTimeout(() => {
      timedOut = true;
      killProcess(proc);
    }, timeout);

    // Abort signal handling (Cursor cancellation)
    const onAbort = () => {
      cancelled = true;
      clearTimeout(timer);
      killProcess(proc);
    };
    if (signal) {
      if (signal.aborted) {
        killProcess(proc);
        clearTimeout(timer);
        reject(new ClaudeCodeCancelledError());
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    // Progress reporting — emit periodic updates for long-running tasks
    let progressTimer: ReturnType<typeof setInterval> | undefined;
    if (onProgress) {
      let tick = 0;
      const totalEstimate = Math.ceil(timeout / PROGRESS_INTERVAL_MS);
      progressTimer = setInterval(() => {
        tick++;
        const stderrLines = stderr.split("\n").filter(Boolean);
        const lastLine = stderrLines[stderrLines.length - 1] || "Working...";
        onProgress(tick, totalEstimate, lastLine).catch(() => {});
      }, PROGRESS_INTERVAL_MS);
    }

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (progressTimer) clearInterval(progressTimer);
      if (signal) signal.removeEventListener("abort", onAbort);
      if (err.code === "ENOENT") {
        reject(new ClaudeCodeNotFoundError());
      } else {
        reject(err);
      }
    });

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);
      if (progressTimer) clearInterval(progressTimer);
      if (signal) signal.removeEventListener("abort", onAbort);

      const durationMs = Date.now() - startTime;

      // Extract metadata from JSON output
      let sessionId: string | undefined;
      let costUsd: number | undefined;
      let numTurns: number | undefined;
      try {
        const parsed = JSON.parse(stdout);
        sessionId = parsed.session_id;
        costUsd = parsed.cost_usd;
        numTurns = parsed.num_turns;
      } catch {
        // Not JSON or parse failed — that's fine
      }

      resolve({
        exitCode: code ?? (timedOut || cancelled ? 1 : 0),
        stdout,
        stderr,
        timedOut,
        cancelled,
        durationMs,
        sessionId,
        costUsd,
        numTurns,
      });
    });
  });
}
