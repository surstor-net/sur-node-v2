# CLAUDE.md — sur-node-v2

Read this first. It will orient you completely without needing to read the source files.

## What This Repo Is

SurStor v2 is a thin MCP server that gives Claude sessions persistent, durable memory backed by a local SQLite database. No external services, no daemons, no Covia.

Two files do everything:
- `surstor.mjs` — 10 core functions (snap/get/list/link/links/memory/export/capture/ls/tree)
- `mcp-server.mjs` — wraps those 10 functions as MCP tools over stdio

## Storage Architecture

```
Claude (MCP call)
  → mcp-server.mjs (tool handler)
    → surstor.mjs
      → surstor.db (SQLite, same directory)
```

**SQLite is the only store.** Data survives reboots. No external service required.

## File Map

```
surstor.mjs        ← core library — edit this to change behavior
mcp-server.mjs     ← MCP server — edit this to add/change tools
test-all.mjs       ← integration test — run this to verify everything works
surstor.db         ← your data (auto-created on first snap)
package.json       ← one dep: better-sqlite3 + @modelcontextprotocol/sdk
CLAUDE.md          ← this file
README.md          ← human-facing docs / GitHub
```

## Key Decisions

- **SQLite is the source of truth** — `surstor.db` in the repo dir, durable across reboots
- **No external services** — Covia removed entirely; nothing to start or manage
- **`session-snapshot` tag always injected** — `sur_snap` adds it automatically so `sur_memory` always finds sessions
- **Content-addressed** — same content always produces the same sha256 hash (idempotent snaps)

## Common Tasks

### Verify everything is working
```bash
npm test
```
Should produce snap hashes, a get result, a list, a link, and `sur_memory` output. No errors.

### Test the MCP server in isolation
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node mcp-server.mjs
```
Should return all 10 tools.

### Snap the current session
Call `sur_snap` via MCP, or from code:
```js
import { sur_snap } from './surstor.mjs';
const { hash } = await sur_snap('my-label', 'summary of what happened', ['tag1', 'tag2']);
```

## Claude Desktop Config Entry (Windows)

File location:
`C:\Users\rich\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`

```json
"sur-node-v2": {
  "command": "node",
  "args": ["C:/Users/rich/PROJECTS/sur-v2/mcp-server.mjs"]
}
```

No `env` block needed — Covia is gone.

## What NOT to Change

- Don't rename `surstor.db` without updating the path in `surstor.mjs` line 8
- Don't remove the `session-snapshot` auto-inject — `sur_memory` depends on it
- Don't switch from ES modules (`.mjs`) — `@modelcontextprotocol/sdk` requires ESM

## Owner Context

- Rich Kopcho, Paisley LLC / SDK Co LLC, Northern Colorado
- Part of the SurStor / AAA Framework / Cumulative Computing stack
- Related projects: Paisley wallet, MLSpy, 970.re, Winnow
