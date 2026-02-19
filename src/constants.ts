export const SERVER_NAME = "claude-agent-mcp-server";
export const SERVER_VERSION = "1.1.0";

export const DEFAULT_MAX_TURNS = 50;
export const DEFAULT_TIMEOUT = 300_000; // 5 minutes — matches Cursor's hard limit
export const PLAN_TIMEOUT = 120_000; // 2 minutes
export const REVIEW_TIMEOUT = 180_000; // 3 minutes
export const PROGRESS_INTERVAL_MS = 5_000; // Report progress every 5s

export const ALL_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "TodoRead",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
  "NotebookEdit",
];

export const READ_ONLY_TOOLS = ["Read", "Glob", "Grep"];

export const DIAGNOSTIC_TOOLS = ["Bash", "Read", "Glob", "Grep"];

export const CLAUDE_COMMAND = process.env.CLAUDE_CODE_PATH || "claude";
