#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
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
import { cleanupAllProcesses } from "./services/process-manager.js";
import {
  ClaudeCodeNotFoundError,
  WorkingDirectoryError,
  ClaudeCodeTimeoutError,
} from "./services/claude-code-runner.js";

function formatError(err: unknown): { content: Array<{ type: "text"; text: string }>; isError: true } {
  let message: string;

  if (err instanceof ClaudeCodeNotFoundError) {
    message = `[Claude Code Not Found] ${err.message}`;
  } else if (err instanceof WorkingDirectoryError) {
    message = `[Invalid Directory] ${err.message}`;
  } else if (err instanceof ClaudeCodeTimeoutError) {
    message = `[Timeout] ${err.message}`;
  } else if (err instanceof Error) {
    message = `[Error] ${err.message}`;
  } else {
    message = `[Error] ${String(err)}`;
  }

  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

function jsonContent(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

const server = new McpServer({
  name: "claude-agent-mcp-server",
  version: "1.0.0",
});

// --- agent_execute_task ---
server.registerTool(
  "agent_execute_task",
  {
    title: "Execute Coding Task",
    description:
      "Send a coding task to Claude Code for execution. Claude Code will plan, write code, " +
      "edit files, run commands, and verify results autonomously.",
    inputSchema: executeTaskSchema,
  },
  async (args) => {
    try {
      const result = await executeTask(args);
      return jsonContent(result);
    } catch (err) {
      return formatError(err);
    }
  }
);

// --- agent_plan_task ---
server.registerTool(
  "agent_plan_task",
  {
    title: "Plan Coding Task",
    description:
      "Ask Claude Code to create a detailed step-by-step plan for a task WITHOUT executing it. " +
      "Useful for reviewing an approach before committing to it.",
    inputSchema: planTaskSchema,
  },
  async (args) => {
    try {
      const result = await planTask(args);
      return jsonContent(result);
    } catch (err) {
      return formatError(err);
    }
  }
);

// --- agent_review_code ---
server.registerTool(
  "agent_review_code",
  {
    title: "Review Code",
    description:
      "Ask Claude Code to review code in the project. Can focus on bugs, performance, " +
      "security, readability, or all aspects. Returns structured issues with severity levels.",
    inputSchema: reviewCodeSchema,
  },
  async (args) => {
    try {
      const result = await reviewCode(args);
      return jsonContent(result);
    } catch (err) {
      return formatError(err);
    }
  }
);

// --- agent_debug ---
server.registerTool(
  "agent_debug",
  {
    title: "Debug Error",
    description:
      "Send an error or bug to Claude Code for diagnosis. Can optionally auto-fix the issue. " +
      "Provide the error message, stack trace, or bug description.",
    inputSchema: debugSchema,
  },
  async (args) => {
    try {
      const result = await debugError(args);
      return jsonContent(result);
    } catch (err) {
      return formatError(err);
    }
  }
);

// --- agent_run_and_verify ---
server.registerTool(
  "agent_run_and_verify",
  {
    title: "Run and Verify Command",
    description:
      "Run a command (e.g. npm test, npm run build) and have Claude Code interpret the results. " +
      "Can optionally attempt to fix issues if the command fails.",
    inputSchema: runAndVerifySchema,
  },
  async (args) => {
    try {
      const result = await runAndVerify(args);
      return jsonContent(result);
    } catch (err) {
      return formatError(err);
    }
  }
);

// --- agent_continue ---
server.registerTool(
  "agent_continue",
  {
    title: "Continue Task",
    description:
      "Continue a previous task with additional instructions. Uses Claude Code's conversation " +
      "continuation to pick up where the last task left off.",
    inputSchema: continueSchema,
  },
  async (args) => {
    try {
      const result = await continueTask(args);
      return jsonContent(result);
    } catch (err) {
      return formatError(err);
    }
  }
);

// --- Start server ---
async function main(): Promise<void> {
  const transport = new StdioServerTransport();

  // Clean up child processes on exit
  process.on("SIGINT", () => {
    cleanupAllProcesses();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanupAllProcesses();
    process.exit(0);
  });
  process.on("exit", () => {
    cleanupAllProcesses();
  });

  await server.connect(transport);
}

main().catch((err) => {
  console.error("Failed to start claude-agent-mcp-server:", err);
  process.exit(1);
});
