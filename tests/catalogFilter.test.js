'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { isChatModel } = require('../src/core/ai/catalogFilter');

test('keeps ordinary chat models, including ones without modalities', () => {
  assert.equal(isChatModel({ id: 'deepseek-v4-flash' }), true);
  assert.equal(isChatModel({ id: 'gpt-5', modalities: { output: ['text'] } }), true);
  // 音频输入但文本输出的多模态聊天模型必须保留
  assert.equal(isChatModel({ id: 'qwen2-audio', modalities: { output: ['text'] } }), true);
});

test('drops models whose output modalities exclude text', () => {
  assert.equal(isChatModel({ id: 'step-tts-2', modalities: { output: ['audio'] } }), false);
  assert.equal(isChatModel({ id: 'gpt-image-2', modalities: { output: ['image'] } }), false);
});

test('drops non-chat families by id pattern even when modalities are mislabeled upstream', () => {
  // models.dev 实测标注错误案例
  assert.equal(isChatModel({ id: 'text-embedding-3-small', modalities: { output: ['text'] } }), false);
  assert.equal(isChatModel({ id: 'text-embedding-ada-002', modalities: { output: ['text'] } }), false);
  assert.equal(isChatModel({ id: 'gpt-image-1.5', modalities: { output: ['text', 'image'] } }), false);
  assert.equal(isChatModel({ id: 'chatgpt-image-latest' }), false);
  // 其余明确的非聊天家族
  assert.equal(isChatModel({ id: 'gemini-embedding-001' }), false);
  assert.equal(isChatModel({ id: 'dall-e-3' }), false);
  assert.equal(isChatModel({ id: 'image-generation-3' }), false);
  assert.equal(isChatModel({ id: 'whisper-1' }), false);
  assert.equal(isChatModel({ id: 'chatgpt-tts-latest' }), false);
  assert.equal(isChatModel({ id: 'sora-2' }), false);
  assert.equal(isChatModel({ id: 'veo-3' }), false);
  assert.equal(isChatModel({ id: 'text-embedding-3-large', modalities: { output: ['text'] } }), false);
  assert.equal(isChatModel({ id: 'gpt-image-1-mini', modalities: { output: ['text', 'image'] } }), false);
  // /imagen/ 家族（google 图像模型）
  assert.equal(isChatModel({ id: 'imagen-3.0-generate-002' }), false);
});
