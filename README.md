# Claude Code MCP Server for Cursor

An MCP server that routes **all** Cursor IDE requests to [Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code), powered by your Claude Max subscription. Instead of burning Cursor's built-in AI credits, every question, code edit, and debug session is handled by Claude Code with full agentic capabilities.

## How It Works

```
Cursor IDE  ──MCP──▶  This Server  ──spawns──▶  Claude Code CLI
                          │
                    7 specialized tools
```

Cursor talks to this MCP server over stdio. Each tool call spawns `claude` as a subprocess with the right flags, collects the JSON output, and returns structured results back to Cursor.

## Prerequisites

- **Node.js** 18+
- **Claude Code CLI** installed and authenticated (`claude --version` should work)
- **Claude Max subscription** (Claude Code requires it)
- **Cursor IDE** 0.45+

## Installation

```bash
git clone https://github.com/buildwithashmawy/claude-sub-mcp.git
cd claude-sub-mcp
npm install
npm run build
```

Verify it works:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' \
  | node dist/index.js 2>/dev/null
```

You should see a JSON response with `"serverInfo"` and 3 capabilities (tools, resources, prompts).

## Cursor Setup

### Step 1: Find Your Paths

Cursor runs MCP servers in an isolated environment with **no shell PATH**. You need absolute paths:

```bash
which node    # e.g. /usr/local/bin/node
which claude  # e.g. /usr/local/bin/claude
```

### Step 2: Add the MCP Server (Global)

Open Cursor **Settings > MCP** and add a new global server, or edit `~/.cursor/mcp.json` directly:

```json
{
  "mcpServers": {
    "claude-agent": {
      "command": "/usr/local/bin/node",
      "args": ["/absolute/path/to/claude-sub-mcp/dist/index.js"],
      "env": {
        "CLAUDE_CODE_PATH": "/usr/local/bin/claude",
        "PATH": "/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

Replace the paths with the output from Step 1.

> **Important**: All three paths must be absolute — `"node"` and `"claude"` alone will fail with `"No server info found"`.

### Step 3: Add Global Delegation Rules

To make Cursor route **everything** through Claude Code automatically, add a global rule.

Go to **Cursor Settings > General > Rules for AI** and paste the contents of [`cursor-config/cursor-rules.md`](cursor-config/cursor-rules.md).

This tells Cursor's built-in model to always delegate to the MCP tools instead of answering directly.

### Step 4: Verify

Restart Cursor (or toggle the MCP server off/on in Settings > MCP). You should see a **green dot** next to "claude-agent". Open a chat and ask anything — it should be routed through Claude Code.

## Tools

The server exposes 7 tools that Cursor can call:

| Tool | Purpose | Mode |
|------|---------|------|
| `agent_query` | **Catch-all** — questions, code gen, explanations, anything | read / edit / agent |
| `agent_execute_task` | Execute multi-step coding tasks autonomously | agent |
| `agent_plan_task` | Create a step-by-step plan without executing | read-only |
| `agent_review_code` | Review code for bugs, perf, security, readability | read-only |
| `agent_debug` | Diagnose errors, optionally auto-fix | read-only or agent |
| `agent_run_and_verify` | Run commands and interpret results, optionally fix | read-only or agent |
| `agent_continue` | Continue a previous Claude Code conversation | agent |

### `agent_query` (Primary Tool)

The default tool for any request. Supports three modes:

- **`read`** — Only reads files, no modifications (cheapest)
- **`edit`** — Can read and edit files, no shell commands
- **`agent`** — Full autonomy: read, write, shell, web search (default)

```
prompt: "Explain how authentication works in this project"
workingDirectory: "/path/to/project"
mode: "read"
```

## Prompts

The server also registers MCP prompts that appear in Cursor's `/` autocomplete:

- `/build_feature` — Build a complete feature end-to-end
- `/review_project` — Full code review of a target
- `/fix_error` — Diagnose and fix an error
- `/plan_then_execute` — Plan first, then execute step by step

## Resources

- `claude-agent://status` — Server health: active task count, Claude Code availability, version info

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `CLAUDE_CODE_PATH` | `claude` | Absolute path to the Claude Code CLI binary |

## Troubleshooting

### "No server info found"

Cursor can't complete the MCP handshake. Almost always caused by relative paths in `mcp.json`. Use absolute paths for `command`, `args[0]`, and `CLAUDE_CODE_PATH`.

### Server starts but tools don't work

Check that `claude --version` works from the same environment. If `CLAUDE_CODE_PATH` is wrong, the server will start but every tool call will fail with "Claude Code CLI not found".

### Tools time out

Default timeout is 5 minutes. For large tasks, pass a higher `timeout` parameter (in milliseconds) to the tool call. Claude Code itself has no timeout — only this server does.

## License

MIT
