export interface ClaudeCodeRunnerOptions {
  prompt: string;
  workingDirectory: string;
  allowedTools?: string[];
  maxTurns?: number;
  timeout?: number;
  continueConversation?: boolean;
  outputFormat?: "json" | "text";
}

export interface ClaudeCodeResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface ExecuteTaskOutput {
  summary: string;
  filesCreated: string[];
  filesModified: string[];
  commandsRun: string[];
  success: boolean;
  rawOutput: string;
}

export interface PlanTaskOutput {
  plan: string;
  steps: string[];
  estimatedFiles: string[];
}

export interface ReviewIssue {
  severity: "critical" | "warning" | "info";
  file: string;
  line: string;
  description: string;
  suggestion: string;
}

export interface ReviewCodeOutput {
  summary: string;
  issues: ReviewIssue[];
  score: number;
}

export interface DebugOutput {
  diagnosis: string;
  rootCause: string;
  fix: {
    description: string;
    filesModified: string[];
  };
  success: boolean;
}

export interface RunAndVerifyOutput {
  commandOutput: string;
  success: boolean;
  interpretation: string;
  fixApplied: boolean;
  fixDescription: string;
}

export interface ContinueOutput extends ExecuteTaskOutput {}
