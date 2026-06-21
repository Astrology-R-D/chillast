// Unit tests for the MCP layer (Phase B). These never spawn a real server:
// only the disabled / no-server paths are exercised, which is exactly the
// default state. Run with:  node tests/McpManager.test.mjs

import { createRequire } from 'node:module';
import assert from 'node:assert';

const require = createRequire(import.meta.url);
const McpManager = require('../src/core/ai/mcp/McpManager');
const McpToolProvider = require('../src/core/ai/tools/McpToolProvider');

let passed = 0; let failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n      ${e.message}`); }
}

console.log('\nMcpManager + McpToolProvider');

const sampleConfig = {
  filesystem: { transport: 'stdio', command: 'npx', args: ['-y', 'x'], enabled: false },
  remote: { transport: 'sse', url: 'https://example.com/mcp', enabled: true },
};

await test('only enabled servers are selected, enabled flag stripped', () => {
  const m = new McpManager(sampleConfig);
  const enabled = m._enabledServers();
  assert.deepStrictEqual(Object.keys(enabled), ['remote']);
  assert.strictEqual('enabled' in enabled.remote, false);
  assert.strictEqual(enabled.remote.url, 'https://example.com/mcp');
});

await test('hasEnabledServers reflects config', () => {
  assert.strictEqual(new McpManager(sampleConfig).hasEnabledServers(), true);
  assert.strictEqual(new McpManager({}).hasEnabledServers(), false);
  assert.strictEqual(new McpManager({ a: { command: 'x', enabled: false } }).hasEnabledServers(), false);
});

await test('listServers reports name/enabled/transport', () => {
  const list = new McpManager(sampleConfig).listServers();
  assert.deepStrictEqual(list, [
    { name: 'filesystem', enabled: false, transport: 'stdio' },
    { name: 'remote', enabled: true, transport: 'sse' },
  ]);
});

await test('connect() with no enabled servers yields no tools and no client', async () => {
  const m = new McpManager({ a: { command: 'x', enabled: false } });
  const tools = await m.connect();
  assert.deepStrictEqual(tools, []);
  assert.strictEqual(m.isConnected(), true);
  assert.strictEqual(m._client, null);
});

await test('McpToolProvider stays unready / empty when no servers enabled', async () => {
  const m = new McpManager({});
  const p = new McpToolProvider(m);
  await p.init();
  assert.strictEqual(p.isReady(), false);
  assert.deepStrictEqual(await p.listTools(), []);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
