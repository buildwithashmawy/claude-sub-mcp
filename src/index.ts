#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { ServerNotification } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import {
  executeTaskSchema,
  planTaskSchema,
  reviewCodeSchema,
  debugSchema,
  runAndVerifySchema,
  continueSchema,
} from "./schemas/input-schemas.js";
import { executeTask } from "./tools/execute-task.js";
import { planTask } from "./tools/plan-task.js";
import { reviewCode } from "./tools/review-code.js";
import { debugError } from "./tools/debug.js";
import { runAndVerify } from "./tools/run-and-verify.js";
import { continueTask } from "./tools/continue.js";
import {
  cleanupAllProcesses,
  getActiveProcessCount,
} from "./services/process-manager.js";
import {
  ClaudeCodeNotFoundError,
  ClaudeCodeCancelledError,
  WorkingDirectoryError,
  ClaudeCodeTimeoutError,
  checkClaudeCodeAvailability,
} from "./services/claude-code-runner.js";
import type { ProgressCallback } from "./types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type TextContent = { type: "text"; text: string };
type ToolResult = { content: TextContent[]; isError?: boolean };

function formatError(err: unknown): ToolResult {
  let message: string;

  if (err instanceof ClaudeCodeNotFoundError) {
    message =
      `**Claude Code CLI Not Found**\n\n${err.message}\n\n` +
      "Troubleshooting:\n" +
      "- Ensure `claude` is installed globally (`npm i -g @anthropic-ai/claude-code`)\n" +
      "- Or set `CLAUDE_CODE_PATH` env var in your mcp.json to the full path";
  } else if (err instanceof WorkingDirectoryError) {
    message =
      `**Invalid Working Directory**\n\n${err.message}\n\n` +
      "Make sure the `workingDirectory` parameter is an absolute path to an existing directory.";
  } else if (err instanceof ClaudeCodeTimeoutError) {
    message =
      `**Task Timed Out**\n\n${err.message}\n\n` +
      "Tips:\n" +
      "- Break the task into smaller sub-tasks\n" +
      "- Use `agent_plan_task` first, then execute steps individually\n" +
      "- Reduce `maxTurns` to limit scope";
  } else if (err instanceof ClaudeCodeCancelledError) {
    message = "**Task Cancelled**\n\nThe task was cancelled before completion.";
  } else if (err instanceof Error) {
    message = `**Error**\n\n${err.message}`;
  } else {
    message = `**Error**\n\n${String(err)}`;
  }

  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

function jsonContent(data: unknown): ToolResult {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

/**
 * Build a progress callback that sends MCP progress notifications
 * back to the client (Cursor) via the tool handler's extra.sendNotification.
 */
function makeProgressCallback(
  sendNotification: (notification: ServerNotification) => Promise<void>,
  progressToken: string | number | undefined,
): ProgressCallback | undefined {
  if (!progressToken) return undefined;

  return async (progress: number, total: number, message: string) => {
    try {
      await sendNotification({
        method: "notifications/progress" as const,
        params: {
          progressToken,
          progress,
          total,
          message,
        },
      });
    } catch {
      // Notification failures are non-fatal
    }
  };
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new McpServer(
  { name: SERVER_NAME, version: SERVER_VERSION },
  {
    instructions:
      "This MCP server delegates coding tasks to Claude Code CLI. " +
      "It can execute tasks, plan implementations, review code, debug errors, " +
      "run commands, and continue previous conversations. " +
      "Requires Claude Code CLI installed and authenticated via Claude Max subscription.",
  },
);

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

server.registerResource(
  "server_status",
  "claude-agent://status",
  {
    description: "Current status of the Claude Agent MCP server",
    mimeType: "application/json",
  },
  async () => {
    const { available, version } = checkClaudeCodeAvailability();
    const status = {
      status: available ? (getActiveProcessCount() > 0 ? "busy" : "ready") : "error",
      activeTaskCount: getActiveProcessCount(),
      claudeCodeAvailable: available,
      claudeCodeVersion: version,
      serverVersion: SERVER_VERSION,
    };
    return {
      contents: [
        {
          uri: "claude-agent://status",
          mimeType: "application/json",
          text: JSON.stringify(status, null, 2),
        },
      ],
    };
  },
);

// ---------------------------------------------------------------------------
// Prompts — appear in Cursor's / autocomplete
// ---------------------------------------------------------------------------

server.registerPrompt(
  "build_feature",
  {
    title: "Build a Feature",
    description: "Have Claude Code build a complete feature end-to-end",
    argsSchema: {
      feature: z.string().describe("Description of the feature to build"),
      directory: z.string().describe("Project directory (absolute path)"),
    },
  },
  (args) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `Use the agent_execute_task tool to build the following feature in ${args.directory}:\n\n` +
            `${args.feature}\n\n` +
            "Make sure all files are created, dependencies are installed, and tests pass.",
        },
      },
    ],
  }),
);

