import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { CLAUDE_COMMAND, DEFAULT_MAX_TURNS, DEFAULT_TIMEOUT } from "../constants.js";
import type { ClaudeCodeRunnerOptions, ClaudeCodeResult } from "../types.js";
import { trackProcess, killProcess } from "./process-manager.js";

export class ClaudeCodeNotFoundError extends Error {
  constructor() {
    super(
      `Claude Code CLI ("${CLAUDE_COMMAND}") not found. ` +
        "Please install it and ensure it's on your PATH. " +
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
    super(`Claude Code process timed out after ${timeout}ms`);
    this.name = "ClaudeCodeTimeoutError";
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

  return new Promise<ClaudeCodeResult>((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;

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

    const timer = setTimeout(() => {
      timedOut = true;
      killProcess(proc);
    }, timeout);

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (err.code === "ENOENT") {
        reject(new ClaudeCodeNotFoundError());
      } else {
        reject(err);
      }
    });

    proc.on("close", (code: number | null) => {
      clearTimeout(timer);

      if (timedOut) {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          timedOut: true,
        });
        return;
      }

      resolve({
        exitCode: code ?? 0,
        stdout,
        stderr,
        timedOut: false,
      });
    });
  });
}
