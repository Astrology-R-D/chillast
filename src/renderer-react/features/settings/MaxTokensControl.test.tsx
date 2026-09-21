import { fireEvent, render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { MaxTokensControl } from './MaxTokensControl';

function setup(value: number, max: number, onChange = vi.fn()) {
  const view = render(
    <MaxTokensControl value={value} max={max} onChange={onChange} limitLabel="当前模型上限 262144" ariaLabel="最大 Token 数" />,
  );
  return { ...view, onChange };
}

test('slider and number input render the same value; typed input clamps to the model limit', () => {
  const { onChange } = setup(4096, 262144);
  const range = screen.getByRole('slider', { name: '最大 Token 数' }) as HTMLInputElement;
  const number = screen.getByRole('spinbutton', { name: '最大 Token 数' }) as HTMLInputElement;
  expect(range.value).toBe('4096');
  expect(number.value).toBe('4096');
  // 受控组件：用 fireEvent.change 一次性赋值，避免逐键 typing 与父级未回写的冲突
  fireEvent.change(number, { target: { value: '999999' } });
  expect(onChange).toHaveBeenLastCalledWith(262144);
});

test('slider changes clamp into [min, max] and report the value', () => {
  const { onChange } = setup(4096, 262144);
  fireEvent.change(screen.getByRole('slider', { name: '最大 Token 数' }), { target: { value: '1' } });
  expect(onChange).toHaveBeenLastCalledWith(512); // clamped up to min
  fireEvent.change(screen.getByRole('slider', { name: '最大 Token 数' }), { target: { value: '999999' } });
  expect(onChange).toHaveBeenLastCalledWith(262144); // clamped down to max
});

test('blur after invalid input restores the last valid value', () => {
  setup(4096, 262144);
  const number = screen.getByRole('spinbutton', { name: '最大 Token 数' }) as HTMLInputElement;
  fireEvent.change(number, { target: { value: '' } }); // mid-typing: ignored
  fireEvent.blur(number);
  expect(number.value).toBe('4096');
});
