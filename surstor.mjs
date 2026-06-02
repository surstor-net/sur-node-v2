import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.SURSTOR_DB || join(__dirname, 'surstor.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS artifacts (
    hash       TEXT PRIMARY KEY,
    label      TEXT,
    tags       TEXT NOT NULL DEFAULT '[]',
    summary    TEXT,
    snapped_at TEXT NOT NULL,
    size       INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_snapped ON artifacts(snapped_at DESC);

  CREATE TABLE IF NOT EXISTS links (
    link_hash  TEXT NOT NULL,
    from_hash  TEXT NOT NULL,
    to_hash    TEXT NOT NULL,
    rel        TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_links_from ON links(from_hash);
  CREATE INDEX IF NOT EXISTS idx_links_to   ON links(to_hash);
`);

// ── sur_snap ──────────────────────────────────────────────────────────────────
export async function sur_snap(label, summary, tags = []) {
  const normalizedTags = Array.from(new Set(['session-snapshot', ...tags]));
  const snapped_at = new Date().toISOString();
  const content = { type: 'session-snapshot', label, summary, tags: normalizedTags, snapped_at };
  const json = JSON.stringify(content);
  const hash = 'sha256:' + createHash('sha256').update(json).digest('hex');
  const size = Buffer.byteLength(json, 'utf8');

  const existing = db.prepare('SELECT hash FROM artifacts WHERE hash = ?').get(hash);
  if (!existing) {
    db.prepare('INSERT INTO artifacts (hash, label, tags, summary, snapped_at, size) VALUES (?, ?, ?, ?, ?, ?)')
      .run(hash, label, JSON.stringify(normalizedTags), summary, snapped_at, size);
  }

  return { hash, label, deduplicated: !!existing };
}

// ── sur_get ───────────────────────────────────────────────────────────────────
export async function sur_get(hash) {
  const row = db.prepare('SELECT * FROM artifacts WHERE hash = ?').get(hash);
  if (!row) throw new Error(`Not found: ${hash}`);
  return {
    type: 'session-snapshot',
    label: row.label,
    summary: row.summary,
    tags: JSON.parse(row.tags),
    snapped_at: row.snapped_at,
    hash: row.hash,
  };
}

// ── sur_list ──────────────────────────────────────────────────────────────────
export async function sur_list({ tag, limit = 20 } = {}) {
  const rows = tag
    ? db.prepare(`SELECT hash, label, tags, snapped_at FROM artifacts WHERE tags LIKE ? ORDER BY snapped_at DESC LIMIT ?`).all(`%"${tag}"%`, limit)
    : db.prepare(`SELECT hash, label, tags, snapped_at FROM artifacts ORDER BY snapped_at DESC LIMIT ?`).all(limit);
  return rows.map(r => ({ hash: r.hash, label: r.label, tags: JSON.parse(r.tags), snapped_at: r.snapped_at }));
}

// ── sur_link ──────────────────────────────────────────────────────────────────
export async function sur_link(fromHash, rel, toHash) {
  const created_at = new Date().toISOString();
  const link = { from: fromHash, rel, to: toHash, created_at };
  db.prepare('INSERT OR IGNORE INTO links (link_hash, from_hash, to_hash, rel, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(`${fromHash}:${rel}:${toHash}`, fromHash, toHash, rel, created_at);
  return link;
}

// ── sur_links ─────────────────────────────────────────────────────────────────
export async function sur_links(hash, rel = null) {
  const rows = rel
    ? db.prepare('SELECT * FROM links WHERE from_hash = ? AND rel = ?').all(hash, rel)
    : db.prepare('SELECT * FROM links WHERE from_hash = ?').all(hash);
  return rows.map(r => ({ from: r.from_hash, rel: r.rel, to: r.to_hash, created_at: r.created_at }));
}

// ── sur_export — write snap to local .md file ─────────────────────────────────
export async function sur_export(hash, { outputDir } = {}) {
  const artifact = await sur_get(hash);
  const dir = outputDir ?? join(__dirname, 'exports');
  mkdirSync(dir, { recursive: true });

  const md = [
    `# ${artifact.label}`,
    ``,
    `**Hash:** \`${hash}\``,
    `**Snapped:** ${artifact.snapped_at}`,
    `**Tags:** ${artifact.tags?.join(', ')}`,
    ``,
    `---`,
    ``,
    artifact.summary || '(no content)',
  ].join('\n');

  const filename = `${artifact.label}.md`;
  const filepath = join(dir, filename);
  writeFileSync(filepath, md, 'utf8');
  return { path: filepath, label: artifact.label };
}

