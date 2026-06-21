// Unit tests for the extensible tool registry + providers (Phase A).
// Runs in plain Node (no swisseph, no API key): providers only *build* tools,
// they don't execute them, so mock services suffice. Run with:
//   node tests/ToolRegistry.test.mjs

import { createRequire } from 'node:module';
import assert from 'node:assert';

const require = createRequire(import.meta.url);
const ToolRegistry = require('../src/core/ai/tools/ToolRegistry');
const ToolProvider = require('../src/core/ai/tools/ToolProvider');
const AstroToolProvider = require('../src/core/ai/tools/AstroToolProvider');
const ContextToolProvider = require('../src/core/ai/tools/ContextToolProvider');
const KnowledgeToolProvider = require('../src/core/ai/tools/KnowledgeToolProvider');
const ProfileToolProvider = require('../src/core/ai/tools/ProfileToolProvider');

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${name}\n      ${e.message}`);
  }
}

console.log('\nToolRegistry + providers');

class FakeProvider extends ToolProvider {
  constructor(id, names) { super(id, 'compute'); this._names = names; }
  async _build() { return this._names.map((n) => ({ name: n, description: `desc ${n}` })); }
}

await test('register / get / unregister', () => {
  const r = new ToolRegistry();
  const p = new FakeProvider('a', ['x']);
  r.register(p);
  assert.strictEqual(r.get('a'), p);
  assert.strictEqual(r.unregister('a'), p);
  assert.strictEqual(r.get('a'), null);
});

await test('getTools aggregates across providers', async () => {
  const r = new ToolRegistry();
  r.register(new FakeProvider('a', ['x', 'y']));
  r.register(new FakeProvider('b', ['z']));
  const tools = await r.getTools();
  assert.deepStrictEqual(tools.map((t) => t.name).sort(), ['x', 'y', 'z']);
});

await test('disabled providers contribute no tools', async () => {
  const r = new ToolRegistry();
  r.register(new FakeProvider('a', ['x']));
  r.register(new FakeProvider('b', ['z']));
  r.setEnabled('b', false);
  const tools = await r.getTools();
  assert.deepStrictEqual(tools.map((t) => t.name), ['x']);
});

await test('a throwing provider does not break aggregation', async () => {
  const r = new ToolRegistry();
  const bad = new ToolProvider('bad', 'compute');
  bad._build = async () => { throw new Error('boom'); };
  r.register(bad);
  r.register(new FakeProvider('good', ['ok']));
  const tools = await r.getTools();
  assert.deepStrictEqual(tools.map((t) => t.name), ['ok']);
});

await test('AstroToolProvider builds the six compute tools', async () => {
  const p = new AstroToolProvider({}, {}); // services not invoked during build
  const tools = await p.listTools();
  const names = tools.map((t) => t.name).sort();
  assert.deepStrictEqual(names, [
    'compute_bazi', 'compute_natal_chart', 'compute_progressed',
    'compute_solar_return', 'compute_synastry', 'compute_transit',
  ]);
});

await test('ContextToolProvider builds the three context tools', async () => {
  const p = new ContextToolProvider({ getContext: () => ({}) });
  const names = (await p.listTools()).map((t) => t.name).sort();
  assert.deepStrictEqual(names, ['get_active_profile', 'get_current_chart', 'get_current_context']);
});

await test('KnowledgeToolProvider is empty when KB not ready, one tool when ready', async () => {
  const notReady = new KnowledgeToolProvider({ isReady: () => false });
  assert.strictEqual(notReady.isReady(), false);
  assert.deepStrictEqual(await notReady.listTools(), []);

  const ready = new KnowledgeToolProvider({ isReady: () => true, retrieve: async () => [] });
  assert.strictEqual(ready.isReady(), true);
  const names = (await ready.listTools()).map((t) => t.name);
  assert.deepStrictEqual(names, ['search_knowledge']);
});

await test('ProfileToolProvider finds a saved profile by name', async () => {
  const repo = {
    list: () => ([
      { nameZh: 'Chilliziehen', gender: 'female', birthData: { year: 1998, month: 7, day: 5, hour: 14, minute: 20, location: { label: '上海', latitude: 31.2, longitude: 121.5 } } },
      { nameZh: '张三', gender: 'male', birthData: { year: 1990, month: 1, day: 1, hour: 9, minute: 0, location: { label: '北京', latitude: 39.9, longitude: 116.4 } } },
    ]),
  };
  const p = new ProfileToolProvider(repo);
  const tools = await p.listTools();
  assert.deepStrictEqual(tools.map((t) => t.name), ['list_profiles', 'find_profile_by_name']);

  const find = tools.find((t) => t.name === 'find_profile_by_name');
  const hit = await find.invoke({ name: 'Chilliziehen' });
  assert.ok(hit.includes('Chilliziehen') && hit.includes('女') && hit.includes('1998'), hit);
  const miss = await find.invoke({ name: '查无此人' });
  assert.ok(miss.includes('没有找到'), miss);
});

await test('ProfileToolProvider is unready without a repository', async () => {
  const p = new ProfileToolProvider(null);
  assert.strictEqual(p.isReady(), false);
  assert.deepStrictEqual(await p.listTools(), []);
});

await test('describe() reports providers + tool names', async () => {
  const r = new ToolRegistry();
  r.register(new FakeProvider('a', ['x']));
  const desc = await r.describe();
  assert.strictEqual(desc.length, 1);
  assert.strictEqual(desc[0].id, 'a');
  assert.strictEqual(desc[0].enabled, true);
  assert.deepStrictEqual(desc[0].tools.map((t) => t.name), ['x']);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
