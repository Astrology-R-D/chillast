'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { imageMetrics } = require('./NativeImageMetrics');

function nativeImageMock({ scaleFactors, logicalWidth, logicalHeight, fixedSize }) {
  const calls = { getSize: [], toPNG: [], toBitmap: [] };
  const closestScale = (requested) => scaleFactors.reduce((closest, scale) => (
    Math.abs(scale - requested) < Math.abs(closest - requested) ? scale : closest
  ));
  const sizeFor = (requested) => {
    if (fixedSize) return fixedSize;
    const scale = closestScale(requested);
    return { width: Math.round(logicalWidth * scale), height: Math.round(logicalHeight * scale) };
  };
  return {
    calls,
    getScaleFactors: () => [...scaleFactors],
    getSize(scaleFactor) { calls.getSize.push(scaleFactor); return sizeFor(scaleFactor); },
    toPNG(options) { calls.toPNG.push(options); return Buffer.from('native-png'); },
    toBitmap(options) {
      calls.toBitmap.push(options);
      const size = sizeFor(options.scaleFactor);
      return Buffer.alloc(size.width * size.height * 4, 127);
    },
  };
}

for (const requestedScaleFactor of [0.5, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3, 4]) {
  test(`selects the current ${requestedScaleFactor}x representation for every NativeImage API`, () => {
    const image = nativeImageMock({ scaleFactors: [requestedScaleFactor], logicalWidth: 80, logicalHeight: 40 });

    const metrics = imageMetrics(image, { logicalWidth: 80, logicalHeight: 40, requestedScaleFactor });

    assert.deepEqual(image.calls, {
      getSize: [requestedScaleFactor],
      toPNG: [{ scaleFactor: requestedScaleFactor }],
      toBitmap: [{ scaleFactor: requestedScaleFactor }],
    });
    assert.equal(metrics.requestedScaleFactor, requestedScaleFactor);
    assert.equal(metrics.selectedScaleFactor, requestedScaleFactor);
    assert.equal(metrics.actualScaleX, requestedScaleFactor);
    assert.equal(metrics.actualScaleY, requestedScaleFactor);
  });
}

test('selects the numerically closest representation for an arbitrary fractional scale', () => {
  const image = nativeImageMock({ scaleFactors: [1.8, 2.4, 3], logicalWidth: 100, logicalHeight: 60 });

  const metrics = imageMetrics(image, { logicalWidth: 100, logicalHeight: 60, requestedScaleFactor: 2.37 });

  assert.deepEqual(image.calls, {
    getSize: [2.4],
    toPNG: [{ scaleFactor: 2.4 }],
    toBitmap: [{ scaleFactor: 2.4 }],
  });
  assert.equal(metrics.selectedScaleFactor, 2.4);
  assert.equal(metrics.actualScaleX, 2.4);
  assert.equal(metrics.actualScaleY, 2.4);
});

for (const requestedScaleFactor of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 0.49, 4.01]) {
  test(`rejects invalid requested scale ${String(requestedScaleFactor)}`, () => {
    const image = nativeImageMock({ scaleFactors: [1], logicalWidth: 100, logicalHeight: 60 });

    assert.throws(
      () => imageMetrics(image, { logicalWidth: 100, logicalHeight: 60, requestedScaleFactor }),
      /device scale factor/i,
    );
  });
}

test('uses the closest representation and derives actual scale when the requested scale is absent', () => {
  const image = nativeImageMock({ scaleFactors: [1.5, 2], logicalWidth: 100, logicalHeight: 60 });

  const metrics = imageMetrics(image, { logicalWidth: 100, logicalHeight: 60, requestedScaleFactor: 1.75 });

  assert.deepEqual(image.calls, {
    getSize: [1.5],
    toPNG: [{ scaleFactor: 1.5 }],
    toBitmap: [{ scaleFactor: 1.5 }],
  });
  assert.equal(metrics.selectedScaleFactor, 1.5);
  assert.equal(metrics.nativeWidth, 150);
  assert.equal(metrics.nativeHeight, 90);
  assert.equal(metrics.actualScaleX, 1.5);
  assert.equal(metrics.actualScaleY, 1.5);
});

test('accepts 1x representation metadata when its pixels are captured at the requested 1.75x scale', () => {
  const image = nativeImageMock({
    scaleFactors: [1], logicalWidth: 100, logicalHeight: 60, fixedSize: { width: 175, height: 105 },
  });

  const metrics = imageMetrics(image, { logicalWidth: 100, logicalHeight: 60, requestedScaleFactor: 1.75 });

  assert.deepEqual(image.calls, {
    getSize: [1],
    toPNG: [{ scaleFactor: 1 }],
    toBitmap: [{ scaleFactor: 1 }],
  });
  assert.equal(metrics.selectedScaleFactor, 1);
  assert.equal(metrics.actualScaleX, 1.75);
  assert.equal(metrics.actualScaleY, 1.75);
});

test('rejects a representation whose native dimensions imply inconsistent x and y scales', () => {
  const image = nativeImageMock({
    scaleFactors: [1], logicalWidth: 100, logicalHeight: 60, fixedSize: { width: 175, height: 90 },
  });

  assert.throws(
    () => imageMetrics(image, { logicalWidth: 100, logicalHeight: 60, requestedScaleFactor: 1.75 }),
    /inconsistent native scale/i,
  );
});

test('accepts proportional differences that exceed one pixel and the legacy absolute tolerance', () => {
  const image = nativeImageMock({
    scaleFactors: [3], logicalWidth: 250, logicalHeight: 250, fixedSize: { width: 753, height: 750 },
  });

  const metrics = imageMetrics(image, { logicalWidth: 250, logicalHeight: 250, requestedScaleFactor: 3 });

  assert.equal(metrics.actualScaleX, 3.012);
  assert.equal(metrics.actualScaleY, 3);
});

test('rejects an extreme measured scale outside the supported range', () => {
  const image = nativeImageMock({
    scaleFactors: [3], logicalWidth: 100, logicalHeight: 100, fixedSize: { width: 500, height: 500 },
  });

  assert.throws(
    () => imageMetrics(image, { logicalWidth: 100, logicalHeight: 100, requestedScaleFactor: 3 }),
    /actual scale/i,
  );
});
