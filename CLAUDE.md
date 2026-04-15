# CLAUDE.md — sur-node-v2

Read this first. It will orient you completely without needing to read the source files.

## What This Repo Is

SurStor v2 is a thin MCP server that gives Claude sessions persistent, cross-client memory backed by a local Covia venue. It replaces sur-node v1 (DLFS-backed, data loss on restart).

Two files. That's the whole thing:
- `surstor.mjs` — 8 core functions (snap/get/list/link/links/memory/export/tree)
- `mcp-server.mjs` — wraps those 8 functions as MCP tools over stdio

## What's Running Where

| Service | URL | What It Is |
|---------|-----|-----------|
| Covia venue | `http://localhost:8090` | The actual data store — start this first |
| sur-node v1 | via MCP stdio | Legacy DLFS-backed server, still in Claude Desktop |
| sur-node-v2 | via MCP stdio | This repo — Covia-backed, the active one |

## File Map

```
surstor.mjs        ← core library — edit this to change behavior
mcp-server.mjs     ← MCP server — edit this to add/change tools
test-all.mjs       ← integration test — run this to verify everything works
package.json       ← two deps: @covia/covia-sdk, @modelcontextprotocol/sdk
CLAUDE.md          ← this file
README.md          ← human-facing docs / GitHub
ARCHITECTURE.md    ← deep dive on Covia workspace internals
OPERATIONS.md      ← runbook: starting services, troubleshooting
```

## Common Tasks

### Verify everything is working
```bash
node test-all.mjs
```
Should produce: snap hashes, a get result, a list, a link, and sur_memory output. No errors.

### Test the MCP server in isolation
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node mcp-server.mjs
```
Should return all 6 tools.

### Check Covia is running
```bash
curl http://localhost:8090/api/v1/status
```

### Snap the current session
Call `sur_snap` via MCP, or from code:
```js
import { sur_snap } from './surstor.mjs';
const { hash } = await sur_snap('my-label', 'summary of what happened', ['tag1', 'tag2']);
```

### Retrieve a snap by hash
```js
import { sur_get } from './surstor.mjs';
const content = await sur_get('sha256:...');
```

## Key Decisions Already Made

- **Paths use `w/` namespace** — Covia workspace requires `w/` prefix. All paths are `w/surstor/...`
- **`session-snapshot` tag is always injected** — `sur_snap` adds it automatically so `sur_memory` always finds everything
- **No DLFS, no SQLite, no REST server** — pure Covia lattice storage
- **`COVIA_URL` env var** — defaults to `http://localhost:8090`, override in claude_desktop_config.json

## Claude Desktop Config Entry

Located at:
`C:\Users\rich\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`

```json
"sur-node-v2": {
  "command": "node",
  "args": ["C:/Users/rich/PROJECTS/sur-v2/mcp-server.mjs"],
  "env": {
    "COVIA_URL": "http://localhost:8090"
  }
}
```

## What NOT to Change

- Don't rename the workspace paths (`w/surstor/...`) — existing snaps will become unreachable
- Don't remove the `session-snapshot` auto-inject — `sur_memory` depends on it
- Don't switch from ES modules (`.mjs`) — Covia SDK requires ESM

## Owner Context

- Rich Kopcho, Paisley LLC / SDK Co LLC, Northern Colorado
- Covia invented by Mike Anderson (CTO/architect)
- Part of the SurStor / AAA Framework / Cumulative Computing stack
- Related projects: sur-node (v1), Paisley, ACE Credits, MLSpy, 970.re
