# sur-node-v2

**SurStor v2** — Agent artifact availability, built natively on [Covia](https://covia.network).

Content-addressed session memory for AI agents. Snap a session, retrieve it anywhere, link artifacts into a provenance graph. No database, no REST server, no file system fragility — just a thin layer on top of Covia's lattice workspace.

---

## What It Is

SurStor v2 is ~150 lines of JavaScript that gives any Claude session (Claude Code, Claude Desktop, claude.ai) persistent, cross-client memory backed by a Covia venue.

Every snap is:
- **Content-addressed** — sha256 hash is the canonical ID
- **Lattice-stored** — survives restarts, survives across clients
- **MCP-native** — exposed as 6 tools Claude can call directly

---

## Architecture

```
claude.ai / Claude Desktop / Claude Code
         ↓  MCP (stdio)
   mcp-server.mjs          ← 6 MCP tools
         ↓
   surstor.mjs             ← core library (~100 lines)
         ↓
   Covia venue (port 8090) ← lattice storage, CAS, provenance
         ↓
   w/surstor/* namespace   ← workspace paths
```

### Workspace Layout

```
w/surstor/artifacts/{hash}          ← full artifact content
w/surstor/labels/{label}            ← label → hash index
w/surstor/tags/{tag}/{hash}         ← tag → hash index
w/surstor/links/{from}/{rel}/{to}   ← provenance graph edges
```

---

## Tools (MCP)

| Tool | Description |
|------|-------------|
| `sur_snap` | Snapshot current session — content + label + tags |
| `sur_get` | Retrieve artifact by sha256 hash |
| `sur_list` | List artifacts, optionally filtered by tag |
| `sur_link` | Create a provenance link between two artifacts |
| `sur_links` | List all links from a given artifact |
| `sur_memory` | Surface recent session snapshots for context injection |

---

## Install

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A running Covia venue (default: `http://localhost:8090`)

### Setup

```bash
git clone https://github.com/surstor-net/sur-node-v2
cd sur-node-v2
npm install
```

### Test against your venue

```bash
node test-all.mjs
```

Expected output:
```
snap 1: sha256:...
snap 2: sha256:...
get: session-two | 2026-04-...
list (test): [ 'session-one', 'session-two' ]
link: sha256:... -[follows]-> sha256:...
links from h2: [ 'follows → sha256:...' ]
── sur_memory ──
## session-two
...
```

---

## Wire into Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sur-node-v2": {
      "command": "node",
      "args": ["C:/path/to/sur-node-v2/mcp-server.mjs"],
      "env": {
        "COVIA_URL": "http://localhost:8090"
      }
    }
  }
}
```

Restart Claude Desktop. The 6 tools appear under the hammer (🔨) menu.

---

## Usage in a Session

At the end of any session, tell Claude:

> `sur-snap`

Claude will call `sur_snap` with a label, summary, and tags. The hash is returned. Pass it to the next session:

> `sur-get sha256:...`

At the start of a new session:

> `sur-memory`

Claude calls `sur_memory` and injects recent context automatically.

---

## Tag Convention

Every snap includes `session-snapshot` as a guaranteed base tag (injected automatically). This ensures `sur_memory` can always surface it. Additional tags are caller-provided:

```js
sur_snap('my-label', 'summary...', ['project-x', 'milestone'])
// stored tags: ['session-snapshot', 'project-x', 'milestone']
```

---

## Provenance Graph

Link artifacts to record relationships:

```js
// h2 supersedes h1
sur_link(h2, 'supersedes', h1)

// h3 references an external doc
sur_link(h3, 'references', docHash)

// Supported rel types
// follows | supersedes | references | corrects | responds-to
```

Retrieve all links from an artifact:

```js
sur_links(hash)           // all relationships
sur_links(hash, 'follows') // filtered by rel type
```

---

## Why Covia Instead of DLFS / SQLite

SurStor v1 used DLFS (a bare HTTP file server) with a SQLite index and a REST layer (`sur-rest.js`). The problem: DLFS stored blobs in memory and lost everything on restart. Only the SQLite metadata survived.

Covia's workspace is lattice-backed — content persists across restarts, replicates across peers, and is natively queryable. v2 eliminates DLFS, SQLite, and sur-rest.js entirely.

v1 → v2 comparison:

| | v1 | v2 |
|--|----|----|
| Storage | DLFS (volatile) | Covia workspace (lattice) |
| Index | SQLite | Covia tag paths |
| REST layer | sur-rest.js (~400 lines) | none |
| MCP server | sur-node (~300 lines) | mcp-server.mjs (~120 lines) |
| Persistence | Lost on restart | Survives restarts |
| Cross-client | No | Yes |

---

## Files

```
surstor.mjs        ← core library: snap/get/list/link/links/memory
mcp-server.mjs     ← MCP stdio server, 6 tools
test-all.mjs       ← integration test (all 6 functions)
package.json
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COVIA_URL` | `http://localhost:8090` | Covia venue endpoint |

---

## Related

- [SurStor](https://surstor.com) — Agent Artifact Availability network
- [Covia](https://covia.network) — Lattice-based agent infrastructure (Mike Anderson)
- [AAA Framework](https://cumulativecomputing.org) — Agent Artifact Availability theoretical foundation
- [sur-node](https://github.com/surstor/sur-node) — v1 (DLFS-backed, still operational)

---

## License

MIT
