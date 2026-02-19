export const DEFAULT_MAX_TURNS = 50;
export const DEFAULT_TIMEOUT = 300_000; // 5 minutes
export const PLAN_TIMEOUT = 120_000; // 2 minutes
export const REVIEW_TIMEOUT = 180_000; // 3 minutes

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

export const CLAUDE_COMMAND = "claude";
