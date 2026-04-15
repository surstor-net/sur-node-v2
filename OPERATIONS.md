# OPERATIONS.md — SurStor v2 Runbook

Day-to-day guide for keeping the stack running. Three services, one dependency order.

---

## Startup Order

Always start in this order:

```
1. Covia (port 8090)   ← sur-node-v2 depends on this
2. Claude Desktop      ← picks up sur-node-v2 from config on launch
```

If Covia isn't running when Claude Desktop starts, `sur-node-v2` will fail to connect and show as broken in the MCP tools menu.

---

## Starting Covia

Covia runs as a JAR. From the directory containing the JAR:

```bash
java -jar covia-*.jar
```

Or if you know the exact JAR name:
```bash
java -jar covia-2026-04-13.jar
```

Verify it's running:
```bash
curl http://localhost:8090/api/v1/status
```

Expected response:
```json
{
  "status": "ok",
  "peer": "did:covia:local",
  ...
}
```

Default port: **8090**. If you need a different port, pass `--port XXXX` and update `COVIA_URL` in claude_desktop_config.json.

---

## Checking sur-node-v2 Health

### From the command line
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node C:/Users/rich/PROJECTS/sur-v2/mcp-server.mjs
```

Expected: JSON response listing all 6 tools (`sur_snap`, `sur_get`, `sur_list`, `sur_link`, `sur_links`, `sur_memory`).

### From Claude Desktop

Click the hammer icon (🔨) in the chat input. You should see:
- `sur-node` — v1, DLFS-backed
- `sur-node-v2` — Covia-backed, this repo

Each should be expandable to show its tools. A red dot or missing entry means the server failed to start.

### From Claude Desktop logs

```
C:\Users\rich\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\logs\
```

Look for `mcp-server.log` or similar. Successful startup shows:
```
Server started and connected successfully
tools/list → 6 tools returned
```

---

## Running the Integration Test

```bash
cd C:/Users/rich/PROJECTS/sur-v2
node test-all.mjs
```

This exercises all 6 functions against the live Covia venue. If it completes without errors, everything is working end-to-end.

---

## Claude Desktop Config

**Location:**
```
C:\Users\rich\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json
```

**Archived v1 config (before sur-node-v2 was added):**
```
claude_desktop_config.v1-sur-node-2026-04-15.json
```

**Current relevant section:**
```json
{
  "mcpServers": {
    "sur-node": {
      "command": "node",
      "args": ["C:/Users/rich/PROJECTS/sur-node/index.js"],
      "env": {
        "DLFS_URL": "http://127.0.0.1:8080",
        "MEMORY_PATH": "C:\\Users\\rich\\.claude\\projects\\C--Users-rich\\memory"
      }
    },
    "sur-node-v2": {
      "command": "node",
      "args": ["C:/Users/rich/PROJECTS/sur-v2/mcp-server.mjs"],
      "env": {
        "COVIA_URL": "http://localhost:8090"
      }
    }
  }
}
```

After any change to this file, use the **Relaunch** button in Claude Desktop (or fully restart it).

---

## Troubleshooting

### sur-node-v2 not showing in hammer menu

1. Check Covia is running: `curl http://localhost:8090/api/v1/status`
2. Check the MCP server starts cleanly (run the tools/list test above)
3. Check claude_desktop_config.json path is correct for your machine
4. Hit **Relaunch** in Claude Desktop (not just close/reopen — use the relaunch button)
5. Check logs in the Claude AppData directory

### `sur_snap` returns an error

Most likely Covia isn't running. Verify with:
```bash
curl http://localhost:8090/api/v1/status
```

If Covia is running but you get a path error, check that the path starts with `w/`. The Covia workspace namespace requires it.

### `sur_get` returns 404 / not found

- If using **v1** (`sur-node`): DLFS data is in-memory and lost on restart. This is the known v1 limitation. Use v2.
- If using **v2** (`sur-node-v2`): hash may be wrong, or the artifact was written to a different venue instance. Try `sur_list` to see what's actually stored.

### `sur_memory` returns "No memory found"

All snaps must have the `session-snapshot` tag to appear in `sur_memory`. As of v2, this tag is auto-injected by `sur_snap`. If you have old snaps without it, they won't surface — use `sur_list` with no tag filter to find them.

### Covia won't start / port conflict

Check if something else is on 8090:
```bash
netstat -ano | findstr :8090
```

Kill the conflicting process or pass a different port to the JAR and update `COVIA_URL` in the Desktop config.

---

## Known Gaps (as of 2026-04-15)

### Covia doesn't autostart with Windows

Covia must be manually started before Claude Desktop. This means if you reboot and open Claude Desktop immediately, sur-node-v2 will fail until you start Covia.

**Workaround:** Add Covia JAR launch to Windows Task Scheduler or Startup folder.

**Long-term fix:** Wire Covia autostart into the sur-node-v2 MCP server startup via a child_process spawn with a readiness check.

### DLFS (v1) still running alongside v2

Both sur-node and sur-node-v2 are active in Claude Desktop. This is intentional during the transition — v1 has historical metadata (labels, tags) in SQLite even though the blob content is lost. Once you've confirmed all active work is in v2, sur-node can be removed from claude_desktop_config.json.

### No `sur_tree` in v2

v1's `sur-tree` (provenance graph traversal) hasn't been ported to v2 yet. `sur_links` gives you one hop; full tree traversal needs to be added to `surstor.mjs`.

---

## Services Reference

| Service | Port | Start Command | Health Check |
|---------|------|---------------|--------------|
| Covia | 8090 | `java -jar covia-*.jar` | `curl localhost:8090/api/v1/status` |
| DLFS (v1) | 8080 | (separate process) | `curl localhost:8080/dlfs/` |
| sur-rest.js (v1) | 3000 | (separate process) | `curl -H "X-SurStor-Key: winnow123" localhost:3000/api/v1/artifacts` |
| sur-node-v2 | stdio | via Claude Desktop MCP | `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' \| node mcp-server.mjs` |

---

## Updating sur-node-v2

```bash
cd C:/Users/rich/PROJECTS/sur-v2
git pull
npm install   # only needed if package.json changed
```

Then hit **Relaunch** in Claude Desktop to pick up the changes.
