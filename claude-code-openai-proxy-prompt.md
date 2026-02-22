# Claude Code OpenAI Proxy — Build Prompt

Create a Node.js + TypeScript project called `claude-code-openai-proxy` that acts as a local OpenAI-compatible API server which proxies all requests to Claude Code CLI.

## What it does

Cursor (or any OpenAI-compatible client) connects to `http://localhost:3456/v1/chat/completions`. This server receives the request, extracts the conversation, spawns `claude` CLI with it, and returns the response in OpenAI's chat completion format.

## Architecture

```
Cursor / Any OpenAI Client
    │
    │  POST /v1/chat/completions
    │  Authorization: Bearer <ignored>
    │
    ▼
Local Proxy Server (localhost:3456)
    │
    │  Extracts messages → builds prompt
    │  Spawns: claude -p "<prompt>" --output-format json --verbose
    │
    ▼
Claude Code CLI (uses your Claude Max subscription or API key)
    │
    ▼
Response translated back → OpenAI chat completion JSON format
```

- Express or Fastify HTTP server on a configurable port (default 3456)
- Implements these OpenAI-compatible endpoints:
  - `POST /v1/chat/completions` — main endpoint, supports both streaming (SSE) and non-streaming
  - `GET /v1/models` — returns a list with a single model `"claude-code"`
  - `GET /health` — simple health check

## POST /v1/chat/completions behavior

1. Receive standard OpenAI request body: `{ model, messages, stream, temperature, max_tokens }`
2. Extract the conversation from `messages` array — concatenate all messages into a single prompt for Claude Code, preserving role labels:

   ```
   User: How does auth work in this project?
   Assistant: The auth module uses JWT tokens stored in...
   User: Can you add refresh token support?
   ```

3. Spawn Claude Code CLI:

   ```bash
   claude -p "<prompt>" --output-format json --verbose
   ```

   - Use the `CLAUDE_CODE_PATH` env var for the claude binary path, default to `"claude"`
   - Working directory should come from an `X-Working-Directory` request header, or fall back to the cwd of the server
   - Pipe stdout and stderr

4. **If `stream: false`** — wait for Claude Code to finish, parse the JSON output, return a standard OpenAI chat completion response:

   ```json
   {
     "id": "chatcmpl-<uuid>",
     "object": "chat.completion",
     "created": 1234567890,
     "model": "claude-code",
     "choices": [
       {
         "index": 0,
         "message": {
           "role": "assistant",
           "content": "<claude's full response>"
         },
         "finish_reason": "stop"
       }
     ],
     "usage": {
       "prompt_tokens": 0,
       "completion_tokens": 0,
       "total_tokens": 0
     }
   }
   ```

5. **If `stream: true`** — stream the response as Server-Sent Events (SSE):
   - Read Claude Code's stderr line by line for progress
   - When Claude Code finishes, send the full response as SSE chunks (split by words or sentences for a streaming feel)
   - End with `data: [DONE]`
   - Each SSE chunk follows OpenAI's streaming format:

     ```json
     {
       "id": "chatcmpl-<uuid>",
       "object": "chat.completion.chunk",
       "created": 1234567890,
       "model": "claude-code",
       "choices": [
         {
           "index": 0,
           "delta": { "content": "<partial text>" },
           "finish_reason": null
         }
       ]
     }
     ```

   - The final chunk should have `"finish_reason": "stop"` and an empty delta `{}`

## Configuration

| Environment Variable | Default       | Description                                      |
|---------------------|---------------|--------------------------------------------------|
| `PORT`              | `3456`        | Port the server listens on                       |
| `HOST`              | `127.0.0.1`  | Bind address (localhost only for security)        |
| `CLAUDE_CODE_PATH`  | `claude`      | Absolute path to the Claude Code CLI binary       |
| `REQUEST_TIMEOUT`   | `300000`      | Request timeout in milliseconds (default 5 min)   |

## Project structure

```
claude-code-openai-proxy/
├── src/
│   ├── index.ts                  # Server entry point, route registration
│   ├── routes/
│   │   ├── completions.ts        # POST /v1/chat/completions handler
│   │   └── models.ts             # GET /v1/models handler
│   ├── services/
│   │   └── claude-runner.ts      # Spawns Claude Code CLI, manages process lifecycle
│   └── utils/
│       ├── openai-format.ts      # Helpers to build OpenAI-compatible response objects
│       └── sse.ts                # SSE streaming helpers
├── package.json
├── tsconfig.json
└── README.md
```

## Important implementation details

- The API key sent by Cursor in the `Authorization` header is **IGNORED** — Claude Code CLI handles its own auth (Claude Max subscription or API key)
- Support request cancellation — if the HTTP connection closes early, kill the spawned Claude Code subprocess immediately
- Add request timeout of 5 minutes (configurable via `REQUEST_TIMEOUT` env var in ms)
- Add proper error handling — if Claude Code fails, return an OpenAI-compatible error response:

  ```json
  {
    "error": {
      "message": "Claude Code process exited with code 1: <stderr>",
      "type": "server_error",
      "code": "claude_code_error"
    }
  }
  ```

- Add CORS headers (`Access-Control-Allow-Origin: *`) for local development
- Log every request to stderr: `[HH:MM:SS] POST /v1/chat/completions — 200 — 3.2s`
- Add a `bin` entry in `package.json` so it can be run with `npx claude-code-openai-proxy`
- Use `uuid` or `crypto.randomUUID()` for generating `chatcmpl-*` IDs

## README.md should explain

1. What this project does (one paragraph)
2. Install and build:

   ```bash
   git clone <repo>
   cd claude-code-openai-proxy
   npm install
   npm run build
   ```

3. Run the server:

   ```bash
   node dist/index.js
   # or
   npx claude-code-openai-proxy
   ```

4. Configure Cursor:
   - Go to **Cursor Settings > Models > Override OpenAI Base URL**
   - Set to `http://localhost:3456/v1`
   - Set any string as the API key (e.g. `sk-not-needed`) — it's ignored
   - Select `claude-code` as the model

5. Environment variables table
6. How it works (short architecture diagram)
