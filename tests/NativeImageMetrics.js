'use strict';

const supportedScaleFactors = [1, 1.25, 1.5, 1.75, 2];
const scaleTolerance = 0.01;

function selectScaleFactor(image, requestedScaleFactor) {
  if (!supportedScaleFactors.some((scale) => Math.abs(scale - requestedScaleFactor) <= scaleTolerance)) {
    throw new Error(`unsupported device scale factor: ${requestedScaleFactor}`);
  }
  const available = image.getScaleFactors()
    .filter((scale) => Number.isFinite(scale) && scale > 0)
    .sort((left, right) => left - right);
  if (!available.length) throw new Error('captured image has no scale representations');
  if (available.some((scale) => Math.abs(scale - requestedScaleFactor) <= scaleTolerance)) return requestedScaleFactor;
  return available.reduce((closest, scale) => (
    Math.abs(scale - requestedScaleFactor) < Math.abs(closest - requestedScaleFactor) ? scale : closest
  ));
}

function imageMetrics(image, { logicalWidth, logicalHeight, requestedScaleFactor }) {
  const selectedScaleFactor = selectScaleFactor(image, requestedScaleFactor);
  const size = image.getSize(selectedScaleFactor);
  const png = image.toPNG({ scaleFactor: selectedScaleFactor });
  const bitmap = image.toBitmap({ scaleFactor: selectedScaleFactor });
  const actualScaleX = size.width / logicalWidth;
  const actualScaleY = size.height / logicalHeight;
  const actualScaleTolerance = Math.max(scaleTolerance, 1 / Math.min(logicalWidth, logicalHeight));
  if (Math.abs(actualScaleX - actualScaleY) > actualScaleTolerance) {
    throw new Error(`inconsistent native scale: ${actualScaleX}x${actualScaleY}`);
  }
  const actualScale = (actualScaleX + actualScaleY) / 2;
  if (!supportedScaleFactors.some((scale) => Math.abs(scale - actualScale) <= actualScaleTolerance)) {
    throw new Error(`unsupported actual scale: ${actualScale}`);
  }
  const expectedBitmapBytes = size.width * size.height * 4;
  if (bitmap.length < expectedBitmapBytes) {
    throw new Error(`captured bitmap is incomplete: expected ${expectedBitmapBytes} bytes, got ${bitmap.length}`);
  }

  let minLuminance = 255;
  let maxLuminance = 0;
  const colors = new Set();
  for (let offset = 0; offset < expectedBitmapBytes; offset += 4 * 97) {
    const blue = bitmap[offset] ?? 0;
    const green = bitmap[offset + 1] ?? 0;
    const red = bitmap[offset + 2] ?? 0;
    const luminance = Math.round((red + green + blue) / 3);
    minLuminance = Math.min(minLuminance, luminance);
    maxLuminance = Math.max(maxLuminance, luminance);
    colors.add(`${red},${green},${blue}`);
  }

  return {
    png,
    requestedScaleFactor,
    selectedScaleFactor,
    nativeWidth: size.width,
    nativeHeight: size.height,
    actualScaleX,
    actualScaleY,
    bytes: png.length,
    luminanceRange: maxLuminance - minLuminance,
    sampledColors: colors.size,
  };
}

module.exports = { imageMetrics, selectScaleFactor };
