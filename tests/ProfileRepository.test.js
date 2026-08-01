'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ProfileRepository = require('../src/main/ProfileRepository');

const birthData = {
  year: 1990,
  month: 1,
  day: 15,
  hour: 14,
  minute: 30,
  location: { label: 'Beijing', latitude: 39.9042, longitude: 116.4074 },
};

function withRepository(fn) {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chillast-profiles-'));
  const repository = new ProfileRepository(baseDir).init();
  try {
    fn(repository, path.join(baseDir, 'Profiles.json'));
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
}

function profile(overrides = {}) {
  return {
    id: 'profile-1',
    nameZh: 'Test',
    nameEn: 'Profile',
    gender: 'other',
    birthData,
    notes: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

test('legacy disk records load with empty tags without rewriting the file', () => {
  withRepository((repository, filePath) => {
    const legacy = profile();
    fs.writeFileSync(filePath, JSON.stringify([legacy], null, 2), 'utf8');

    assert.deepEqual(repository.get(legacy.id).tags, []);
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), [legacy]);
  });
});

test('tagged profiles save and round-trip through the exact disk representation', () => {
  withRepository((repository, filePath) => {
    const saved = repository.save(profile({ tags: [' Friend ', 'friend', 'work'] }));
    const expected = { ...saved, tags: ['Friend', 'work'] };

    assert.deepEqual(saved, expected);
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), [expected]);
    assert.deepEqual(repository.get(saved.id), expected);
  });
});

test('list ordering, upsert, and delete semantics remain unchanged', () => {
  withRepository((repository) => {
    repository.save(profile({ id: 'older', updatedAt: '2025-01-01T00:00:00.000Z' }));
    repository.save(profile({ id: 'newer', updatedAt: '2025-01-02T00:00:00.000Z' }));
    assert.deepEqual(repository.list().map(({ id }) => id), ['newer', 'older']);

    repository.save(profile({ id: 'older', notes: 'upserted', tags: ['updated'] }));
    assert.equal(repository.list().length, 2);
    assert.equal(repository.get('older').notes, 'upserted');
    assert.deepEqual(repository.get('older').tags, ['updated']);
    assert.equal(repository.remove('older'), true);
    assert.equal(repository.remove('older'), false);
    assert.deepEqual(repository.list().map(({ id }) => id), ['newer']);
  });
});

test('upsert save response keeps the submitted timestamp; refetch is canonical', () => {
  withRepository((repository, filePath) => {
    const original = profile({ tags: ['original'] });
    repository.save(original);
    const submitted = { ...original, notes: 'updated', tags: ['replacement'] };
    const response = repository.save(submitted);
    const canonical = repository.get(original.id);

    // Existing behavior: save returns the submitted timestamp, while disk gets the refreshed one.
    assert.equal(response.updatedAt, submitted.updatedAt);
    assert.notEqual(canonical.updatedAt, response.updatedAt);
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')), [canonical]);
    assert.deepEqual(canonical.tags, ['replacement']);
  });
});
