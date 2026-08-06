'use strict';

function mismatch(detail) {
  throw new Error(`Chart response does not match request: ${detail}`);
}

function validateChartResultForRequestCore(result, request, expectedRingsByType, expectedSubjects) {
  if (result.meta.type !== request.type) mismatch(`expected type ${request.type}, received ${result.meta.type}`);
  if (result.meta.settings.houseSystem !== request.settings.houseSystem) mismatch('house system');
  if (result.meta.settings.zodiac !== request.settings.zodiac) mismatch('zodiac');
  if (result.subjects.length !== expectedSubjects) mismatch(`expected ${expectedSubjects} subjects`);

  const expectedRings = expectedRingsByType[request.type];
  if (!expectedRings || result.rings.length !== expectedRings.length) mismatch(`expected ${expectedRings?.length ?? 0} rings`);
  for (let index = 0; index < expectedRings.length; index += 1) {
    const expected = expectedRings[index];
    const actual = result.rings[index];
    if (actual.id !== expected.id || actual.role !== expected.role) mismatch(`ring ${index + 1} shape`);
  }
  if (result.houses.length !== 12 || result.houses.some((house, index) => house.index !== index + 1)) {
    mismatch('houses must be indexes 1 through 12');
  }
  return result;
}

module.exports = { validateChartResultForRequestCore };
