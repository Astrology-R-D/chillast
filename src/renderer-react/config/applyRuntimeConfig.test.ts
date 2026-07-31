import { afterEach, describe, expect, test } from 'vitest';
import { applyRuntimeConfig } from './applyRuntimeConfig';

afterEach(() => {
  document.documentElement.removeAttribute('style');
});

describe('applyRuntimeConfig', () => {
  test('maps spacing, type, weight, and supported layout tokens', () => {
    applyRuntimeConfig({
      spacing: { half: '2px' },
      type: { md: '13px' },
      weight: { semibold: 600 },
      layout: {
        sidebarWidth: 228,
        chartCanvasMaxWidth: 480,
        headerHeight: 56,
        responsiveBreakpoint: 1200,
      },
    });

    const style = document.documentElement.style;
    expect(style.getPropertyValue('--sp-half')).toBe('2px');
    expect(style.getPropertyValue('--fs-md')).toBe('13px');
    expect(style.getPropertyValue('--fw-semibold')).toBe('600');
    expect(style.getPropertyValue('--sidebar-width')).toBe('228px');
    expect(style.getPropertyValue('--chart-max-width')).toBe('480px');
    expect(style.getPropertyValue('--header-height')).toBe('56px');
    expect(style.getPropertyValue('--responsive-breakpoint')).toBe('1200px');
  });

  test('does not apply legacy color tokens', () => {
    applyRuntimeConfig({ colors: { bgBase: '#1e1e1e' } });

    expect(document.documentElement.style.getPropertyValue('--bg-base')).toBe('');
  });

  test('preserves zero layout values and tolerates absent input', () => {
    expect(() => applyRuntimeConfig(null)).not.toThrow();
    expect(() => applyRuntimeConfig(undefined)).not.toThrow();
    applyRuntimeConfig({ layout: { sidebarWidth: 0 } });

    expect(document.documentElement.style.getPropertyValue('--sidebar-width')).toBe('0px');
  });

  test('removes stale managed tokens when reapplied', () => {
    applyRuntimeConfig({ spacing: { 1: '4px' }, layout: { headerHeight: 56 } });
    applyRuntimeConfig({ spacing: { 2: '8px' } });

    const style = document.documentElement.style;
    expect(style.getPropertyValue('--sp-1')).toBe('');
    expect(style.getPropertyValue('--header-height')).toBe('');
    expect(style.getPropertyValue('--sp-2')).toBe('8px');
  });
});
