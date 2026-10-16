'use strict';

const { hash } = require('./ToolResult');
const { contentType, tagsFor } = require('../../shared/KnowledgeStructure.cjs');
function terms(text) {
  const words = String(text).toLowerCase().match(/[a-z0-9]+|[\p{Script=Han}]+/gu) || [];
  return [...new Set(words.flatMap(word => /\p{Script=Han}/u.test(word) && word.length > 1
    ? Array.from({ length: word.length - 1 }, (_, i) => word.slice(i, i + 2)) : [word]))];
}
function blockId(doc) {
  const m = doc.metadata || {};
  return `KB${hash(JSON.stringify([m.pack?.fingerprint, m.documentId, m.source, m.fileName, m.loc, doc.pageContent])).slice(0, 28)}`;
}
function kind(doc) {
  return doc.metadata?.contentType || contentType(doc.pageContent.match(/^#{1,6}\s+(.+)$/m)?.[1] || '');
}

/** A snapshot only contains enabled stores. Never resolve a tool ID against arbitrary files. */
function createReader(stores, filter, result) {
  const documents = stores.flatMap(store => [...store.docstore._docs.values()].filter(filter));
  const allowed = new Set(documents);
  const byId = new Map(documents.map(doc => [blockId(doc), doc]));
  const groups = new Map(), indexes = new Map(), inferred = new Map();
  for (const doc of documents) {
    const m = doc.metadata || {}, key = JSON.stringify([m.pack?.fingerprint, m.source, m.documentId || m.fileName]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (a.metadata?.loc?.lines?.from || 0) - (b.metadata?.loc?.lines?.from || 0));
    group.forEach((doc, index) => indexes.set(doc, { group, index }));
    // Old indexed chunks keep their original bytes and line references. Infer
    // local heading context only; never claim to restore a reordered source book.
    const stack = [];
    for (const doc of group) {
      for (const match of doc.pageContent.matchAll(/^(#{1,6})\s+(.+)$/gm)) {
        while (stack.length && stack.at(-1).level >= match[1].length) stack.pop();
        stack.push({ level: match[1].length, title: match[2].trim() });
      }
      const chapterPath = stack.map(s => s.title);
      inferred.set(doc, { chapterPath, type: contentType(chapterPath.at(-1) || ''), tags: tagsFor(chapterPath.join(' ') + '\n' + doc.pageContent) });
    }
  }
  const typeOf = doc => doc.metadata?.contentType || inferred.get(doc)?.type || kind(doc);
  const decorate = doc => {
    const { group, index } = indexes.get(doc);
    return { ...result(doc), blockId: blockId(doc), contentType: typeOf(doc),
      chapterPath: doc.metadata?.chapterPath || inferred.get(doc)?.chapterPath || [], tags: doc.metadata?.tags || inferred.get(doc)?.tags || [],
      previousBlockId: index ? blockId(group[index - 1]) : null,
      nextBlockId: index + 1 < group.length ? blockId(group[index + 1]) : null };
  };
  // Build once per snapshot, reuse across agent tool iterations.
  const postings = new Map();
  for (const doc of documents) for (const word of terms(doc.pageContent + ' ' + (doc.metadata?.chapterPath || []).join(' '))) {
    if (!postings.has(word)) postings.set(word, new Set());
    postings.get(word).add(doc);
  }
  return {
    read: (id, radius = 1) => {
      const doc = byId.get(id);
      if (!doc) return [];
      const { group, index } = indexes.get(doc);
      const count = Math.max(0, Math.min(2, Number.isInteger(radius) ? radius : 1));
      return group.slice(Math.max(0, index - count), index + count + 1).map(decorate);
    },
    search: async (query, k = 6, { corpus, includeOverview = false } = {}) => {
      const limit = Math.max(1, Math.min(12, Number.isInteger(k) ? k : 6));
      const eligible = doc => allowed.has(doc) && (!corpus || (result(doc).corpus || '') === corpus);
      const scores = new Map(), lexical = new Map();
      for (const word of terms(query)) {
        const hits = postings.get(word);
        if (hits) for (const doc of hits) if (eligible(doc)) lexical.set(doc, (lexical.get(doc) || 0) + Math.log(1 + documents.length / hits.size));
      }
      const ranked = [...lexical].sort((a, b) => b[1] - a[1]).slice(0, 48);
      ranked.forEach(([doc], i) => scores.set(doc, 1 / (20 + i)));
      const vectors = await Promise.all(stores.map(async store => {
        const count = [...store.docstore._docs.values()].filter(eligible).length;
        return count ? store.similaritySearchWithScore(query, Math.min(24, count), eligible) : [];
      }));
      // Rank fusion avoids comparing raw distances from separately built stores.
      for (const group of vectors) group.forEach(([doc], i) => { if (eligible(doc)) scores.set(doc, (scores.get(doc) || 0) + 1 / (20 + i)); });
      const navigation = includeOverview || /目录|概述|摘要|序言|overview|summary|contents|preface/i.test(query);
      const sorted = [...scores].map(([doc, score]) => [doc, score * (navigation ? 1 : ({ toc: 0.05, frontmatter: 0.02, preface: 0.15, overview: 0.45 }[typeOf(doc)] || 1))])
        .sort((a, b) => b[1] - a[1]);
      const seen = new Set(), selected = [];
      for (const [doc] of sorted) {
        const key = hash(doc.pageContent.replace(/\s+/g, ' ').trim());
        if (seen.has(key)) continue;
        seen.add(key); selected.push(decorate(doc));
        if (selected.length === limit) break;
      }
      return selected;
    },
  };
}
module.exports = { createReader, blockId, terms };
