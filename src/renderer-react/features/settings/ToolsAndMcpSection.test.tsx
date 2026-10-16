import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { apiClient } from '../../api/client';
import { I18nProvider } from '../../i18n/I18nProvider';
import { ToolsAndMcpSection } from './ToolsAndMcpSection';

test('new registered tools get editable limits, unlimited persists as zero, invalid limits do not save', async () => {
  const save = vi.spyOn(apiClient, 'setAiToolCallLimits').mockResolvedValue({ ok: true });
  const changed = vi.fn();
  render(<I18nProvider dictionary={{}}><ToolsAndMcpSection
    tools={[{ id: 'future', category: 'test', enabled: true, ready: true, tools: [
      { name: 'new_tool', description: 'Future tool', callLimit: 5 },
      { name: 'other_tool', description: 'Other tool' },
    ] }]} mcp={undefined} onToolsChanged={changed} onMcpChanged={vi.fn()} /></I18nProvider>);
  expect(screen.getByLabelText('new_tool 每轮次数')).toHaveValue(5);
  fireEvent.change(screen.getByLabelText('new_tool 每轮次数'), { target: { value: '-1' } });
  fireEvent.click(screen.getByText('保存工具调用限制'));
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('new_tool 无限制'));
  fireEvent.change(screen.getByLabelText('other_tool 每轮次数'), { target: { value: '7' } });
  fireEvent.click(screen.getByText('保存工具调用限制'));
  await waitFor(() => expect(changed).toHaveBeenCalledOnce());
  expect(save).toHaveBeenCalledWith({ new_tool: 0, other_tool: 7 });
  expect(screen.getByRole('status')).toHaveTextContent('下一轮');
});
