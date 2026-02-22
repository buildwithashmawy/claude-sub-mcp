import type { Response } from "express";
import type { OpenAIChatCompletionChunk } from "./openai-format.js";

/**
 * Set up an Express response for Server-Sent Events streaming.
 */
export function initSSE(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
  res.flushHeaders();
}

/**
 * Write a single SSE chunk to the response.
 */
export function sendChunk(res: Response, chunk: OpenAIChatCompletionChunk): void {
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}

/**
 * Write the final [DONE] sentinel and end the response.
 */
export function sendDone(res: Response): void {
  res.write("data: [DONE]\n\n");
  res.end();
}

/**
 * Split text into word-level chunks for a streaming feel.
 * Returns an array of strings, each a few words long.
 */
export function splitIntoStreamChunks(text: string, wordsPerChunk = 3): string[] {
  const words = text.split(/(\s+)/); // preserve whitespace
  const chunks: string[] = [];
  let current = "";
  let wordCount = 0;

  for (const token of words) {
    current += token;
    // Only count non-whitespace tokens as words
    if (token.trim()) wordCount++;
    if (wordCount >= wordsPerChunk) {
      chunks.push(current);
      current = "";
      wordCount = 0;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
