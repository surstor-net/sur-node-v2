import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { sur_snap, sur_get, sur_list, sur_link, sur_links, sur_memory } from './surstor.mjs';

const server = new Server(
  { name: 'sur-node-v2', version: '2.0.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'sur_snap',
      description: 'Snapshot this session into SurStor v2 (Covia-backed). Stores content + label + tag indexes.',
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
      description: 'Retrieve an artifact from SurStor v2 by its sha256: hash.',
      inputSchema: {
        type: 'object',
        properties: {
          hash: { type: 'string', description: 'The sha256: hash' }
        },
        required: ['hash']
      }
    },
    {
      name: 'sur_list',
      description: 'List artifacts from SurStor v2, newest first. Optionally filter by tag.',
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
      description: 'Create a provenance link between two artifacts. rel: follows | supersedes | references',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Source sha256: hash' },
          rel:  { type: 'string', description: 'Relationship type: follows | supersedes | references' },
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
    }
  ]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let result;
    switch (name) {
      case 'sur_snap':
        result = await sur_snap(args.label, args.summary, args.tags || []);
        break;
      case 'sur_get':
        result = await sur_get(args.hash);
        break;
      case 'sur_list':
        result = await sur_list({ tag: args.tag, limit: args.limit });
        break;
      case 'sur_link':
        result = await sur_link(args.from, args.rel, args.to);
        break;
      case 'sur_links':
        result = await sur_links(args.hash, args.rel);
        break;
      case 'sur_memory':
        result = await sur_memory({ limit: args.limit, tag: args.tag });
        break;
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: `Error: ${err.message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
