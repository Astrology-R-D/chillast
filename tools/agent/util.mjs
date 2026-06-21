// util.mjs — shared helpers for the cleaning pipeline (model I/O, retry, concurrency).

/** Extract plain text from a LangChain message's `.content` (string or parts). */
export function extractText(msg) {
  const c = msg && msg.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((p) => (p && p.text) || '').join('');
  return '';
}

/** Strip an accidental ```fence the model may wrap output in despite instructions. */
export function stripFence(text) {
  const t = String(text).trim();
  const m = t.match(/^```(?:[a-z]+)?\s*\n([\s\S]*?)\n```$/i);
  return m ? m[1].trim() : t;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Retry an async fn with linear backoff — survives transient 429/5xx/network blips. */
export async function withRetry(fn, { retries = 2, baseDelay = 1500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt < retries) await sleep(baseDelay * (attempt + 1));
    }
  }
  throw lastErr;
}

/** Run `fn` over items with bounded concurrency, preserving result order. */
export async function mapWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, worker),
  );
  return results;
}

/** Best-effort parse of the first JSON array found in a model reply. */
export function parseJsonArray(text) {
  const t = String(text);
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(t.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}
