#!/usr/bin/env node
'use strict';

/**
 * Fetch the models.dev community catalog and project the whitelist providers
 * into assets/catalog-snapshot.json — the offline fallback shipped with the
 * app (extraResources maps the whole assets/ dir; see package.json build).
 *
 * Run manually before a release, or any time the model list feels stale:
 *   node scripts/fetch-catalog.mjs
 * Override the source (e.g. for testing) with MODELS_DEV_URL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROVIDER_WHITELIST } from '../src/core/ai/ProviderCatalogWhitelist.js';
import { isChatModel } from '../src/core/ai/catalogFilter.js';

const CATALOG_URL = process.env.MODELS_DEV_URL || 'https://models.dev/api.json';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outPath = path.join(root, 'assets', 'catalog-snapshot.json');

function projectModel(model) {
  return {
    name: model.name || model.id,
    limit: {
      context: model.limit?.context ?? 0,
      output: model.limit?.output ?? 0,
    },
    cost: {
      input: model.cost?.input ?? 0,
      output: model.cost?.output ?? 0,
    },
    // models.dev leaves status unset for active models — normalize here so the
    // runtime never has to guess.
    status: model.status ?? 'active',
    release_date: model.release_date ?? '',
    tool_call: model.tool_call ?? true,
  };
}

const response = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(30_000) });
if (!response.ok) throw new Error(`fetch ${CATALOG_URL} failed: ${response.status}`);
const catalog = await response.json();
if (!catalog || typeof catalog !== 'object' || Array.isArray(catalog)) {
  throw new Error('models.dev returned a non-object document');
}

const providers = {};
for (const entry of PROVIDER_WHITELIST) {
  if (!entry.catalogId) continue; // ollama / openai_compat live outside the catalog
  const src = catalog[entry.catalogId];
  if (!src) throw new Error(`whitelist provider missing from models.dev: ${entry.catalogId}`);
  const models = Object.fromEntries(Object.entries(src.models ?? {})
    .filter(([, m]) => m && (m.status ?? 'active') !== 'deprecated' && isChatModel(m))
    .map(([id, m]) => [id, projectModel(m)]));
  if (!Object.keys(models).length) throw new Error(`no usable models for ${entry.catalogId}`);
  providers[entry.catalogId] = {
    name: src.name ?? entry.catalogId,
    api: src.api ?? '',
    env: src.env ?? [],
    models,
  };
}

// Atomic write: the committed snapshot is the app's only offline fallback —
// an interrupted run must never leave a truncated file behind.
const tmpPath = `${outPath}.tmp`;
fs.writeFileSync(tmpPath, JSON.stringify({ fetchedAt: Date.now(), providers }, null, 1));
fs.renameSync(tmpPath, outPath);
const modelCount = Object.values(providers).reduce((sum, p) => sum + Object.keys(p.models).length, 0);
console.log(`catalog snapshot: ${Object.keys(providers).length} providers, ${modelCount} models -> ${outPath}`);
