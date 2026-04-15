import { Grid } from '@covia/covia-sdk';
import { createHash } from 'crypto';

const venue = await Grid.connect(process.env.COVIA_URL || 'http://localhost:8090');

// ── sur_snap ──────────────────────────────────────────────────────────────────
export async function sur_snap(label, summary, tags = []) {
  const normalizedTags = Array.from(new Set(['session-snapshot', ...tags]));
  const content = { type: 'session-snapshot', label, summary, tags: normalizedTags, snapped_at: new Date().toISOString() };
  const json = JSON.stringify(content);
  const hash = 'sha256:' + createHash('sha256').update(json).digest('hex');

  await venue.run('v/ops/covia/write', { path: `w/surstor/artifacts/${hash}`, value: content });
  await venue.run('v/ops/covia/write', { path: `w/surstor/labels/${label}`, value: hash });
  for (const tag of tags) {
    await venue.run('v/ops/covia/write', { path: `w/surstor/tags/${tag}/${hash}`, value: content.snapped_at });
  }
  return { hash, label };
}

// ── sur_get ───────────────────────────────────────────────────────────────────
export async function sur_get(hash) {
  const result = await venue.run('v/ops/covia/read', { path: `w/surstor/artifacts/${hash}` });
  if (!result.exists) throw new Error(`Not found: ${hash}`);
  return result.value;
}

// ── sur_list ──────────────────────────────────────────────────────────────────
export async function sur_list({ tag, limit = 20 } = {}) {
  if (tag) {
    const index = await venue.run('v/ops/covia/list', { path: `w/surstor/tags/${tag}/` });
    if (!index.exists) return [];
    const hashes = index.keys.slice(0, limit);
    const items = await Promise.all(hashes.map(async h => {
      const r = await venue.run('v/ops/covia/read', { path: `w/surstor/artifacts/${h}` });
      return r.exists ? { hash: h, ...r.value } : null;
    }));
    return items.filter(Boolean);
  }

  // No tag — list all artifacts
  const index = await venue.run('v/ops/covia/list', { path: 'w/surstor/artifacts/' });
  if (!index.exists) return [];
  const hashes = index.keys.slice(0, limit);
  const items = await Promise.all(hashes.map(async h => {
    const r = await venue.run('v/ops/covia/read', { path: `w/surstor/artifacts/${h}` });
    return r.exists ? { hash: h, label: r.value.label, tags: r.value.tags, snapped_at: r.value.snapped_at } : null;
  }));
  return items.filter(Boolean);
}

// ── sur_link ──────────────────────────────────────────────────────────────────
// rel: 'follows' | 'supersedes' | 'references'
export async function sur_link(fromHash, rel, toHash) {
  const link = { from: fromHash, rel, to: toHash, created_at: new Date().toISOString() };
  await venue.run('v/ops/covia/write', {
    path: `w/surstor/links/${fromHash}/${rel}/${toHash}`,
    value: link
  });
  return link;
}

// ── sur_links ─────────────────────────────────────────────────────────────────
// List all links from a given hash (optionally filter by rel)
export async function sur_links(hash, rel = null) {
  const basePath = rel
    ? `w/surstor/links/${hash}/${rel}/`
    : `w/surstor/links/${hash}/`;
  const index = await venue.run('v/ops/covia/list', { path: basePath });
  if (!index.exists) return [];

  const results = [];
  for (const key of index.keys) {
    if (rel) {
      // key is the toHash directly
      const r = await venue.run('v/ops/covia/read', { path: `${basePath}${key}` });
      if (r.exists) results.push(r.value);
    } else {
      // key is a rel name — recurse one level
      const relIndex = await venue.run('v/ops/covia/list', { path: `w/surstor/links/${hash}/${key}/` });
      if (relIndex.exists) {
        for (const toHash of relIndex.keys) {
          const r = await venue.run('v/ops/covia/read', { path: `w/surstor/links/${hash}/${key}/${toHash}` });
          if (r.exists) results.push(r.value);
        }
      }
    }
  }
  return results;
}

// ── sur_export ────────────────────────────────────────────────────────────────
// Write a snap's content to DLFS as a human-readable .md file
// Creates the drive if it doesn't exist, then writes /sessions/{label}.md
export async function sur_export(hash, { drive = 'surstor' } = {}) {
  const artifact = await sur_get(hash);

  // Ensure drive exists
  try {
    await venue.run('v/ops/dlfs/create-drive', { name: drive });
  } catch {}  // already exists is fine

  // Format as markdown
  const md = [
    `# ${artifact.label}`,
    ``,
    `**Hash:** \`${hash}\``,
    `**Snapped:** ${artifact.snapped_at}`,
    `**Tags:** ${artifact.tags?.join(', ')}`,
    ``,
    `---`,
    ``,
    artifact.summary || artifact.content || '(no content)',
  ].join('\n');

  const path = `/sessions/${artifact.label}.md`;
  await venue.run('v/ops/dlfs/write', { drive, path, content: md });
  return { drive, path, label: artifact.label };
}

// ── sur_ls ────────────────────────────────────────────────────────────────────
// List files/dirs in a DLFS drive. Lists drives if no drive given.
export async function sur_ls({ drive, path = '/' } = {}) {
  if (!drive) {
    const result = await venue.run('v/ops/dlfs/list-drives', {});
    return { drives: result?.drives ?? result ?? [] };
  }
  const result = await venue.run('v/ops/dlfs/list', { drive, path });
  return { drive, path, entries: result?.entries ?? result ?? [] };
}

// ── sur_tree ──────────────────────────────────────────────────────────────────
// Walk the provenance graph from an artifact (follows outgoing links)
// dir: 'down' (default) = follow what this artifact links to (its references/ancestors)
//      'up' = scan for artifacts that link TO this hash (expensive, full scan)
export async function sur_tree(hash, { dir = 'down', depth = 10 } = {}) {
  const visited = new Set();

  async function walk(h, d) {
    if (d <= 0 || visited.has(h)) return { hash: h, truncated: true };
    visited.add(h);

    let label = '(unknown)', snapped_at = null;
    try {
      const art = await sur_get(h);
      label = art.label;
      snapped_at = art.snapped_at;
    } catch {}

    const links = await sur_links(h);
    const branches = await Promise.all(
      links.map(async link => ({
        rel: link.rel,
        node: await walk(link.to, d - 1)
      }))
    );

    return { hash: h, label, snapped_at, branches };
  }

  if (dir === 'up') {
    // Scan all artifacts for ones that link to this hash
    const all = await sur_list({ limit: 200 });
    const inbound = [];
    for (const item of all) {
      const links = await sur_links(item.hash);
      if (links.some(l => l.to === hash)) {
        inbound.push({ hash: item.hash, label: item.label, snapped_at: item.snapped_at, rel: links.find(l => l.to === hash).rel });
      }
    }
    return { hash, dir: 'up', inbound };
  }

  return walk(hash, depth);
}

// ── sur_memory ────────────────────────────────────────────────────────────────
// Surface recent session snapshots for context injection
export async function sur_memory({ limit = 5, tag = 'session-snapshot' } = {}) {
  const items = await sur_list({ tag, limit });
  if (!items.length) return 'No memory found.';

  return items.map(item => [
    `## ${item.label}`,
    `hash: ${item.hash}`,
    `tags: ${item.tags?.join(', ')}`,
    `snapped: ${item.snapped_at}`,
    '',
    item.summary || item.content || '',
  ].join('\n')).join('\n\n---\n\n');
}
