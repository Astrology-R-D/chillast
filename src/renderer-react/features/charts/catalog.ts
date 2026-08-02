import {
  CHART_TYPES,
  type ChartCatalogDefinition,
  type ChartDescriptor,
  type ChartType,
} from './contracts';

export { CHART_TYPES };

export const CHART_DESCRIPTORS = {
  natal: { route: 'personal', requiresSecondary: false, serviceOptions: [], controls: [] },
  transit: { route: 'personal', requiresSecondary: false, serviceOptions: ['targetDate'], controls: ['targetDate'] },
  tertiaryProgressed: { route: 'personal', requiresSecondary: false, serviceOptions: ['targetDate'], controls: ['targetDate'] },
  progressed: { route: 'personal', requiresSecondary: false, serviceOptions: ['targetDate'], controls: ['targetDate'] },
  lunarReturn: { route: 'personal', requiresSecondary: false, serviceOptions: ['targetDate'], controls: ['targetDate'] },
  solarReturn: { route: 'personal', requiresSecondary: false, serviceOptions: ['year'], controls: ['returnYear'] },
  solarArc: { route: 'personal', requiresSecondary: false, serviceOptions: ['targetDate'], controls: ['targetDate'] },
  firdaria: { route: 'personal', requiresSecondary: false, serviceOptions: ['targetDate'], controls: ['targetDate'] },
  profection: { route: 'personal', requiresSecondary: false, serviceOptions: ['targetDate'], controls: ['targetDate'] },
  relocation: { route: 'personal', requiresSecondary: false, serviceOptions: ['location'], controls: ['relocationPlace'] },
  synastry: { route: 'relationship', requiresSecondary: true, serviceOptions: [], controls: ['secondaryProfile'] },
  composite: { route: 'relationship', requiresSecondary: true, serviceOptions: [], controls: ['secondaryProfile'] },
  marx: { route: 'relationship', requiresSecondary: true, serviceOptions: [], controls: ['secondaryProfile'] },
  davison: { route: 'relationship', requiresSecondary: true, serviceOptions: [], controls: ['secondaryProfile'] },
  compositeSecondary: { route: 'relationship', requiresSecondary: true, serviceOptions: ['targetDate'], controls: ['secondaryProfile', 'targetDate'] },
  compositeTertiary: { route: 'relationship', requiresSecondary: true, serviceOptions: ['targetDate'], controls: ['secondaryProfile', 'targetDate'] },
  marxSecondary: { route: 'relationship', requiresSecondary: true, serviceOptions: ['targetDate'], controls: ['secondaryProfile', 'targetDate'] },
  marxTertiary: { route: 'relationship', requiresSecondary: true, serviceOptions: ['targetDate'], controls: ['secondaryProfile', 'targetDate'] },
  davisonSecondary: { route: 'relationship', requiresSecondary: true, serviceOptions: ['targetDate'], controls: ['secondaryProfile', 'targetDate'] },
  davisonTertiary: { route: 'relationship', requiresSecondary: true, serviceOptions: ['targetDate'], controls: ['secondaryProfile', 'targetDate'] },
} satisfies Record<ChartType, ChartDescriptor>;

export const PERSONAL_CHART_TYPES = CHART_TYPES.filter(
  (type) => CHART_DESCRIPTORS[type].route === 'personal',
);

export const RELATIONSHIP_CHART_TYPES = CHART_TYPES.filter(
  (type) => CHART_DESCRIPTORS[type].route === 'relationship',
);

function formatOptions(options: readonly string[]): string {
  return `[${options.join(', ')}]`;
}

export function assertCatalogMatchesDescriptors(catalog: readonly ChartCatalogDefinition[]): void {
  for (const definition of catalog) {
    if (!Object.hasOwn(CHART_DESCRIPTORS, definition.type)) {
      throw new Error(`Unknown chart type in service catalog: ${definition.type}`);
    }
  }

  if (catalog.length !== CHART_TYPES.length) {
    throw new Error(`Chart catalog count mismatch: expected ${CHART_TYPES.length}, received ${catalog.length}`);
  }

  for (let index = 0; index < CHART_TYPES.length; index += 1) {
    const expectedType = CHART_TYPES[index];
    const definition = catalog[index];
    if (definition.type !== expectedType) {
      throw new Error(`Chart catalog order mismatch at index ${index}: expected ${expectedType}, received ${definition.type}`);
    }

    const descriptor = CHART_DESCRIPTORS[expectedType];
    if (definition.category !== descriptor.route) {
      throw new Error(`Chart route mismatch for ${expectedType}: expected ${descriptor.route}, received ${definition.category}`);
    }
    if (definition.requiresSecondary !== descriptor.requiresSecondary) {
      throw new Error(`Chart requiresSecondary mismatch for ${expectedType}: expected ${descriptor.requiresSecondary}, received ${definition.requiresSecondary}`);
    }
    if (definition.options.length !== descriptor.serviceOptions.length
      || definition.options.some((option, optionIndex) => option !== descriptor.serviceOptions[optionIndex])) {
      throw new Error(`Chart service options mismatch for ${expectedType}: expected ${formatOptions(descriptor.serviceOptions)}, received ${formatOptions(definition.options)}`);
    }
  }
}
