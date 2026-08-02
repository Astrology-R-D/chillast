import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useState } from 'react';
import { expect, test, vi } from 'vitest';
import locale from '../../../locale/zh.json';
import { apiClient } from '../api/client';
import { I18nProvider } from '../i18n/I18nProvider';
import { DirtyNavigationProvider, useDirtyNavigation, type DraftRegistration } from './DirtyNavigationProvider';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => { resolve = yes; });
  return { promise, resolve };
}

function Harness({ registration }: { registration: DraftRegistration | null }) {
  const guard = useDirtyNavigation();
  const [result, setResult] = useState('');
  useEffect(() => guard.register(registration), [guard, registration]);
  return <main data-testid="background">
    <button onClick={() => void guard.requestTransition(() => setResult('ran')).then((ok) => !ok && setResult('blocked'))}>leave</button>
    <output>{result}</output>
  </main>;
}

function view(registration: DraftRegistration | null) {
  return render(<I18nProvider dictionary={locale}><DirtyNavigationProvider><Harness registration={registration} /></DirtyNavigationProvider></I18nProvider>);
}

test('executes clean transitions immediately and rejects a second pending dirty request', async () => {
  vi.spyOn(apiClient, 'onCloseRequested').mockReturnValue(() => {});
  const registration = { dirty: true, save: vi.fn(), discard: vi.fn() };
  view(registration);
  await userEvent.click(screen.getByRole('button', { name: 'leave' }));
  expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'leave' }));
  expect(screen.getByText('blocked')).toBeInTheDocument();
  await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: locale.dirty.cancel }));
  expect(registration.discard).not.toHaveBeenCalled();
});

test('saves, discards, cancels, traps focus, restores origin, and reports failed saves', async () => {
  vi.spyOn(apiClient, 'onCloseRequested').mockReturnValue(() => {});
  const pending = deferred<boolean>();
  const registration = { dirty: true, save: vi.fn().mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('disk')), discard: vi.fn() };
  view(registration);
  const origin = screen.getByRole('button', { name: 'leave' });
  origin.focus(); fireEvent.click(origin);
  const dialog = screen.getByRole('alertdialog');
  expect(document.querySelector('.dirty-navigation__background')).toHaveAttribute('inert');
  await userEvent.click(within(dialog).getByRole('button', { name: locale.dirty.save }));
  const status = within(dialog).getByRole('status');
  expect(status).toHaveFocus();
  fireEvent.keyDown(status, { key: 'Escape' });
  expect(dialog).toBeInTheDocument();
  await act(async () => pending.resolve(false));
  expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
  await userEvent.click(within(dialog).getByRole('button', { name: locale.dirty.save }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('disk');
  await userEvent.click(within(dialog).getByRole('button', { name: locale.dirty.discard }));
  expect(registration.discard).toHaveBeenCalledOnce();
  expect(screen.getByText('ran')).toBeInTheDocument();
  await waitFor(() => expect(origin).toHaveFocus());
});

test('handles native close through the same dialog and cancels a pending request on unmount', async () => {
  let requestClose!: () => void;
  const cleanup = vi.fn();
  vi.spyOn(apiClient, 'onCloseRequested').mockImplementation((callback) => { requestClose = callback; return cleanup; });
  const decide = vi.spyOn(apiClient, 'decideClose').mockResolvedValue(true);
  const registration = { dirty: true, save: vi.fn().mockResolvedValue(true), discard: vi.fn() };
  const rendered = view(registration);
  act(() => requestClose());
  await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: locale.dirty.cancel }));
  expect(decide).toHaveBeenCalledWith('cancel');
  act(() => requestClose());
  rendered.unmount();
  expect(cleanup).toHaveBeenCalledOnce();
  expect(decide).toHaveBeenLastCalledWith('cancel');
});