server.registerPrompt(
  "review_project",
  {
    title: "Review Project Code",
    description: "Have Claude Code do a full code review",
    argsSchema: {
      target: z.string().describe("File, directory, or area to review"),
      directory: z.string().describe("Project directory (absolute path)"),
    },
  },
  (args) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `Use the agent_review_code tool to review "${args.target}" in ${args.directory}. ` +
            "Focus on all aspects: bugs, performance, security, and readability.",
        },
      },
    ],
  }),
);

server.registerPrompt(
  "fix_error",
  {
    title: "Fix an Error",
    description: "Have Claude Code diagnose and fix an error",
    argsSchema: {
      error: z.string().describe("Error message or stack trace"),
      directory: z.string().describe("Project directory (absolute path)"),
    },
  },
  (args) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `Use the agent_debug tool with autoFix=true to fix this error in ${args.directory}:\n\n` +
            `\`\`\`\n${args.error}\n\`\`\``,
        },
      },
    ],
  }),
);

server.registerPrompt(
  "plan_then_execute",
  {
    title: "Plan Then Execute",
    description: "First plan an approach, then execute it step by step",
    argsSchema: {
      task: z.string().describe("What you want to build or change"),
      directory: z.string().describe("Project directory (absolute path)"),
    },
  },
  (args) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text:
            `First, use the agent_plan_task tool to create a plan for the following task in ${args.directory}:\n\n` +
            `${args.task}\n\n` +
            "After reviewing the plan, use agent_execute_task to implement it step by step.",
        },
      },
    ],
  }),
);

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

