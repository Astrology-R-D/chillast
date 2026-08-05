import type { ColumnDef, FilterFn, SortingFn } from '@tanstack/react-table';
import type { ComparisonMode, ExplorerTab } from '../../../stores/chartWorkspacePersistence';
import { compareNullableNumbers, type ExplorerRow, type MachineValue } from './explorerRows';

export type ChartColumnId = string;

const TAB_COLUMNS = {
  planets: ['selected', 'ring', 'point', 'longitude', 'sign', 'degreeInSign', 'house', 'retrograde'],
  houses: ['selected', 'house', 'cuspLongitude', 'sign', 'degreeInSign'],
  aspects: ['selected', 'ringA', 'point1', 'aspect', 'ringB', 'point2', 'orb', 'strength'],
  distributions: ['selected', 'section', 'key', 'value', 'startAge', 'endAge'],
} as const;

const SIDE_BY_SIDE_COLUMNS = [
  'selected', 'point', 'firstRing', 'firstLongitude', 'firstSign', 'firstHouse', 'firstRetrograde',
  'secondRing', 'secondLongitude', 'secondSign', 'secondHouse', 'secondRetrograde',
] as const;

const NUMERIC_IDS = new Set([
  'longitude', 'degreeInSign', 'house', 'cuspLongitude', 'orb', 'strength', 'value', 'startAge', 'endAge',
  'firstLongitude', 'firstHouse', 'secondLongitude', 'secondHouse', 'longitudeDelta', 'houseDelta',
]);
const BOOLEAN_IDS = new Set(['retrograde', 'firstRetrograde', 'secondRetrograde']);
const TOKEN_IDS = new Set(['ring', 'sign', 'ringA', 'aspect', 'ringB', 'section', 'firstRing', 'firstSign', 'secondRing', 'secondSign']);

export function columnIds(tab: ExplorerTab, mode: ComparisonMode = 'merged'): string[] {
  if (tab !== 'comparison') return [...TAB_COLUMNS[tab]];
  if (mode === 'merged') return [...TAB_COLUMNS.planets];
  if (mode === 'sideBySide') return [...SIDE_BY_SIDE_COLUMNS];
  return [...SIDE_BY_SIDE_COLUMNS, 'longitudeDelta', 'houseDelta'];
}

export function allowedColumnIds(): Record<ExplorerTab, ReadonlySet<string>> {
  return {
    planets: new Set(columnIds('planets')),
    houses: new Set(columnIds('houses')),
    aspects: new Set(columnIds('aspects')),
    distributions: new Set(columnIds('distributions')),
    comparison: new Set([
      ...columnIds('comparison', 'merged'),
      ...columnIds('comparison', 'sideBySide'),
      ...columnIds('comparison', 'difference'),
    ]),
  };
}

const textFilter: FilterFn<ExplorerRow> = (row, id, value) =>
  String(row.getValue<MachineValue>(id) ?? '').toLocaleLowerCase().includes(String(value ?? '').toLocaleLowerCase());

const tokenFilter: FilterFn<ExplorerRow> = (row, id, value) => {
  const candidate = row.getValue<MachineValue>(id);
  const tokens = value instanceof Set ? [...value] : Array.isArray(value) ? value : [value];
  return tokens.length === 0 || tokens.includes(candidate);
};

const numberFilter: FilterFn<ExplorerRow> = (row, id, value) => {
  const candidate = row.getValue<MachineValue>(id);
  if (typeof candidate !== 'number') return false;
  const [minimum, maximum] = Array.isArray(value) ? value : [null, null];
  return (typeof minimum !== 'number' || candidate >= minimum)
    && (typeof maximum !== 'number' || candidate <= maximum);
};

const booleanFilter: FilterFn<ExplorerRow> = (row, id, value) =>
  typeof value !== 'boolean' || row.getValue(id) === value;

const nullableNumberSort: SortingFn<ExplorerRow> = (left, right, id) => {
  const leftValue = left.getValue<MachineValue>(id);
  const rightValue = right.getValue<MachineValue>(id);
  return compareNullableNumbers(
    typeof leftValue === 'number' ? leftValue : null,
    typeof rightValue === 'number' ? rightValue : null,
    false,
  );
};

function filterFor(id: string): FilterFn<ExplorerRow> {
  if (NUMERIC_IDS.has(id)) return numberFilter;
  if (BOOLEAN_IDS.has(id)) return booleanFilter;
  if (TOKEN_IDS.has(id)) return tokenFilter;
  return textFilter;
}

export function columnsFor(
  tab: ExplorerTab,
  mode: ComparisonMode,
  labels: Record<string, string>,
): ColumnDef<ExplorerRow, MachineValue>[] {
  return columnIds(tab, mode).map((id): ColumnDef<ExplorerRow, MachineValue> => {
    if (id === 'selected') {
      return {
        id,
        header: labels[id] ?? id,
        accessorFn: () => null,
        enableHiding: false,
        enablePinning: false,
        enableSorting: false,
        enableColumnFilter: false,
        size: 38,
      };
    }
    return {
      id,
      header: labels[id] ?? id,
      accessorFn: (row) => {
        const value = row.values[id] ?? null;
        // TanStack keeps undefined last in both sort directions; machine rows retain explicit null.
        return NUMERIC_IDS.has(id) && value === null ? undefined as unknown as MachineValue : value;
      },
      filterFn: filterFor(id),
      sortingFn: NUMERIC_IDS.has(id) ? nullableNumberSort : 'alphanumeric',
      sortUndefined: 'last',
      minSize: 72,
      size: NUMERIC_IDS.has(id) ? 104 : 128,
    };
  });
}
