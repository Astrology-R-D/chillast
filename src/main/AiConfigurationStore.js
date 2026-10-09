'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const FIELDS = ['provider', 'model', 'baseUrl', 'temperature', 'maxTokens', 'maxTokensMode', 'contextWindow', 'maxOutputTokens'];
function settings(input) {
  const value = { provider: 'openai', model: '', baseUrl: '', temperature: 0.7, maxTokens: 4096, maxTokensMode: 'custom', contextWindow: 0, maxOutputTokens: 0 };
  for (const key of FIELDS) if (input[key] !== undefined) value[key] = input[key];
  for (const [key, limit] of [['provider', 128], ['model', 256], ['baseUrl', 2048]]) {
    if (typeof value[key] !== 'string' || value[key].length > limit) throw new Error('AI 配置参数无效');
    value[key] = value[key].trim();
  }
  if (!value.provider || !value.model) throw new Error('请选择服务商并填写模型');
  if (value.baseUrl && !/^https?:\/\//i.test(value.baseUrl)) throw new Error('接口地址必须使用 http 或 https');
  if (!Number.isFinite(value.temperature) || value.temperature < 0 || value.temperature > 2) throw new Error('温度参数无效');
  for (const key of ['maxTokens', 'contextWindow', 'maxOutputTokens']) {
    if (!Number.isSafeInteger(value[key]) || value[key] < 0) throw new Error('Token 参数必须是非负整数');
  }
  if (!['custom', 'context'].includes(value.maxTokensMode)) throw new Error('输出额度模式无效');
  return value;
}

/** Main-process-only named settings and credentials; public descriptors never contain API keys. */
class AiConfigurationStore {
  constructor(baseDir, { safeStorage } = {}) {
    this.filePath = path.join(baseDir, 'ai-configurations.json');
    this.safeStorage = safeStorage;
    this.state = { version: 1, activeId: null, configurations: [] };
    this.exists = false;
    this.error = null;
  }
  init() {
    this.exists = fs.existsSync(this.filePath);
    if (!this.exists) return this;
    try {
      const envelope = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      const text = envelope.encrypted
        ? this.safeStorage.decryptString(Buffer.from(envelope.payload, 'base64')) : envelope.payload;
      const data = JSON.parse(text);
      if (data.version !== 1 || !Array.isArray(data.configurations)) throw new Error('格式无效');
      for (const entry of data.configurations) {
        if (typeof entry.id !== 'string' || typeof entry.name !== 'string' || typeof entry.apiKey !== 'string') throw new Error('条目无效');
        settings(entry.settings);
      }
      if (data.activeId && !data.configurations.some((c) => c.id === data.activeId)) throw new Error('当前配置不存在');
      this.state = data;
    } catch (e) { this.error = new Error(`无法读取已保存的 AI 配置：${e.message}`); }
    return this;
  }
  _check() { if (this.error) throw this.error; }
  descriptor(entry) {
    return { id: entry.id, name: entry.name, settings: settings(entry.settings), hasApiKey: Boolean(entry.apiKey), createdAt: entry.createdAt, updatedAt: entry.updatedAt };
  }
  list() {
    this._check();
    return { activeId: this.state.activeId, configurations: this.state.configurations.map((c) => this.descriptor(c)) };
  }
  get(id) {
    this._check();
    const value = this.state.configurations.find((c) => c.id === id);
    if (!value) throw new Error('AI 配置不存在');
    return structuredClone(value);
  }
  getActive() { return this.state.activeId ? this.get(this.state.activeId) : null; }
  prepareSave(input) {
    this._check();
    if (!input || typeof input.name !== 'string' || !input.settings || typeof input.settings !== 'object') throw new Error('AI 配置格式无效');
    const name = input.name.trim();
    if (!name || name.length > 64) throw new Error('请填写 1–64 字的配置名称');
    const previous = input.id ? this.get(input.id) : null;
    if (this.state.configurations.some((c) => c.id !== previous?.id && c.name.toLocaleLowerCase() === name.toLocaleLowerCase())) throw new Error('配置名称已存在，请使用其他名称');
    const nextSettings = settings({ ...previous?.settings, ...input.settings });
    const sameEndpoint = previous && previous.settings.provider === nextSettings.provider && previous.settings.baseUrl === nextSettings.baseUrl;
    const apiKey = Object.hasOwn(input.settings, 'apiKey') ? input.settings.apiKey : sameEndpoint ? previous.apiKey : '';
    if (typeof apiKey !== 'string' || apiKey.length > 8192) throw new Error('API Key 格式无效');
    const now = new Date().toISOString();
    return { id: previous?.id || randomUUID(), name, settings: nextSettings, apiKey: apiKey.trim(), createdAt: previous?.createdAt || now, updatedAt: now };
  }
  _write(state) {
    const payload = JSON.stringify(state);
    const encrypted = Boolean(this.safeStorage?.isEncryptionAvailable());
    const envelope = { version: 1, encrypted, payload: encrypted ? this.safeStorage.encryptString(payload).toString('base64') : payload };
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try { fs.writeFileSync(temporary, JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 }); fs.renameSync(temporary, this.filePath); }
    finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
    this.state = state; this.exists = true;
  }
  commit(entry) {
    this._check();
    const configurations = this.state.configurations.filter((c) => c.id !== entry.id);
    configurations.push(structuredClone(entry));
    this._write({ version: 1, activeId: entry.id, configurations });
    return this.descriptor(entry);
  }
  activate(id) {
    const entry = this.get(id);
    this._write({ ...this.state, activeId: id });
    return this.descriptor(entry);
  }
  remove(id) {
    this.get(id);
    if (id === this.state.activeId) throw new Error('请先切换到其他配置，再删除当前配置');
    this._write({ ...this.state, configurations: this.state.configurations.filter((c) => c.id !== id) });
    return this.list();
  }
  migrateLegacy(input) {
    this._check();
    if (this.exists || !input.provider || !input.model) return;
    this.commit(this.prepareSave({ name: '当前配置', settings: { ...input, apiKey: input.apiKey || '' } }));
  }
}

module.exports = AiConfigurationStore;