// ── sur_capture — snap a Claude Code session transcript ───────────────────────
export async function sur_capture(sessionPath, { label } = {}) {
  const { readFileSync } = await import('fs');
  const { basename } = await import('path');

  const raw = readFileSync(sessionPath, 'utf8');
  const lines = raw.trim().split('\n').filter(Boolean);

  const messages = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'user' && entry.message?.role === 'user') {
        const content = Array.isArray(entry.message.content)
          ? entry.message.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
          : entry.message.content;
        if (content?.trim()) messages.push({ role: 'user', content: content.trim(), ts: entry.timestamp });
      } else if (entry.type === 'assistant' && entry.message?.role === 'assistant') {
        const content = Array.isArray(entry.message.content)
          ? entry.message.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
          : entry.message.content;
        if (content?.trim()) messages.push({ role: 'assistant', content: content.trim(), ts: entry.timestamp });
      }
    } catch {}
  }

  if (!messages.length) throw new Error('No messages found in session file');

  const sessionId = basename(sessionPath, '.jsonl');
  const ts = messages[0]?.ts?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const fileLabel = label ?? `session-${ts}-${sessionId.slice(0, 8)}`;
  const summary = `Full transcript captured from ${sessionPath}. ${messages.length} messages.`;

  const { hash } = await sur_snap(fileLabel, summary, ['transcript', 'full-capture']);
  return { label: fileLabel, messages: messages.length, hash };
}

// ── sur_ls — directory-style listing from SQLite ─────────────────────────────
export async function sur_ls({ tag, limit = 50 } = {}) {
  const rows = await sur_list({ tag, limit });
  if (!rows.length) return { entries: [], note: tag ? `No artifacts tagged "${tag}"` : 'Store is empty' };
  return {
    entries: rows.map(r => ({
      hash: r.hash,
      label: r.label,
      snapped_at: r.snapped_at.slice(0, 10),
      tags: r.tags.filter(t => t !== 'session-snapshot'),
    })),
    total: db.prepare('SELECT COUNT(*) as n FROM artifacts').get().n,
  };
}

// ── sur_tree ──────────────────────────────────────────────────────────────────
export async function sur_tree(hash, { dir = 'down', depth = 10 } = {}) {
  const visited = new Set();

  async function walk(h, d) {
    if (d <= 0 || visited.has(h)) return { hash: h, truncated: true };
    visited.add(h);
    let label = '(unknown)', snapped_at = null;
    try { const a = await sur_get(h); label = a.label; snapped_at = a.snapped_at; } catch {}
    const links = await sur_links(h);
    const branches = await Promise.all(
      links.map(async link => ({ rel: link.rel, node: await walk(link.to, d - 1) }))
    );
    return { hash: h, label, snapped_at, branches };
  }

  if (dir === 'up') {
    const rows = db.prepare('SELECT from_hash, rel FROM links WHERE to_hash = ?').all(hash);
    const inbound = [];
    for (const row of rows) {
      let label = '(unknown)', snapped_at = null;
      try { const a = await sur_get(row.from_hash); label = a.label; snapped_at = a.snapped_at; } catch {}
      inbound.push({ hash: row.from_hash, label, snapped_at, rel: row.rel });
    }
    return { hash, dir: 'up', inbound };
  }

  return walk(hash, depth);
}

// ── sur_memory ────────────────────────────────────────────────────────────────
export async function sur_memory({ limit = 5, tag = 'session-snapshot' } = {}) {
  const items = await sur_list({ tag, limit });
  if (!items.length) return 'No memory found.';

  return items.map(item => {
    const row = db.prepare('SELECT summary FROM artifacts WHERE hash = ?').get(item.hash);
    return [
      `## ${item.label}`,
      `hash: ${item.hash}`,
      `tags: ${item.tags?.join(', ')}`,
      `snapped: ${item.snapped_at}`,
      '',
      row?.summary || '',
    ].join('\n');
  }).join('\n\n---\n\n');
}
