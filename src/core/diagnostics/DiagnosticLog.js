'use strict';

const fs = require('node:fs');
const path = require('node:path');
const PRIVATE_FIELD = /^(?:api.?key|authorization|credentials|password|secret|cookie|access.?token|refresh.?token|messages|prompt|content|birthData|profile|args|result)$/i;

class DiagnosticLog {
  constructor(directory, { maxFileBytes = 2 * 1024 * 1024, maxFiles = 5, metadata = {} } = {}) {
    this.directory = path.resolve(directory);
    this.maxFileBytes = maxFileBytes;
    this.maxFiles = maxFiles;
    this.metadata = metadata;
    this.secrets = new Set();
    this.lastError = null;
    this.currentFile = path.join(this.directory, 'chillast.log');
    try { fs.mkdirSync(this.directory, { recursive: true }); }
    catch (error) { this.lastError = error.message; }
  }

  registerSecrets(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value)) {
      if (PRIVATE_FIELD.test(key) && typeof item === 'string' && item.length >= 4) this.secrets.add(item);
      else if (item && typeof item === 'object') this.registerSecrets(item);
    }
  }

  redactText(value) {
    let text = String(value);
    for (const secret of this.secrets) text = text.split(secret).join('[REDACTED]');
    text = text.replace(/\bBearer\s+[^\s,"'}]+/gi, 'Bearer [REDACTED]')
      .replace(/\bsk-[A-Za-z0-9_-]{8,}/g, '[REDACTED]')
      .replace(/((?:api[_-]?key|authorization|password|secret|access[_-]?token)\s*["']?\s*[:=]\s*["']?)[^\s,"'}]+/gi, '$1[REDACTED]')
      .replace(/("(?:messages|prompt|content|birthData|profile|args|result)"\s*:\s*)"(?:\\.|[^"\\])*"/gi, '$1"[OMITTED]"')
      .replace(/https?:\/\/[^\s<>"')]+/gi, (url) => {
        try { const parsed = new URL(url); return `${parsed.origin}${parsed.pathname}`; }
        catch (_) { return '[URL]'; }
      });
    return text.slice(0, 4096);
  }

  sanitize(value, depth = 0) {
    if (depth > 5) return '[OMITTED]';
    if (typeof value === 'string') return this.redactText(value);
    if (value instanceof Error) return this.sanitize({ name: value.name, message: value.message, stack: value.stack, code: value.code, status: value.status, cause: value.cause }, depth + 1);
    if (Array.isArray(value)) return value.slice(0, 50).map((item) => this.sanitize(item, depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [key, PRIVATE_FIELD.test(key) ? '[OMITTED]' : this.sanitize(item, depth + 1)]));
    return ['number', 'boolean'].includes(typeof value) || value === null ? value : undefined;
  }

  record(level, event, details = {}) {
    try {
      let line = JSON.stringify({ time: new Date().toISOString(), level, event, ...this.sanitize(details) }) + '\n';
      if (Buffer.byteLength(line) > this.maxFileBytes) line = JSON.stringify({ time: new Date().toISOString(), level, event, truncated: true }) + '\n';
      const size = fs.existsSync(this.currentFile) ? fs.statSync(this.currentFile).size : 0;
      if (size + Buffer.byteLength(line) > this.maxFileBytes) {
        if (this.maxFiles === 1) fs.writeFileSync(this.currentFile, '');
        for (let index = this.maxFiles - 1; index >= 1; index--) {
          const next = path.join(this.directory, `chillast.${index}.log`);
          const previous = index === 1 ? this.currentFile : path.join(this.directory, `chillast.${index - 1}.log`);
          if (fs.existsSync(next)) fs.rmSync(next);
          if (fs.existsSync(previous)) fs.renameSync(previous, next);
        }
      }
      fs.appendFileSync(this.currentFile, line, 'utf8');
      this.lastError = null;
    } catch (error) { this.lastError = this.redactText(error.message); }
  }

  info() {
    let files = [];
    try { files = fs.readdirSync(this.directory).filter((name) => /^chillast(?:\.\d+)?\.log$/.test(name)); }
    catch (_) { /* unavailable directory remains visible in lastError */ }
    return { enabled: !this.lastError, directory: this.directory, files, maxFileBytes: this.maxFileBytes, maxFiles: this.maxFiles, lastError: this.lastError };
  }

  exportBundle(metadata = {}) {
    const Zip = require('adm-zip');
    const zip = new Zip();
    for (const file of this.info().files) {
      // Parse and redact again with all credentials learned since startup.
      const lines = fs.readFileSync(path.join(this.directory, file), 'utf8').split('\n').filter(Boolean).map((line) => {
        try { return JSON.stringify(this.sanitize(JSON.parse(line))); }
        catch (_) { return JSON.stringify({ event: 'unreadable-log-entry' }); }
      });
      zip.addFile(file, Buffer.from(lines.join('\n') + '\n'));
    }
    zip.addFile('diagnostics.json', Buffer.from(JSON.stringify(this.sanitize({ ...this.metadata, ...metadata, exportedAt: new Date().toISOString() }), null, 2)));
    return zip.toBuffer();
  }
}

let active = null;
const diagnostics = {
  info: (event, details) => active?.record('info', event, details),
  warn: (event, details) => active?.record('warn', event, details),
  error: (event, details) => active?.record('error', event, details),
  registerSecrets: (value) => active?.registerSecrets(value),
};

function initializeDiagnostics(directory, options) {
  active = new DiagnosticLog(directory, options);
  return active;
}

function captureConsole(logger, target = console) {
  const previous = {};
  for (const level of ['warn', 'error']) {
    previous[level] = target[level];
    target[level] = (...values) => {
      // Never serialize arbitrary SDK request/response objects or user records.
      const messages = values.filter((value, index) => (index === 0 && typeof value === 'string') || value instanceof Error)
        .map((value) => value instanceof Error ? `${value.name}: ${value.message}` : value);
      logger.record(level, 'console', { message: messages.join(' ') });
      previous[level].apply(target, values);
    };
  }
  return () => { for (const level of ['warn', 'error']) target[level] = previous[level]; };
}

module.exports = { DiagnosticLog, diagnostics, initializeDiagnostics, captureConsole };
