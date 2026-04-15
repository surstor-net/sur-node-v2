# ARCHITECTURE.md — SurStor v2

## The Core Question: Where Does It Store Files?

Short answer: **inside Covia's internal lattice storage**, not as user-visible files on the filesystem.

When you call `sur_snap`, your content travels this path:

```
Claude (MCP call)
  → mcp-server.mjs (tool handler)
    → surstor.mjs sur_snap()
      → venue.run('v/ops/covia/write', { path: 'w/surstor/artifacts/{hash}', value: {...} })
        → Covia JAR HTTP API (localhost:8090)
          → Covia internal lattice store (disk, inside JAR data directory)
```

The data lives in Covia's data directory, managed entirely by the JAR. You don't interact with it directly — you read and write through the Covia API using workspace paths.

---

## Workspace Path Structure

All SurStor data lives under the `w/surstor/` prefix in the Covia workspace. The `w/` prefix is required by Covia — it means "workspace namespace" (as opposed to `o/` for operations).

```
w/
└── surstor/
    ├── artifacts/
    │   └── sha256:{hash}          ← full artifact JSON (label, summary, tags, snapped_at)
    ├── labels/
    │   └── {label}                ← maps label → hash (for lookup by name)
    ├── tags/
    │   └── {tag}/
    │       └── sha256:{hash}      ← maps tag → hash (tag index)
    └── links/
        └── sha256:{fromHash}/
            └── {rel}/
                └── sha256:{toHash} ← provenance edge (from, rel, to, created_at)
```

### Why This Structure

**Artifacts** are stored by hash for content-addressability — the same content always produces the same path. If you snap identical content twice, it writes to the same path (idempotent).

**Labels** are a secondary index — human-readable names that point to hashes. Labels are not unique enforced; the last write wins.

**Tags** are a fan-out index — each tag has its own directory of hashes. Listing `w/surstor/tags/session-snapshot/` gives you every snapped session.

**Links** form a directed graph — `{from}/{rel}/{to}` captures a typed relationship between two artifacts. Listing `w/surstor/links/{hash}/` gives all outbound edges from that artifact.

---

## How Each Function Works

### `sur_snap(label, summary, tags)`

1. Builds content object: `{ type, label, summary, tags, snapped_at }`
2. JSON serializes it
3. SHA256 hashes the JSON → the canonical ID
4. Writes artifact to `w/surstor/artifacts/{hash}`
5. Writes label index to `w/surstor/labels/{label}`
6. For each tag (including auto-injected `session-snapshot`): writes `w/surstor/tags/{tag}/{hash}`
7. Returns `{ hash, label }`

Total writes per snap: `2 + N tags` Covia workspace operations.

### `sur_get(hash)`

1. Reads `w/surstor/artifacts/{hash}`
2. Returns the content object, or throws if not found

### `sur_list({ tag, limit })`

**With tag:**
1. Lists `w/surstor/tags/{tag}/` → array of hash keys
2. For each hash (up to limit): reads `w/surstor/artifacts/{hash}`
3. Returns array of content objects sorted newest first

**Without tag (list all):**
1. Lists `w/surstor/artifacts/` → all hash keys
2. Reads each up to limit
3. Returns sorted array

### `sur_link(fromHash, rel, toHash)`

1. Builds link object: `{ from, rel, to, created_at }`
2. Writes to `w/surstor/links/{fromHash}/{rel}/{toHash}`
3. Returns the link object

Supported rel types (convention, not enforced): `follows`, `supersedes`, `references`, `corrects`, `responds-to`

### `sur_links(hash, rel)`

**With rel:**
1. Lists `w/surstor/links/{hash}/{rel}/` → toHash keys
2. Reads each link object

**Without rel:**
1. Lists `w/surstor/links/{hash}/` → rel name keys
2. For each rel: lists `w/surstor/links/{hash}/{rel}/` → toHash keys
3. Reads all link objects

### `sur_memory({ limit, tag })`

1. Calls `sur_list({ tag: 'session-snapshot', limit })`
2. Formats each item as a Markdown block:
   ```
   ## {label}
   hash: {hash}
   tags: {tags}
   snapped: {snapped_at}

   {summary}
   ```
3. Returns joined string ready for context injection

---

## Why Covia vs. The Alternatives

### vs. DLFS (v1)

DLFS was a bare HTTP file server that stored blobs in memory. It had no persistence guarantee — every restart wiped all content. Only the SQLite metadata index survived because that was a file on disk. Result: hashes in the index pointed to content that no longer existed.

Covia writes to its internal lattice store on disk. Content survives restarts.

### vs. SQLite directly

SQLite requires a running process, a schema, migrations, and a query layer. It's single-node and not replication-aware. Covia's workspace is already a distributed lattice — replication is built in at the infrastructure level.

### vs. Filesystem (plain files)

Markdown files and plain filesystem storage work until they don't: no content-addressing, no provenance, no querying, silent truncation (Claude's MEMORY.md hits 200-line limits), and no cross-client availability. See: [stopusingmarkdownformemory.com](https://stopusingmarkdownformemory.com).

---

## Content-Addressing

The hash is computed from the JSON-serialized content object, not a UUID or timestamp. This means:

- **Deterministic** — same content always produces the same hash
- **Tamper-evident** — changing content changes the hash
- **Deduplication** — writing the same snap twice is a no-op (same path)
- **Portable** — the hash is the only ID you need to retrieve from any node

The hash format is `sha256:{64 hex chars}`.

---

## The MCP Layer

`mcp-server.mjs` is a thin adapter. It:

1. Starts an MCP `Server` with `StdioServerTransport`
2. Registers 6 tools with JSON Schema parameter definitions
3. On `tools/call`, routes to the matching `surstor.mjs` function
4. Serializes the return value as MCP `content[0].text`

The MCP server has no state of its own — it's purely a protocol adapter over the `surstor.mjs` library.

---

## Cross-Client Persistence

Because all data lives in Covia (not in any Claude process), any client that can reach the Covia venue can read and write:

```
Claude Code session  ─┐
                       ├→ Covia venue (localhost:8090) ← shared state
Claude Desktop       ─┤
                       │
claude.ai (via MCP)  ─┘
```

Proven: `sha256:9ae3d3a1...` was written from claude.ai and read back by Claude Code in the same day.

---

## What Covia Stores Internally

Covia uses a lattice/CRDT architecture (designed by Mike Anderson). Internally it uses content-addressed block storage similar to git's object model — content is stored once by hash, and the workspace paths are essentially a mutable index pointing into that immutable content store.

The physical files are inside the Covia JAR's data directory (typically wherever you launched the JAR from, in a `data/` or `.covia/` subdirectory). You should not need to touch these directly — always interact through the API.
