# SurStor v2

Artifact memory for AI sessions — built on [Covia](https://covia.ai).

SurStor v2 replaces the split-brain SQLite + DLFS architecture of v1 with a single Covia venue as the source of truth. No SQLite. No separate blob store. No data loss on restart.

## What it does

- **Snap** sessions into content-addressed artifacts (SHA-256 CAS)
- **Tag and label** artifacts for fast lookup
- **Link** artifacts with typed provenance edges (`follows`, `supersedes`, `references`)
- **Surface memory** across Claude sessions via MCP

## Architecture

```
Claude (any client)
       │
       │  MCP stdio
       ▼
 mcp-server.mjs          ← 6 MCP tools
       │
       │  @covia/covia-sdk
       ▼
 surstor.mjs             ← core library
       │
       │  v/ops/covia/{write,read,list}
       ▼
 Covia venue (localhost:8090)
       │
       ▼
 Convex Lattice CRDTs    ← durable, content-addressed, no split-brain
```

### Path namespace

All data lives under `w/surstor/` in the Covia workspace:

| Path | Contents |
|------|----------|
| `w/surstor/artifacts/{sha256:hash}` | Full artifact JSON |
| `w/surstor/labels/{label}` | Hash pointer for a named label |
| `w/surstor/tags/{tag}/{hash}` | Tag index (value = snapped_at) |
| `w/surstor/links/{from}/{rel}/{to}` | Provenance link |

## Prerequisites

- Node.js 18+
- A running Covia venue on `localhost:8090`

Start Covia:
```bash
java -jar covia.jar /path/to/.covia/config.json
```

Example `~/.covia/config.json`:
```json
{
  "venues": [{
    "name": "Local",
    "did": "did:covia:local",
    "hostname": "localhost",
    "port": 8090,
    "mcp": { "enabled": true },
    "storage": { "content": "lattice" }
  }],
  "convex": {}
}
```

## Install

```bash
cd sur-v2
npm install
```

## MCP server (Claude Desktop)

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sur-node-v2": {
      "command": "node",
      "args": ["/absolute/path/to/sur-v2/mcp-server.mjs"],
      "env": {
        "COVIA_URL": "http://localhost:8090"
      }
    }
  }
}
```

Restart Claude Desktop. The following tools will be available:

| Tool | Description |
|------|-------------|
| `sur_snap` | Snapshot a session: label + summary + tags → SHA-256 hash |
| `sur_get` | Retrieve artifact by `sha256:` hash |
| `sur_list` | List artifacts, optionally filtered by tag |
| `sur_link` | Create a provenance link between two artifacts |
| `sur_links` | List all outbound links from an artifact |
| `sur_memory` | Surface recent session snapshots for context injection |

## Library usage

```javascript
import { sur_snap, sur_get, sur_list, sur_link, sur_links, sur_memory } from './surstor.mjs';

// Snap a session
const { hash } = await sur_snap('my-session', 'What we built and why.', ['my-project']);

// Retrieve it
const artifact = await sur_get(hash);

// List recent snapshots
const recent = await sur_list({ tag: 'session-snapshot', limit: 10 });

// Link two sessions
await sur_link(hash2, 'follows', hash1);

// Recall memory (formatted for context injection)
const memory = await sur_memory({ limit: 5 });
```

## `sur_snap` — detail

Every snap always receives the `session-snapshot` tag (injected automatically), so `sur_memory` always works regardless of what other tags you pass.

```javascript
sur_snap(label, summary, tags?)
// → { hash: 'sha256:...', label: '...' }
```

## Why Covia

SurStor v1 kept artifact blobs in DLFS (a bare HTTP filesystem) and metadata in SQLite. When DLFS restarted it lost all data; SQLite diverged. Classic split-brain.

Covia stores everything in Convex Lattice CRDTs — content-addressed, durable, single namespace. No split-brain possible. Cross-client writes (Desktop writes, CLI reads) work natively.

## License

MIT
