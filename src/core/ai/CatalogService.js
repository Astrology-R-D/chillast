'use strict';

const fs = require('fs');
const path = require('path');
const { PROVIDER_WHITELIST, resolveProviderEntry } = require('./ProviderCatalogWhitelist');
const { isChatModel } = require('./catalogFilter');

const CATALOG_URL = 'https://models.dev/api.json';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

/** Read-side visibility rule: deprecated models are hidden from lists and no
 *  longer resolve — persisted selections degrade to the conservative
 *  maxTokens fallback (design spec: deprecated names keep working with custom
 *  semantics). The projection applies the same rule when data enters (fetch /
 *  snapshot build); this re-check guards caches or snapshots written by older
 *  builds that may still contain deprecated entries. */
function isUsableModel(m) {
  return !!m && (m.status ?? 'active') !== 'deprecated';
}

/**
 * Read access to the provider/model catalog (models.dev snapshot + runtime
 * cache). Pure data layer: no Electron imports, every IO dependency is
 * injectable so node:test can drive it without a network or a real userData.
 *
 * Loading precedence: userData cache (catalog-cache.json) → bundled snapshot
 * (assets/catalog-snapshot.json) → empty catalog. Startup NEVER blocks on the
 * network; refreshAsync() updates the cache in the background, silently.
 */
class CatalogService {
  constructor({ snapshotPath, cachePath = null, fetchImpl = null, now = () => Date.now(), log = console.error, ttlMs = DEFAULT_TTL_MS } = {}) {
    this._snapshotPath = snapshotPath;
    this._cachePath = cachePath;
    this._fetch = fetchImpl || ((...a) => globalThis.fetch(...a));
    this._now = now;
    this._log = log;
    this._ttlMs = ttlMs;
    this._providers = {};  // { [catalogId]: rawEntry }
    this._fetchedAt = 0;
  }

  /** Synchronous init from cache/snapshot. Safe to call at startup. */
  load() {
    for (const [file, label] of [[this._cachePath, 'cache'], [this._snapshotPath, 'snapshot']]) {
      if (!file) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
        if (parsed && parsed.providers) {
          this._providers = parsed.providers;
          this._fetchedAt = typeof parsed.fetchedAt === 'number' ? parsed.fetchedAt : 0;
          return;
        }
      } catch (e) {
        this._log(`${label} unreadable (${e.message}), trying next source`);
      }
    }
    this._providers = {};
  }

  /** Background refresh. No-op while fresh unless force; failures are silent. */
  async refreshAsync({ force = false } = {}) {
    if (!force && this._now() - this._fetchedAt < this._ttlMs) return;
    try {
      const res = await this._fetch(CATALOG_URL, { signal: AbortSignal.timeout(30_000) });
      if (!res || !res.ok) throw new Error(`HTTP ${res && res.status}`);
      const raw = await res.json();
      // models.dev api.json is a flat { [catalogId]: … } map; also accept the
      // { providers: {…} } wrapper (the shape we persist to cache/snapshot),
      // so injected fixture documents refresh identically to the live feed.
      const providers = this._project(raw && raw.providers ? raw.providers : raw);
      if (!Object.keys(providers).length) throw new Error('catalog fetched but empty after projection');
      this._providers = providers;
      this._fetchedAt = this._now();
      if (this._cachePath) {
        try {
          fs.mkdirSync(path.dirname(this._cachePath), { recursive: true });
          // Atomic swap (tmp+rename, same rationale as scripts/fetch-catalog.mjs):
          // a crash mid-write must not leave a torn cache — the next startup
          // would silently fall back to the older bundled snapshot.
          const tmpPath = `${this._cachePath}.tmp`;
          fs.writeFileSync(tmpPath, JSON.stringify({ fetchedAt: this._fetchedAt, providers }));
          fs.renameSync(tmpPath, this._cachePath);
        } catch (e) { this._log(`cache write failed: ${e.message}`); }
      }
    } catch (e) {
      this._log(`refresh skipped: ${e.message}`);
    }
  }

  /** Whitelist-provider projection of a raw models.dev api.json document. */
  _project(raw) {
    const providers = {};
    for (const entry of PROVIDER_WHITELIST) {
      if (!entry.catalogId || !raw || !raw[entry.catalogId]) continue;
      const src = raw[entry.catalogId];
      const models = {};
      for (const [id, m] of Object.entries(src.models || {})) {
        if ((m.status ?? 'active') === 'deprecated') continue;
        if (!isChatModel(m)) continue; // 与快照脚本同一套过滤（Task 2b）
        models[id] = {
          name: m.name || id,
          limit: { context: m.limit?.context ?? 0, output: m.limit?.output ?? 0 },
          cost: { input: m.cost?.input ?? 0, output: m.cost?.output ?? 0 },
          status: m.status ?? 'active',
          release_date: m.release_date ?? '',
          tool_call: m.tool_call ?? true,
        };
      }
      providers[entry.catalogId] = { name: src.name ?? entry.catalogId, api: src.api ?? '', env: src.env ?? [], models };
    }
    return providers;
  }

  /** Non-deprecated [id, model] entries for a catalog id. */
  _usableModels(catalogId) {
    const raw = this._providers[catalogId];
    if (!raw) return [];
    return Object.entries(raw.models || {}).filter(([, m]) => isUsableModel(m));
  }

  /** Whitelist summaries for the settings UI. */
  getProviders() {
    return PROVIDER_WHITELIST.map((entry) => ({
      key: entry.key,
      label: entry.label,
      catalogId: entry.catalogId,
      needsKey: entry.needsKey,
      modelCount: entry.catalogId ? this._usableModels(entry.catalogId).length : 0,
    }));
  }

  /** Non-deprecated models for a whitelist key, newest release first. */
  getModels(providerKey) {
    const entry = resolveProviderEntry(providerKey);
    if (!entry || !entry.catalogId) return [];
    return this._usableModels(entry.catalogId)
      .map(([id, m]) => ({
        id,
        name: m.name,
        limitContext: m.limit?.context ?? 0,
        limitOutput: m.limit?.output ?? 0,
        costInput: m.cost?.input ?? 0,
        costOutput: m.cost?.output ?? 0,
        releaseDate: m.release_date ?? '',
      }))
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || b.id.localeCompare(a.id));
  }

  /** Single model lookup for maxTokens resolution. Unknown or deprecated →
   *  null, so stale persisted selections fall back to the conservative
   *  default instead of a retired model's limit. */
  getModel(providerKey, modelId) {
    const entry = resolveProviderEntry(providerKey);
    if (!entry || !entry.catalogId || !modelId) return null;
    const raw = this._providers[entry.catalogId];
    const m = raw && raw.models && raw.models[modelId];
    if (!isUsableModel(m)) return null;
    return {
      id: modelId,
      name: m.name,
      limitContext: m.limit?.context ?? 0,
      limitOutput: m.limit?.output ?? 0,
      costInput: m.cost?.input ?? 0,
      costOutput: m.cost?.output ?? 0,
      releaseDate: m.release_date ?? '',
    };
  }

  /** Catalog api base URL for a whitelist key (null when unknown/offline). */
  getApi(providerKey) {
    const entry = resolveProviderEntry(providerKey);
    if (!entry || !entry.catalogId) return null;
    const raw = this._providers[entry.catalogId];
    return raw && raw.api ? raw.api : null;
  }
}

module.exports = CatalogService;
