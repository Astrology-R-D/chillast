import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExplorerRow } from './explorerRows';
import {
  copyExplorerData,
  downloadCsv,
  selectExportRows,
  toClipboardText,
  toCsv,
  type ExportColumn,
} from './tabularExport';

const columns: ExportColumn[] = [
  { id: 'point', visible: true }, { id: 'longitude', visible: true },
  { id: 'retrograde', visible: true }, { id: 'label', visible: true },
  { id: 'hidden', visible: false },
];
const rows: ExplorerRow[] = [
  { id: 'natal:sun', chartIdentity: 'natal:sun', values: { point: 'sun', longitude: 10.25, retrograde: false, label: '太阳', hidden: 'secret' } },
  { id: 'natal:moon', chartIdentity: 'natal:moon', values: { point: 'moon', longitude: null, retrograde: true, label: 'a,b\n"quoted"', hidden: 'secret' } },
];

afterEach(() => vi.restoreAllMocks());

describe('tabular explorer exports', () => {
  it('writes exact stable headers, machine values, CRLF, and visible columns to clipboard text', () => {
    expect(toClipboardText(columns, [rows[0]])).toBe(
      'point\tlongitude\tretrograde\tlabel\r\n'
      + 'sun\t10.25\tfalse\t太阳\r\n',
    );
    expect(toClipboardText(columns, [rows[1]])).toContain('moon\t\ttrue\t');
    expect(toClipboardText(columns, rows)).not.toContain('hidden\t');
    expect(toClipboardText(columns, rows)).not.toContain('secret');
  });

  it('uses selected visible rows or all filtered rows when no visible selection intersects', () => {
    expect(selectExportRows(rows, new Set(['natal:sun', 'filtered-out']))).toEqual([rows[0]]);
    expect(selectExportRows(rows, new Set(['filtered-out']))).toEqual(rows);
    expect(selectExportRows(rows, new Set())).toEqual(rows);
  });

  it('emits one UTF-8 BOM and exact RFC 4180 quoting with trailing CRLF', () => {
    expect(toCsv(columns, rows)).toBe(
      '\uFEFFpoint,longitude,retrograde,label\r\n'
      + 'sun,10.25,false,太阳\r\n'
      + 'moon,,true,"a,b\n""quoted"""\r\n',
    );
    expect(toCsv(columns, rows).match(/\uFEFF/g)).toHaveLength(1);
  });

  it('uses the trusted clipboard API unchanged', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await copyExplorerData(columns, [rows[0]]);
    expect(writeText).toHaveBeenCalledWith(toClipboardText(columns, [rows[0]]));
  });

  it('downloads UTF-8 CSV with the exact MIME and revokes its object URL', () => {
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:chart');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    downloadCsv(columns, rows, 'natal-planets.csv');
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8');
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:chart');
  });
});
