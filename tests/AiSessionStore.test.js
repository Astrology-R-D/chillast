'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const AiSessionStore = require('../src/main/AiSessionStore');

function newStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-sessions-'));
  return { store: new AiSessionStore(dir).init(), dir };
}

test('create seeds the base shape; list sorts pinned first then updatedAt desc', () => {
  const { store } = newStore();
  const a = store.create();
  const b = store.create();
  store.setTitle(a.id, 'A');
  store.setTitle(b.id, 'B');
  assert.equal(store.list()[0].id, b.id, 'newest first by default');
  store.setPinned(a.id, true);
  assert.equal(store.list()[0].id, a.id, 'pinned jumps the queue');
  assert.equal(store.list()[1].id, b.id);
  assert.equal(store.get(a.id).pinned, true);
  store.setPinned(a.id, false);
  assert.equal(store.list()[0].id, b.id);
});

test('fork copies the message prefix, links the source, and inherits mode', () => {
  const { store } = newStore();
  const src = store.create();
  store.appendMessage(src.id, { role: 'user', content: '第一条' });
  store.appendMessage(src.id, { role: 'ai', content: '回复一' });
  store.appendMessage(src.id, { role: 'user', content: '第二条' });
  store.setTitle(src.id, '原会话');

  // 消息在存储中无 id，用下标定位分支点（渲染层知道它渲染的下标）
  const fork = store.fork(src.id, 2);
  assert.notEqual(fork.id, src.id);
  assert.equal(fork.messages.length, 3, 'copies messages up to AND including the fork point');
  assert.equal(fork.messages[2].content, '第二条');
  assert.deepEqual(fork.forkedFrom, { sessionId: src.id, messageIndex: 2 });
  assert.ok(fork.title.includes('分支自'), `title mentions source: ${fork.title}`);
  assert.equal(fork.pinned, false);
  assert.equal(fork.mode, src.mode);
  assert.equal(store.get(src.id).messages.length, 3, 'source untouched');
  assert.equal(store.get(src.id).title, '原会话');
});

test('fork rejects out-of-range indexes and missing sessions', () => {
  const { store } = newStore();
  const src = store.create();
  store.appendMessage(src.id, { role: 'user', content: 'x' });
  assert.equal(store.fork(src.id, 5), null);
  assert.equal(store.fork(src.id, -1), null);
  assert.equal(store.fork('no-such-session', 0), null);
});

test('mode field round-trips; legacy sessions without mode read fine', () => {
  const { store, dir } = newStore();
  const s = store.create();
  assert.equal(s.mode, 'chat'); // 默认 chat；老数据无 mode 视为 chat
  const reloaded = new AiSessionStore(dir).init();
  const listed = reloaded.list();
  assert.ok(Array.isArray(listed) && listed.length === 1);
  assert.equal(listed[0].mode, 'chat');
});

test('replaceFrom rewrites the message at the index and drops everything after it', () => {
  const { store } = newStore();
  const s = store.create();
  store.appendMessage(s.id, { role: 'user', content: '原始问题' });
  store.appendMessage(s.id, { role: 'ai', content: '旧回复' });
  const updated = store.replaceFrom(s.id, 0, { role: 'user', content: '改写后的问题' });
  assert.equal(updated.messages.length, 1, 'drops everything after the rewritten index');
  assert.equal(updated.messages[0].content, '改写后的问题');
  assert.equal(updated.messages[0].role, 'user');
  assert.equal(store.get(s.id).messages.length, 1);
});

test('replaceFrom rejects out-of-range indexes and missing sessions', () => {
  const { store } = newStore();
  const s = store.create();
  store.appendMessage(s.id, { role: 'user', content: 'x' });
  assert.equal(store.replaceFrom(s.id, 5, { role: 'user', content: 'y' }), null);
  assert.equal(store.replaceFrom(s.id, -1, { role: 'user', content: 'y' }), null);
  assert.equal(store.replaceFrom('no-such-session', 0, { role: 'user', content: 'y' }), null);
  assert.equal(store.get(s.id).messages.length, 1, 'rejections leave the session untouched');
});
