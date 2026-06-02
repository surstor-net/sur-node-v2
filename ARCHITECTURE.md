# ARCHITECTURE.md — SurStor v2

## Storage

Everything lives in `surstor.db` — a SQLite file in the repo directory. Created automatically on first snap. No server, no daemon, no external dependencies.

```
Claude (MCP call)
  → mcp-server.mjs
    → surstor.mjs
      → surstor.db (SQLite)
```

### Schema

```sql
artifacts (
  hash       TEXT PRIMARY KEY,   -- sha256:{64 hex chars}
  label      TEXT,               -- human-readable name
  tags       TEXT,               -- JSON array: ["session-snapshot", ...]
  summary    TEXT,               -- full session summary
  snapped_at TEXT,               -- ISO 8601 timestamp
  size       INTEGER             -- byte size of content JSON
)

links (
  link_hash  TEXT,               -- composite key: from:rel:to
  from_hash  TEXT,               -- source artifact
  to_hash    TEXT,               -- target artifact
  rel        TEXT,               -- relationship type
  created_at TEXT
)
```

---

## Content Addressing

The sha256 hash is computed from the JSON-serialized content object:

```js
const content = { type, label, summary, tags, snapped_at };
const hash = 'sha256:' + createHash('sha256').update(JSON.stringify(content)).digest('hex');
```

Properties:
- **Deterministic** — same content always produces the same hash
- **Tamper-evident** — changing content changes the hash
- **Idempotent** — snapping identical content twice is a no-op (same hash, existing row skipped)
- **Portable** — the hash is the only ID needed to retrieve from any copy of the db

---

## How Each Function Works

### `sur_snap(label, summary, tags)`
1. Auto-injects `session-snapshot` tag (union with caller-provided tags)
2. Builds content JSON, computes sha256 hash
3. INSERTs into `artifacts` (skips if hash already exists)
4. Returns `{ hash, label, deduplicated }`

### `sur_get(hash)`
1. SELECT from `artifacts WHERE hash = ?`
2. Returns full content object, or throws if not found

### `sur_list({ tag, limit })`
- With tag: `WHERE tags LIKE '%"tag"%'` (JSON array substring match)
- Without tag: all rows, newest first

### `sur_link(fromHash, rel, toHash)`
1. INSERTs into `links` with `INSERT OR IGNORE` (idempotent)
2. Returns link object

### `sur_links(hash, rel)`
- SELECT from `links WHERE from_hash = ?` (optionally also `AND rel = ?`)

### `sur_memory({ limit, tag })`
1. Calls `sur_list` to get recent snaps
2. Formats each as a Markdown block with label, hash, tags, snapped_at, and full summary
3. Returns joined string ready for Claude context injection

### `sur_export(hash, { outputDir })`
1. Calls `sur_get` to fetch the artifact
2. Formats as `.md` with frontmatter-style header
3. Writes to `{outputDir}/{label}.md` (defaults to `exports/` in repo dir)

### `sur_capture(sessionPath, { label })`
1. Reads a Claude Code `.jsonl` transcript file
2. Parses user/assistant message entries
3. Calls `sur_snap` with a label, message count summary, and `['transcript', 'full-capture']` tags

### `sur_ls({ tag, limit })`
Directory-style listing from SQLite — shows hash, label, date, and non-base tags for each artifact.

### `sur_tree(hash, { dir, depth })`
- `dir=down`: recursive walk following outgoing links (what this references)
- `dir=up`: scan `links WHERE to_hash = ?` to find inbound references

---

## MCP Layer

`mcp-server.mjs` is a pure protocol adapter:
1. Starts MCP `Server` with `StdioServerTransport`
2. Registers 10 tools with JSON Schema definitions
3. Routes `tools/call` to matching `surstor.mjs` function
4. Returns result as `content[0].text`

No state in the MCP server — all state is in `surstor.db`.

---

## Snap-as-Memory Doctrine

Snaps are the canonical memory unit:

```
sur_snap → surstor.db (full content, durable)
MEMORY.md → lightweight pointer index (≤200 lines, one hash + label per snap)
memory/*.md → user/feedback/project facts only (not snap transcripts)
```

Never duplicate snap content into `.md` files. The snap stores the full text. The hash is the retrieval key.

---

## Backup

```bash
cp surstor.db surstor.db.bak
```

That's your entire history. The file is self-contained.