// --- agent_execute_task ---
server.registerTool(
  "agent_execute_task",
  {
    title: "Execute Coding Task",
    description:
      "Send a coding task to Claude Code for autonomous execution. " +
      "Claude Code will plan, write code, edit files, run commands, and verify results. " +
      "Best for multi-step tasks like building features, refactoring, or setting up projects. " +
      "Returns a summary with files created/modified and commands run.",
    inputSchema: executeTaskSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (args, extra) => {
    try {
      const onProgress = makeProgressCallback(
        extra.sendNotification.bind(extra),
        extra._meta?.progressToken,
      );
      const result = await executeTask(args, onProgress, extra.signal);
      return jsonContent(result);
    } catch (err) {
      return formatError(err);
    }
  },
);

// --- agent_plan_task ---
server.registerTool(
  "agent_plan_task",
  {
    title: "Plan Coding Task",
    description:
      "Ask Claude Code to create a detailed step-by-step plan for a task WITHOUT executing it. " +
      "Returns numbered steps, files to create/modify, and dependencies needed. " +
      "Use this before agent_execute_task to review the approach first. " +
      "No files are created or modified — completely read-only.",
    inputSchema: planTaskSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (args, extra) => {
    try {
      const onProgress = makeProgressCallback(
        extra.sendNotification.bind(extra),
        extra._meta?.progressToken,
      );
      const result = await planTask(args, onProgress, extra.signal);
      return jsonContent(result);
    } catch (err) {
      return formatError(err);
    }
  },
);

// --- agent_review_code ---
server.registerTool(
  "agent_review_code",
  {
    title: "Review Code",
    description:
      "Ask Claude Code to review code for bugs, performance issues, security vulnerabilities, " +
      "or readability problems. Specify a file, directory, or description as the target. " +
      "Returns structured issues with severity levels and a quality score. " +
      "Read-only — no files are modified.",
    inputSchema: reviewCodeSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (args, extra) => {
    try {
      const onProgress = makeProgressCallback(
        extra.sendNotification.bind(extra),
        extra._meta?.progressToken,
      );
      const result = await reviewCode(args, onProgress, extra.signal);
      return jsonContent(result);
    } catch (err) {
      return formatError(err);
    }
  },
);

// --- agent_debug ---
server.registerTool(
  "agent_debug",
  {
    title: "Debug Error",
    description:
      "Send an error message, stack trace, or bug description to Claude Code for diagnosis. " +
      "Set autoFix=true to have Claude Code automatically apply the fix. " +
      "Set autoFix=false (default) for diagnosis only — no files modified. " +
      "Optionally provide relatedFiles to narrow the search scope.",
    inputSchema: debugSchema,
    annotations: {
      readOnlyHint: false, // depends on autoFix, but conservatively mark as read-write
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (args, extra) => {
    try {
      const onProgress = makeProgressCallback(
        extra.sendNotification.bind(extra),
        extra._meta?.progressToken,
      );
      const result = await debugError(args, onProgress, extra.signal);
      return jsonContent(result);
    } catch (err) {
      return formatError(err);
    }
  },
);

// --- agent_run_and_verify ---
server.registerTool(
  "agent_run_and_verify",
  {
    title: "Run and Verify Command",
    description:
      "Run a shell command (npm test, npm run build, etc.) and have Claude Code interpret the results. " +
      "Set fixOnFailure=true to have Claude Code automatically fix issues and re-run. " +
      "Set fixOnFailure=false (default) to only get an interpretation of what went wrong. " +
      "Provide successCriteria to define what a successful run looks like.",
    inputSchema: runAndVerifySchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (args, extra) => {
    try {
      const onProgress = makeProgressCallback(
        extra.sendNotification.bind(extra),
        extra._meta?.progressToken,
      );
      const result = await runAndVerify(args, onProgress, extra.signal);
      return jsonContent(result);
    } catch (err) {
      return formatError(err);
    }
  },
);

// --- agent_continue ---
server.registerTool(
  "agent_continue",
  {
    title: "Continue Task",
    description:
      "Continue a previous Claude Code task with additional instructions. " +
      "Uses Claude Code's conversation continuation (--continue flag) to pick up context " +
      "from the last task in the same working directory. " +
      "Ideal for iterative work: build a feature, then add tests, then add docs.",
    inputSchema: continueSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: false,
    },
  },
  async (args, extra) => {
    try {
      const onProgress = makeProgressCallback(
        extra.sendNotification.bind(extra),
        extra._meta?.progressToken,
      );
      const result = await continueTask(args, onProgress, extra.signal);
      return jsonContent(result);
    } catch (err) {
      return formatError(err);
    }
  },
);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();

  // Clean up child processes on exit
  const cleanup = () => {
    cleanupAllProcesses();
  };
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });
  process.on("exit", cleanup);

  // Log to stderr (stdout is reserved for MCP protocol)
  const { available, version } = checkClaudeCodeAvailability();
  if (available) {
    process.stderr.write(`[${SERVER_NAME}] v${SERVER_VERSION} starting — Claude Code ${version}\n`);
  } else {
    process.stderr.write(
      `[${SERVER_NAME}] v${SERVER_VERSION} starting — WARNING: Claude Code CLI not found.\n` +
        "Tools will return errors until claude is available on PATH.\n",
    );
  }

  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Failed to start ${SERVER_NAME}: ${err}\n`);
  process.exit(1);
});
