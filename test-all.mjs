import { sur_snap, sur_get, sur_list, sur_link, sur_links, sur_memory } from './surstor.mjs';

// 1. snap two artifacts
const { hash: h1 } = await sur_snap('session-one', 'First session — initial context.', ['session-snapshot', 'test']);
const { hash: h2 } = await sur_snap('session-two', 'Second session — follows the first.', ['session-snapshot', 'test']);
console.log('snap 1:', h1);
console.log('snap 2:', h2);

// 2. sur_get
const content = await sur_get(h2);
console.log('\nget:', content.label, '|', content.snapped_at);

// 3. sur_list by tag
const byTag = await sur_list({ tag: 'test' });
console.log('\nlist (test):', byTag.map(i => i.label));

// 4. sur_link — h2 follows h1
const link = await sur_link(h2, 'follows', h1);
console.log('\nlink:', link.from.slice(0,16), '-[follows]->', link.to.slice(0,16));

// 5. sur_links
const links = await sur_links(h2);
console.log('links from h2:', links.map(l => `${l.rel} → ${l.to.slice(0,16)}`));

// 6. sur_memory
console.log('\n── sur_memory ──');
const memory = await sur_memory({ limit: 3 });
console.log(memory);
