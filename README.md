# sur-node-v2

**SurStor v2** — Persistent artifact memory for AI sessions, via MCP.

Content-addressed session snapshots stored in a local SQLite database. Snap a session, retrieve it by hash in any future session, link artifacts into a provenance graph. Works with Claude, ChatGPT, Gemini, Cursor, and any MCP-compatible client.

---

## What It Is

~200 lines of JavaScript that gives any AI session persistent memory across restarts, machines, and clients.

Every snap is:
- **Content-addressed** — sha256 hash is the canonical ID
- **Durable** — stored in `surstor.db` (SQLite + WAL mode), survives reboots
- **MCP-native** — 10 tools the AI can call directly

---

## Install

**Prerequisites:** Node.js 18+. That's it.

```bash
git clone https://github.com/surstor-net/sur-node-v2
cd sur-node-v2
npm install
npm test
```

---

## Quick Start (Claude Code)

Add to `~/.claude.json` under your project's `mcpServers`:

```json
{
  "mcpServers": {
    "sur-node-v2": {
      "command": "node",
      "args": ["/absolute/path/to/sur-node-v2/mcp-server.mjs"]
    }
  }
}
```

---

## Connecting Other AI Clients

### 1. Claude Desktop

**Works out of the box — stdio, no HTTP needed.**

**Windows** — `C:\Users\{you}\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "sur-node-v2": {
      "command": "node",
      "args": ["C:/path/to/sur-node-v2/mcp-server.mjs"]
    }
  }
}
```

**Mac** — `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "sur-node-v2": {
      "command": "node",
      "args": ["/path/to/sur-node-v2/mcp-server.mjs"]
    }
  }
}
```

Restart Claude Desktop after editing. Tools appear under the 🔨 menu.

---

### 2. Gemini CLI

**Works out of the box — stdio, zero code changes needed.**

Gemini CLI uses the same config format as Claude Desktop.

`~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "sur-node-v2": {
      "command": "node",
      "args": ["/path/to/sur-node-v2/mcp-server.mjs"]
    }
  }
}
```

---

### 3. Remote HTTP Clients (Claude.ai, Grok Web, ChatGPT, Gemini Enterprise)

Browser-based and enterprise clients can't run local stdio processes. Use [`supergateway`](https://github.com/supermaven-inc/supergateway) to expose the stdio server as a Streamable HTTP endpoint — no changes to sur-node-v2 required.

**Start the gateway:**

```bash
npx -y supergateway \
  --stdio "node /path/to/sur-node-v2/mcp-server.mjs" \
  --port 8000 \
  --outputTransport streamableHttp
# MCP endpoint: http://localhost:8000/mcp
```

**Expose publicly** (dev/testing):

```bash
ngrok http 8000
# → https://xxxx.ngrok.io/mcp
```

**Production:** Put nginx or Caddy in front for TLS + auth:

```nginx
location /mcp {
  proxy_pass http://localhost:8000;
  if ($http_authorization != "Bearer your-token") { return 401; }
}
```

**Per-client connection:**

| Client | Where to paste the URL |
|--------|----------------------|
| **Claude.ai** | Settings → Connectors → Add (paid plan required) |
| **Grok Web** | Settings → Connectors → "Bring Your Own MCP" |
| **ChatGPT** | Settings → Apps → add connector URL (Plus/Pro; Developer Mode must be enabled by workspace admin) |
| **Gemini Enterprise** | Google Workspace MCP server data store — StreamableHTTP only, OAuth setup required in Google Cloud |

> **Note on Grok Build CLI:** If sur-node-v2 is already wired into Claude Code on the same machine, Grok Build auto-discovers the existing MCP config — no reconfiguration needed.

> **SSE is deprecated.** MCP spec dropped SSE in 2025-03-26. Always use `--outputTransport streamableHttp`. The older `mcp-remote` bridge expects SSE and will not work with this setup — keep native stdio for local clients.

---

### 4. Shared Team Snap Store

By default each user has their own `surstor.db`. To share memory across a team, deploy one instance on a server and point everyone at it.

**Deploy on a VPS or [Fly.io](https://fly.io):**

```bash
SURSTOR_DB=/data/shared-surstor.db \
  npx -y supergateway \
    --stdio "node /app/mcp-server.mjs" \
    --port 8000 \
    --outputTransport streamableHttp
```

**All team members use the same URL in their MCP config:**

```json
{
  "mcpServers": {
    "sur-node-v2": {
      "url": "https://your-server/mcp"
    }
  }
}
```

SQLite WAL mode (already enabled) handles concurrent reads fine; writes serialize. For a small team snapping sessions occasionally this is sufficient. If you need geographic distribution or high write concurrency, migrate the DB layer to [Turso](https://turso.tech) (libSQL, SQLite-compatible, managed cloud).

---

## Tools

| Tool | Description |
|------|-------------|
| `sur_snap` | Snapshot the session — label + summary + tags → sha256 hash |
| `sur_get` | Retrieve any artifact by hash |
| `sur_list` | List artifacts, newest first, optionally filtered by tag |
| `sur_link` | Create a provenance link between two artifacts |
| `sur_links` | List all links from an artifact |
| `sur_memory` | Inject recent session context (formatted for the AI) |
| `sur_export` | Write a snap as a readable `.md` file to disk |
| `sur_capture` | Snap a full Claude Code `.jsonl` transcript by path |
| `sur_ls` | Directory-style listing of the store |
| `sur_tree` | Walk the full provenance graph from any artifact |

---

## Usage

### Snap a session

At the end of any session, tell the AI:

> `sur-snap`

The AI calls `sur_snap` with a label, summary, and tags. You get back a hash.

### Retrieve in a future session

> `sur-get sha256:abc123...`

### Load recent context at the start of a session

> `sur-memory`

The AI calls `sur_memory` and injects your last 5 sessions as context.

---

## Tag Convention

`session-snapshot` is auto-injected on every snap — this is what `sur_memory` queries. Add your own tags to filter by project:

```
sur_snap('my-label', 'summary...', ['project-x', 'milestone'])
// stored tags: ['session-snapshot', 'project-x', 'milestone']
```

---

## Provenance Graph

Link artifacts to record relationships:

```
sur_link(h2, 'supersedes', h1)
sur_link(h3, 'references', docHash)
```

Supported rel types: `follows`, `supersedes`, `references`, `corrects`, `responds-to`

Walk the graph:

```
sur_tree(hash)              // outgoing links (what this references)
sur_tree(hash, dir='up')    // inbound links (what references this)
```

---

## Storage

Everything lives in `surstor.db` (SQLite, WAL mode). No server, no daemon.

```
surstor.db
├── artifacts  (hash, label, tags, summary, snapped_at, size)
└── links      (from_hash, rel, to_hash, created_at)
```

**Custom path:** Set `SURSTOR_DB=/path/to/your.db` to use a different location (useful for shared or network deployments).

**Backup:** `cp surstor.db surstor.db.bak` — that's your entire history.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SURSTOR_DB` | `./surstor.db` | Path to the SQLite database file |

---

## Files

```
surstor.mjs      ← core library: all 10 functions
mcp-server.mjs   ← MCP stdio server
test-all.mjs     ← integration test
surstor.db       ← your data (created on first snap, gitignored)
package.json
```

---

## Related

- [SurStor](https://surstor.com) — Agent Artifact Availability network
- [AAA Framework](https://cumulativecomputing.org) — Cumulative Computing theoretical foundation
- [supergateway](https://github.com/supermaven-inc/supergateway) — stdio → HTTP bridge for MCP servers

---

## License

MIT
