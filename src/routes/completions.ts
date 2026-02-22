import type { Request, Response } from "express";
import { runClaudeCode } from "../services/claude-code-runner.js";
import { DEFAULT_TIMEOUT } from "../constants.js";
import {
  messagesToPrompt,
  buildCompletion,
  buildChunk,
  buildError,
  generateId,
  type OpenAIChatRequest,
} from "../utils/openai-format.js";
import { initSSE, sendChunk, sendDone, splitIntoStreamChunks } from "../utils/sse.js";

/**
 * Extract the result text from Claude Code's JSON output.
 */
function extractResult(stdout: string): string {
  try {
    const parsed = JSON.parse(stdout);
    return parsed.result || stdout;
  } catch {
    return stdout;
  }
}

/**
 * POST /v1/chat/completions
 *
 * Accepts an OpenAI-compatible chat completion request, proxies it to
 * Claude Code CLI, and returns the response in OpenAI format.
 */
export async function completionsHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as OpenAIChatRequest;

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    res.status(400).json(buildError("messages array is required and must not be empty", "invalid_request_error", "invalid_messages"));
    return;
  }

  const prompt = messagesToPrompt(body.messages);
  const stream = body.stream === true;
  const timeout = Number(process.env.REQUEST_TIMEOUT) || DEFAULT_TIMEOUT;
  const workingDirectory = (req.headers["x-working-directory"] as string) || process.cwd();

  // Set up abort handling — kill Claude if client disconnects
  const controller = new AbortController();
  req.on("close", () => controller.abort());

  const startTime = Date.now();

  try {
    const result = await runClaudeCode({
      prompt,
      workingDirectory,
      timeout,
      signal: controller.signal,
    });

    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.exitCode !== 0 && !result.stdout) {
      const errMsg = result.timedOut
        ? `Claude Code timed out after ${timeout}ms`
        : `Claude Code process exited with code ${result.exitCode}: ${result.stderr.slice(0, 500)}`;
      const status = result.timedOut ? 504 : 502;

      if (stream) {
        initSSE(res);
        const id = generateId();
        sendChunk(res, buildChunk(id, errMsg, "stop", true));
        sendDone(res);
      } else {
        res.status(status).json(buildError(errMsg));
      }

      process.stderr.write(
        `[${new Date().toLocaleTimeString()}] POST /v1/chat/completions — ${status} — ${durationSec}s\n`,
      );
      return;
    }

    const content = extractResult(result.stdout);

    if (!stream) {
      // --- Non-streaming response ---
      res.json(buildCompletion(content));
    } else {
      // --- Streaming response (SSE) ---
      initSSE(res);
      const id = generateId();

      // First chunk with the role
      sendChunk(res, buildChunk(id, "", null, true));

      // Split content into word-level chunks for streaming feel
      const chunks = splitIntoStreamChunks(content);
      for (const text of chunks) {
        if (controller.signal.aborted) break;
        sendChunk(res, buildChunk(id, text, null));
      }

      // Final chunk
      sendChunk(res, buildChunk(id, undefined, "stop"));
      sendDone(res);
    }

    process.stderr.write(
      `[${new Date().toLocaleTimeString()}] POST /v1/chat/completions — 200 — ${durationSec}s\n`,
    );
  } catch (err) {
    const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);
    const message = err instanceof Error ? err.message : String(err);

    if (stream && !res.headersSent) {
      initSSE(res);
      const id = generateId();
      sendChunk(res, buildChunk(id, `Error: ${message}`, "stop", true));
      sendDone(res);
    } else if (!res.headersSent) {
      res.status(500).json(buildError(message));
    }

    process.stderr.write(
      `[${new Date().toLocaleTimeString()}] POST /v1/chat/completions — 500 — ${durationSec}s — ${message}\n`,
    );
  }
}
