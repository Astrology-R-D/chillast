'use strict';

/**
 * Chat-model filter shared by the build-time snapshot script
 * (scripts/fetch-catalog.mjs) and the runtime catalog refresh
 * (CatalogService._project) so both paths produce identical model sets.
 *
 * Two rules:
 *  1. modalities: drop models whose declared output excludes text. Audio-input
 *     chat models (e.g. qwen2-audio) still output text — kept.
 *  2. id patterns: models.dev's modality tagging is inconsistent upstream
 *     (2026-09-20 实测 text-embedding-3-* 被标 output:["text"]), so clear-cut
 *     non-chat families are also excluded by id.
 */
const NON_CHAT_ID_PATTERNS = [
  /text-embedding/i,
  /embedding/i,
  /gpt-image/i,
  /chatgpt-image/i,
  /dall-e/i,
  /imagen/i,
  /image-generation/i,
  /whisper/i,
  /\btts\b/i,
  /sora/i,
  /veo/i,
];

function isChatModel(model) {
  if (!model) return false;
  const output = model.modalities && Array.isArray(model.modalities.output);
  if (output && !model.modalities.output.includes('text')) return false;
  const id = String(model.id || '');
  return !NON_CHAT_ID_PATTERNS.some((re) => re.test(id));
}

module.exports = { isChatModel, NON_CHAT_ID_PATTERNS };
