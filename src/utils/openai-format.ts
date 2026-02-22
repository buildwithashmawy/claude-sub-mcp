import { randomUUID } from "node:crypto";

export interface OpenAIChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenAIChatRequest {
  model?: string;
  messages: OpenAIChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface OpenAIChatCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    message: { role: "assistant"; content: string };
    finish_reason: "stop" | "length";
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface OpenAIChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: {
    index: number;
    delta: { role?: "assistant"; content?: string };
    finish_reason: "stop" | null;
  }[];
}

export interface OpenAIErrorResponse {
  error: {
    message: string;
    type: string;
    code: string;
  };
}

export interface OpenAIModelList {
  object: "list";
  data: {
    id: string;
    object: "model";
    created: number;
    owned_by: string;
  }[];
}

const MODEL_ID = "claude-code";

function generateId(): string {
  return `chatcmpl-${randomUUID()}`;
}

/**
 * Convert an array of OpenAI chat messages into a single prompt string
 * that preserves role labels for Claude Code.
 */
export function messagesToPrompt(messages: OpenAIChatMessage[]): string {
  return messages
    .map((m) => {
      switch (m.role) {
        case "system":
          return `System: ${m.content}`;
        case "user":
          return `User: ${m.content}`;
        case "assistant":
          return `Assistant: ${m.content}`;
        default:
          return m.content;
      }
    })
    .join("\n\n");
}

/**
 * Build a complete (non-streaming) OpenAI chat completion response.
 */
export function buildCompletion(content: string): OpenAIChatCompletion {
  return {
    id: generateId(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: MODEL_ID,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

/**
 * Build a single SSE chunk for streaming responses.
 */
export function buildChunk(
  id: string,
  content: string | undefined,
  finishReason: "stop" | null,
  includeRole = false,
): OpenAIChatCompletionChunk {
  const delta: { role?: "assistant"; content?: string } = {};
  if (includeRole) delta.role = "assistant";
  if (content !== undefined) delta.content = content;

  return {
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: MODEL_ID,
    choices: [
      {
        index: 0,
        delta,
        finish_reason: finishReason,
      },
    ],
  };
}

/**
 * Generate a new streaming response ID.
 */
export { generateId };

/**
 * Build an OpenAI-compatible error response.
 */
export function buildError(
  message: string,
  type = "server_error",
  code = "claude_code_error",
): OpenAIErrorResponse {
  return {
    error: { message, type, code },
  };
}

/**
 * Build the /v1/models response.
 */
export function buildModelList(): OpenAIModelList {
  return {
    object: "list",
    data: [
      {
        id: MODEL_ID,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "claude-code",
      },
    ],
  };
}
