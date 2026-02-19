import { z } from "zod";

export const executeTaskSchema = {
  task: z
    .string()
    .min(1)
    .describe("Natural language description of the coding task to execute"),
  workingDirectory: z
    .string()
    .min(1)
    .describe("Absolute path to the project directory"),
  allowedTools: z
    .array(z.string())
    .optional()
    .describe("Claude Code tools to allow (e.g. Read, Write, Edit, Bash)"),
  maxTurns: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum number of agentic turns (default: 50)"),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Timeout in milliseconds (default: 300000)"),
};

export const planTaskSchema = {
  task: z.string().min(1).describe("What needs to be done"),
  workingDirectory: z
    .string()
    .min(1)
    .describe("Absolute path to the project directory for context"),
  context: z
    .string()
    .optional()
    .describe("Additional context about the project or requirements"),
};

export const reviewCodeSchema = {
  target: z
    .string()
    .min(1)
    .describe("File path, directory, or description of what to review"),
  workingDirectory: z
    .string()
    .min(1)
    .describe("Absolute path to the project directory"),
  focus: z
    .enum(["bugs", "performance", "security", "readability", "all"])
    .default("all")
    .describe("What aspect to focus the review on"),
};

export const debugSchema = {
  error: z
    .string()
    .min(1)
    .describe("Error message, stack trace, or bug description"),
  workingDirectory: z
    .string()
    .min(1)
    .describe("Absolute path to the project directory"),
  autoFix: z
    .boolean()
    .default(false)
    .describe("Whether to automatically apply the fix"),
  relatedFiles: z
    .array(z.string())
    .optional()
    .describe("File paths related to the bug"),
};

export const runAndVerifySchema = {
  command: z
    .string()
    .min(1)
    .describe('Command to run (e.g. "npm test", "npm run build")'),
  workingDirectory: z
    .string()
    .min(1)
    .describe("Absolute path to the project directory"),
  successCriteria: z
    .string()
    .optional()
    .describe("What success looks like"),
  fixOnFailure: z
    .boolean()
    .default(false)
    .describe("Attempt to fix and re-run on failure"),
};

export const continueSchema = {
  instruction: z
    .string()
    .min(1)
    .describe("Follow-up instruction for the task"),
  workingDirectory: z
    .string()
    .min(1)
    .describe("Absolute path to the project directory"),
  resumeConversation: z
    .boolean()
    .default(true)
    .describe("Whether to continue the last conversation"),
};

export const querySchema = {
  prompt: z
    .string()
    .min(1)
    .describe(
      "Any question, request, or instruction. This is the catch-all — " +
      "use it for anything: code questions, explanations, generation, " +
      "refactoring, analysis, writing tests, or any other task."
    ),
  workingDirectory: z
    .string()
    .min(1)
    .describe("Absolute path to the project directory for context"),
  mode: z
    .enum(["read", "edit", "agent"])
    .default("agent")
    .describe(
      "Execution mode: " +
      "'read' = only read files, no modifications (cheapest); " +
      "'edit' = can read and edit files but no shell commands; " +
      "'agent' = full autonomy with all tools (default)"
    ),
  maxTurns: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Maximum agentic turns (default: 50 for agent, 10 for read/edit)"),
  timeout: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("Timeout in milliseconds (default: 300000)"),
};
