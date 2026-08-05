'use strict';

const minimumScaleFactor = 0.5;
const maximumScaleFactor = 4;

function selectScaleFactor(image, requestedScaleFactor) {
  if (!Number.isFinite(requestedScaleFactor)
    || requestedScaleFactor < minimumScaleFactor || requestedScaleFactor > maximumScaleFactor) {
    throw new Error(`unsupported device scale factor: ${requestedScaleFactor}`);
  }
  const available = image.getScaleFactors()
    .filter((scale) => Number.isFinite(scale) && scale > 0)
    .sort((left, right) => left - right);
  if (!available.length) throw new Error('captured image has no scale representations');
  const exactTolerance = Number.EPSILON * 16 * Math.max(1, Math.abs(requestedScaleFactor));
  if (available.some((scale) => Math.abs(scale - requestedScaleFactor) <= exactTolerance)) return requestedScaleFactor;
  return available.reduce((closest, scale) => (
    Math.abs(scale - requestedScaleFactor) < Math.abs(closest - requestedScaleFactor) ? scale : closest
  ));
}

function bitmapHeight(bitmap, width) {
  if (!Buffer.isBuffer(bitmap) || !Number.isInteger(width) || width <= 0
    || bitmap.length % (width * 4) !== 0) {
    throw new Error('invalid BGRA bitmap dimensions');
  }
  return bitmap.length / (width * 4);
}

function nativeRect(bitmap, width, rect) {
  const height = bitmapHeight(bitmap, width);
  const scaleX = rect.actualScaleX ?? 1;
  const scaleY = rect.actualScaleY ?? 1;
  if (![rect.left, rect.top, rect.width, rect.height, scaleX, scaleY].every(Number.isFinite)
    || rect.width <= 0 || rect.height <= 0 || scaleX <= 0 || scaleY <= 0) {
    throw new Error('invalid logical bitmap rectangle');
  }
  const left = Math.max(0, Math.floor(rect.left * scaleX));
  const top = Math.max(0, Math.floor(rect.top * scaleY));
  const right = Math.min(width, Math.ceil((rect.left + rect.width) * scaleX));
  const bottom = Math.min(height, Math.ceil((rect.top + rect.height) * scaleY));
  if (left >= right || top >= bottom) throw new Error('logical rectangle is outside bitmap');
  return { left, top, right, bottom };
}

function centralDifferenceRatio(bitmap, width, height, surfaceRgb) {
  if (bitmapHeight(bitmap, width) !== height || !Array.isArray(surfaceRgb) || surfaceRgb.length !== 3) {
    throw new Error('invalid central difference input');
  }
  const rect = {
    left: Math.floor(width * 0.25), top: Math.floor(height * 0.25),
    right: Math.ceil(width * 0.75), bottom: Math.ceil(height * 0.75),
  };
  let different = 0;
  let total = 0;
  for (let y = rect.top; y < rect.bottom; y += 1) {
    for (let x = rect.left; x < rect.right; x += 1) {
      const offset = (y * width + x) * 4;
      if (bitmap[offset + 2] !== surfaceRgb[0]
        || bitmap[offset + 1] !== surfaceRgb[1]
        || bitmap[offset] !== surfaceRgb[2]) different += 1;
      total += 1;
    }
  }
  return different / total;
}

function distinctRgbInRect(bitmap, width, rect) {
  const native = nativeRect(bitmap, width, rect);
  const colors = new Set();
  for (let y = native.top; y < native.bottom; y += 1) {
    for (let x = native.left; x < native.right; x += 1) {
      const offset = (y * width + x) * 4;
      colors.add(`${bitmap[offset + 2]},${bitmap[offset + 1]},${bitmap[offset]}`);
    }
  }
  return colors.size;
}

function pixelDifferenceCount(before, after, width, rect) {
  if (!Buffer.isBuffer(after) || before.length !== after.length) {
    throw new Error('bitmap dimensions do not match');
  }
  const native = nativeRect(before, width, rect);
  let changed = 0;
  for (let y = native.top; y < native.bottom; y += 1) {
    for (let x = native.left; x < native.right; x += 1) {
      const offset = (y * width + x) * 4;
      if (before[offset] !== after[offset] || before[offset + 1] !== after[offset + 1]
        || before[offset + 2] !== after[offset + 2] || before[offset + 3] !== after[offset + 3]) changed += 1;
    }
  }
  return changed;
}

function rectsIntersect(left, right) {
  return left.left < right.left + right.width && left.left + left.width > right.left
    && left.top < right.top + right.height && left.top + left.height > right.top;
}

function imageMetrics(image, { logicalWidth, logicalHeight, requestedScaleFactor }) {
  const selectedScaleFactor = selectScaleFactor(image, requestedScaleFactor);
  const size = image.getSize(selectedScaleFactor);
  const png = image.toPNG({ scaleFactor: selectedScaleFactor });
  const bitmap = image.toBitmap({ scaleFactor: selectedScaleFactor });
  const actualScaleX = size.width / logicalWidth;
  const actualScaleY = size.height / logicalHeight;
  const actualScale = (actualScaleX + actualScaleY) / 2;
  const actualScaleTolerance = Math.max(actualScale * 0.005, 1 / Math.min(logicalWidth, logicalHeight));
  if (Math.abs(actualScaleX - actualScaleY) > actualScaleTolerance) {
    throw new Error(`inconsistent native scale: ${actualScaleX}x${actualScaleY}`);
  }
  if (!Number.isFinite(actualScale)
    || actualScale < minimumScaleFactor - actualScaleTolerance
    || actualScale > maximumScaleFactor + actualScaleTolerance) {
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

module.exports = {
  centralDifferenceRatio,
  distinctRgbInRect,
  imageMetrics,
  pixelDifferenceCount,
  rectsIntersect,
  selectScaleFactor,
};
