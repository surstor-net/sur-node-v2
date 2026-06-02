# sur-node-v2

**SurStor v2** — Persistent artifact memory for AI sessions, via MCP.

Content-addressed session snapshots stored in a local SQLite database. Snap a session, retrieve it by hash in any future session, link artifacts into a provenance graph. Works with Claude Code, Claude Desktop, and any MCP-compatible client.

---

## What It Is

~200 lines of JavaScript that gives any Claude session persistent memory across restarts, machines, and clients.

Every snap is:
- **Content-addressed** — sha256 hash is the canonical ID
- **Durable** — stored in `surstor.db` (SQLite), survives reboots
- **MCP-native** — 10 tools Claude can call directly

---

## Install

**Prerequisites:** Node.js 18+. That's it.

```bash
git clone https://github.com/surstor-net/sur-node-v2
cd sur-node-v2
npm install
```

Verify it works:
```bash
npm test
```

Expected output: snap hashes, a get result, a list, a link, and memory output. No errors.

---

## Wire into Claude

### Claude Code

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

### Claude Desktop (Windows)

Add to `claude_desktop_config.json`:
```
C:\Users\{you}\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json
```

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

### Claude Desktop (Mac)

```
~/Library/Application Support/Claude/claude_desktop_config.json
```

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

Restart Claude Desktop after editing. The tools appear under the 🔨 menu.

---

## Tools

| Tool | Description |
|------|-------------|
| `sur_snap` | Snapshot the session — label + summary + tags → sha256 hash |
| `sur_get` | Retrieve any artifact by hash |
| `sur_list` | List artifacts, newest first, optionally filtered by tag |
| `sur_link` | Create a provenance link between two artifacts |
| `sur_links` | List all links from an artifact |
| `sur_memory` | Inject recent session context (formatted for Claude) |
| `sur_export` | Write a snap as a readable `.md` file to disk |
| `sur_capture` | Snap a full Claude Code `.jsonl` transcript by path |
| `sur_ls` | Directory-style listing of the store |
| `sur_tree` | Walk the full provenance graph from any artifact |

---

## Usage

### Snap a session

Tell Claude at the end of any session:

> `sur-snap`

Claude calls `sur_snap` with a label, summary, and tags. You get back a hash.

### Retrieve in a future session

> `sur-get sha256:abc123...`

### Load recent context at the start of a session

> `sur-memory`

Claude calls `sur_memory` and injects your last 5 sessions as context automatically.

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
sur_tree(hash)           // outgoing links (what this references)
sur_tree(hash, dir=up)   // inbound links (what references this)
```

---

## Storage

Everything lives in `surstor.db` in the repo directory. SQLite — no server, no daemon, no dependencies beyond Node.js.

```
surstor.db
├── artifacts  (hash, label, tags, summary, snapped_at, size)
└── links      (from_hash, rel, to_hash, created_at)
```

Backup: just copy `surstor.db`. That's your entire history.

---

## Files

```
surstor.mjs      ← core library: all 10 functions
mcp-server.mjs   ← MCP stdio server
test-all.mjs     ← integration test
surstor.db       ← your data (created on first snap)
package.json
```

---

## Related

- [SurStor](https://surstor.com) — Agent Artifact Availability network
- [AAA Framework](https://cumulativecomputing.org) — Cumulative Computing theoretical foundation

---

## License

MIT
