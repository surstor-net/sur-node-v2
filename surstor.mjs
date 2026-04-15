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
