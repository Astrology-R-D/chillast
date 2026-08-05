'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  centralDifferenceRatio,
  distinctRgbInRect,
  pixelDifferenceCount,
  rectsIntersect,
} = require('./NativeImageMetrics');

function bitmap(width, height, rgb = [20, 30, 40]) {
  const value = Buffer.alloc(width * height * 4);
  for (let offset = 0; offset < value.length; offset += 4) {
    value[offset] = rgb[2];
    value[offset + 1] = rgb[1];
    value[offset + 2] = rgb[0];
    value[offset + 3] = 255;
  }
  return value;
}

function setRgb(value, width, x, y, [red, green, blue]) {
  const offset = (y * width + x) * 4;
  value[offset] = blue;
  value[offset + 1] = green;
  value[offset + 2] = red;
}

test('measures the exact non-surface ratio in the central half', () => {
  const value = bitmap(4, 4);
  setRgb(value, 4, 1, 1, [200, 100, 50]);

  assert.equal(centralDifferenceRatio(value, 4, 4, [20, 30, 40]), 0.25);
});

test('counts distinct RGB values in a scaled logical rectangle', () => {
  const value = bitmap(6, 4);
  setRgb(value, 6, 2, 2, [1, 2, 3]);
  setRgb(value, 6, 3, 2, [4, 5, 6]);

  assert.equal(distinctRgbInRect(value, 6, {
    left: 1, top: 1, width: 2, height: 1,
    actualScaleX: 2, actualScaleY: 2,
  }), 3);
});

test('clips scaled logical rectangles to bitmap bounds', () => {
  const value = bitmap(4, 4);
  setRgb(value, 4, 0, 0, [1, 2, 3]);

  assert.equal(distinctRgbInRect(value, 4, {
    left: -1, top: -1, width: 2, height: 2,
    actualScaleX: 2, actualScaleY: 2,
  }), 2);
  assert.throws(() => distinctRgbInRect(value, 4, {
    left: 8, top: 8, width: 1, height: 1,
    actualScaleX: 2, actualScaleY: 2,
  }), /outside bitmap/i);
});

test('counts exact changed pixels inside a scaled logical rectangle', () => {
  const before = bitmap(6, 4);
  const after = Buffer.from(before);
  setRgb(after, 6, 2, 2, [1, 2, 3]);
  setRgb(after, 6, 4, 3, [4, 5, 6]);
  setRgb(after, 6, 0, 0, [7, 8, 9]);

  assert.equal(pixelDifferenceCount(before, after, 6, {
    left: 1, top: 1, width: 2, height: 1,
    actualScaleX: 2, actualScaleY: 2,
  }), 2);
});

test('rectangle intersection excludes touching edges', () => {
  const left = { left: 0, top: 0, width: 10, height: 10 };
  assert.equal(rectsIntersect(left, { left: 9, top: 9, width: 2, height: 2 }), true);
  assert.equal(rectsIntersect(left, { left: 10, top: 0, width: 2, height: 2 }), false);
  assert.equal(rectsIntersect(left, { left: 0, top: 10, width: 2, height: 2 }), false);
});
