# OPERATIONS.md — SurStor v2 Runbook

No daemons, no services. The only thing that needs to be running is Claude itself.

---

## Installation

```bash
git clone https://github.com/surstor-net/sur-node-v2
cd sur-node-v2
npm install
npm test       # verify everything works
```

`surstor.db` is created automatically on first snap. Nothing else to set up.

---

## Wiring to Claude

### Claude Code (`~/.claude.json`)

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

### Claude Desktop — Windows

File: `C:\Users\{you}\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\claude_desktop_config.json`

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

### Claude Desktop — Mac

File: `~/Library/Application Support/Claude/claude_desktop_config.json`

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

Restart Claude Desktop after editing the config.

---

## Health Checks

### Test MCP server responds
```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node mcp-server.mjs
```
Expected: JSON listing all 10 tools.

### Run integration test
```bash
npm test
```
Expected: snap hashes, get result, list, link, memory output — no errors.

### Check what's in the store
```bash
node -e "import('./surstor.mjs').then(m => m.sur_list(10).then(r => console.log(JSON.stringify(r, null, 2))))"
```

---

## Troubleshooting

### Tools not showing in Claude Desktop

1. Check the path in config points to the right `mcp-server.mjs`
2. Run the tools/list health check above to confirm the server starts
3. Hit **Relaunch** in Claude Desktop (not just close/reopen)
4. Check Claude Desktop logs: `AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\logs\`

### `sur_snap` returns an error

Check Node.js version (`node --version` — needs 18+). Check `better-sqlite3` is installed (`npm install`). The database file is created automatically — no manual setup needed.

### `sur_get` returns "Not found"

The hash must exist in `surstor.db`. Use `sur_list` to see what's stored. Old hashes from before the SQLite migration (pre-2026-05-10) no longer exist — those were in Covia's memory and are gone.

### Corrupt or missing `surstor.db`

Delete it and the database will be recreated empty on next snap. You'll lose history but the server won't break.

---

## Updating

```bash
git pull
npm install   # only if package.json changed
```

Restart Claude Desktop (or reload the MCP server in Claude Code) to pick up changes.

---

## Backup

```bash
cp surstor.db surstor.db.backup-$(date +%Y%m%d)
```

The entire history is in that one file. Store it anywhere.

---

## Services Reference

| Component | What It Is | How to Start |
|-----------|-----------|--------------|
| `mcp-server.mjs` | MCP stdio server | Launched automatically by Claude via config |
| `surstor.db` | SQLite database | Created automatically on first snap |

Nothing else to run.
