import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { sur_snap, sur_get, sur_list, sur_link, sur_links, sur_memory, sur_tree, sur_export, sur_ls, sur_capture } from './surstor.mjs';

const server = new Server(
  { name: 'sur-node-v2', version: '2.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'sur_snap',
      description: 'Snapshot this session into SurStor. Stores label, summary, and tags in a local SQLite database keyed by sha256 hash.',
      inputSchema: {
        type: 'object',
        properties: {
          label:   { type: 'string', description: 'Short session label' },
          summary: { type: 'string', description: 'Full session summary: topics, decisions, artifacts, next steps' },
          tags:    { type: 'array', items: { type: 'string' }, description: 'Topic tags' }
        },
        required: ['label', 'summary']
      }
    },
    {
      name: 'sur_get',
      description: 'Retrieve an artifact from SurStor by its sha256: hash.',
      inputSchema: {
        type: 'object',
        properties: {
          hash: { type: 'string', description: 'The sha256: hash returned by sur_snap' }
        },
        required: ['hash']
      }
    },
    {
      name: 'sur_list',
      description: 'List artifacts from SurStor, newest first. Optionally filter by tag.',
      inputSchema: {
        type: 'object',
        properties: {
          tag:   { type: 'string', description: 'Filter by tag (optional)' },
          limit: { type: 'number', description: 'Max results (default 20)' }
        }
      }
    },
    {
      name: 'sur_link',
      description: 'Create a provenance link between two artifacts. rel: follows | supersedes | references | corrects | responds-to',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Source sha256: hash' },
          rel:  { type: 'string', description: 'Relationship type' },
          to:   { type: 'string', description: 'Target sha256: hash' }
        },
        required: ['from', 'rel', 'to']
      }
    },
    {
      name: 'sur_links',
      description: 'List all provenance links from a given artifact hash.',
      inputSchema: {
        type: 'object',
        properties: {
          hash: { type: 'string', description: 'The sha256: hash to query links from' },
          rel:  { type: 'string', description: 'Filter by relationship type (optional)' }
        },
        required: ['hash']
      }
    },
    {
      name: 'sur_memory',
      description: 'Surface recent session snapshots formatted for context injection.',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Number of recent snapshots to return (default 5)' },
          tag:   { type: 'string', description: 'Filter tag (default: session-snapshot)' }
        }
      }
    },
    {
      name: 'sur_export',
      description: 'Export a snap as a human-readable .md file to a local directory. Defaults to an exports/ folder next to surstor.db.',
      inputSchema: {
        type: 'object',
        properties: {
          hash:      { type: 'string', description: 'The sha256: hash to export' },
          outputDir: { type: 'string', description: 'Absolute path to output directory (optional, defaults to exports/)' }
        },
        required: ['hash']
      }
    },
    {
      name: 'sur_capture',
      description: 'Capture a full Claude Code session transcript from its .jsonl file and snap it into SurStor.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionPath: { type: 'string', description: 'Absolute path to the .jsonl session file' },
          label:       { type: 'string', description: 'Label for the transcript (default: session-{date}-{id})' }
        },
        required: ['sessionPath']
      }
    },
    {
      name: 'sur_ls',
      description: 'Directory-style listing of all artifacts in the store. Optionally filter by tag.',
      inputSchema: {
        type: 'object',
        properties: {
          tag:   { type: 'string', description: 'Filter by tag (optional)' },
          limit: { type: 'number', description: 'Max entries (default 50)' }
        }
      }
    },
    {
      name: 'sur_tree',
      description: 'Walk the provenance tree from an artifact. dir=down follows outgoing links; dir=up finds inbound links.',
      inputSchema: {
        type: 'object',
        properties: {
          hash:  { type: 'string', description: 'The sha256: hash to start from' },
          dir:   { type: 'string', description: 'Direction: down (default) or up' },
          depth: { type: 'number', description: 'Max hops to traverse (default 10)' }
        },
        required: ['hash']
      }
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result;
    switch (name) {
      case 'sur_snap':    result = await sur_snap(args.label, args.summary, args.tags || []); break;
      case 'sur_get':     result = await sur_get(args.hash); break;
      case 'sur_list':    result = await sur_list({ tag: args.tag, limit: args.limit }); break;
      case 'sur_link':    result = await sur_link(args.from, args.rel, args.to); break;
      case 'sur_links':   result = await sur_links(args.hash, args.rel); break;
      case 'sur_memory':  result = await sur_memory({ limit: args.limit, tag: args.tag }); break;
      case 'sur_export':  result = await sur_export(args.hash, { outputDir: args.outputDir }); break;
      case 'sur_capture': result = await sur_capture(args.sessionPath, { label: args.label }); break;
      case 'sur_ls':      result = await sur_ls({ tag: args.tag, limit: args.limit }); break;
      case 'sur_tree':    result = await sur_tree(args.hash, { dir: args.dir, depth: args.depth }); break;
      default: throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
