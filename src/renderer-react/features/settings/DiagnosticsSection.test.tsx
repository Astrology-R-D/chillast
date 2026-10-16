import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { apiClient } from '../../api/client';
import { DiagnosticsSection } from './DiagnosticsSection';

test('exports diagnostic bundles through native selection, supports cancellation and shows errors without leaving controls busy', async () => {
  vi.spyOn(apiClient, 'getDiagnosticsInfo').mockResolvedValue({ enabled: true, directory: 'C:/logs', files: ['chillast.log'], maxFileBytes: 2097152, maxFiles: 5, lastError: null });
  const exportLog = vi.spyOn(apiClient, 'exportDiagnostics').mockResolvedValueOnce({ path: 'C:/diagnostics.zip' }).mockResolvedValueOnce(null).mockRejectedValueOnce(new Error('无法写入所选位置'));
  const open = vi.spyOn(apiClient, 'openDiagnosticsFolder').mockResolvedValue({ opened: true });
  render(<DiagnosticsSection />);
  expect(await screen.findByText('日志位置：C:/logs')).toBeInTheDocument();
  const button = screen.getByRole('button', { name: '导出诊断日志' });
  fireEvent.click(button);
  expect(await screen.findByRole('status')).toHaveTextContent('C:/diagnostics.zip');
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  await waitFor(() => expect(exportLog).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(button).toBeEnabled());
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toHaveTextContent('无法写入所选位置');
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: '打开日志目录' }));
  await waitFor(() => expect(open).toHaveBeenCalledOnce());
});
