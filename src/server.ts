#!/usr/bin/env node

import express from "express";
import { SERVER_NAME, SERVER_VERSION } from "./constants.js";
import { checkClaudeCodeAvailability } from "./services/claude-code-runner.js";
import { cleanupAllProcesses } from "./services/process-manager.js";
import { completionsHandler } from "./routes/completions.js";
import { modelsHandler } from "./routes/models.js";

const PORT = Number(process.env.PORT) || 3456;
const HOST = process.env.HOST || "127.0.0.1";

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

// Parse JSON bodies
app.use(express.json({ limit: "10mb" }));

// CORS for local development
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Working-Directory");
  if (_req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

// Health check
app.get("/health", (_req, res) => {
  const { available, version } = checkClaudeCodeAvailability();
  res.json({
    status: available ? "ok" : "degraded",
    server: SERVER_NAME,
    version: SERVER_VERSION,
    claudeCode: { available, version },
  });
});

// OpenAI-compatible endpoints
app.get("/v1/models", modelsHandler);
app.post("/v1/chat/completions", completionsHandler);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const cleanup = () => {
  cleanupAllProcesses();
};
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("SIGTERM", () => { cleanup(); process.exit(0); });
process.on("exit", cleanup);

const { available, version } = checkClaudeCodeAvailability();

const server = app.listen(PORT, HOST, () => {
  process.stderr.write(
    `[${SERVER_NAME}] v${SERVER_VERSION} OpenAI-compatible server\n` +
    `  Listening on http://${HOST}:${PORT}\n` +
    `  Claude Code: ${available ? version : "NOT FOUND — tools will fail"}\n` +
    `\n` +
    `  Endpoints:\n` +
    `    POST http://${HOST}:${PORT}/v1/chat/completions\n` +
    `    GET  http://${HOST}:${PORT}/v1/models\n` +
    `    GET  http://${HOST}:${PORT}/health\n` +
    `\n` +
    `  Set your OpenAI base URL to: http://${HOST}:${PORT}/v1\n`,
  );
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    process.stderr.write(`Port ${PORT} is already in use. Set PORT env var to use a different port.\n`);
  } else {
    process.stderr.write(`Server error: ${err.message}\n`);
  }
  process.exit(1);
});
