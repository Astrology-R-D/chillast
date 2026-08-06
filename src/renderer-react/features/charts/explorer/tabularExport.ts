import type { ExplorerRow, MachineValue } from './explorerRows';

export interface ExportColumn {
  id: string;
  visible: boolean;
}

export function selectExportRows(
  filteredRows: readonly ExplorerRow[],
  selectedIds: ReadonlySet<string>,
): ExplorerRow[] {
  const selected = filteredRows.filter((row) => selectedIds.has(row.id));
  return selected.length ? selected : [...filteredRows];
}

function machineText(value: MachineValue | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return String(value);
  // A leading apostrophe is the interoperable spreadsheet literal marker; retain the original text after it.
  return /^[\p{White_Space}\p{Cc}\p{Cf}]*[=+\-@]/u.test(value) ? `'${value}` : value;
}

function visibleColumns(columns: readonly ExportColumn[]): ExportColumn[] {
  return columns.filter(({ visible }) => visible);
}

export function toClipboardText(
  columns: readonly ExportColumn[],
  rows: readonly ExplorerRow[],
): string {
  const included = visibleColumns(columns);
  const field = (value: string) => /["\t\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return `${included.map(({ id }) => field(id)).join('\t')}\r\n${rows.map((row) =>
    `${included.map(({ id }) => field(machineText(row.values[id]))).join('\t')}\r\n`).join('')}`;
}

function csvField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(columns: readonly ExportColumn[], rows: readonly ExplorerRow[]): string {
  const included = visibleColumns(columns);
  const header = included.map(({ id }) => csvField(id)).join(',');
  const body = rows.map((row) => included.map(({ id }) => csvField(machineText(row.values[id]))).join(','));
  return `\uFEFF${[header, ...body].map((line) => `${line}\r\n`).join('')}`;
}

export async function copyExplorerData(
  columns: readonly ExportColumn[],
  rows: readonly ExplorerRow[],
): Promise<void> {
  await navigator.clipboard.writeText(toClipboardText(columns, rows));
}

export function downloadCsv(
  columns: readonly ExportColumn[],
  rows: readonly ExplorerRow[],
  filename: string,
): void {
  const url = URL.createObjectURL(new Blob([toCsv(columns, rows)], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    setTimeout(() => { anchor.remove(); URL.revokeObjectURL(url); }, 0);
  }
}
