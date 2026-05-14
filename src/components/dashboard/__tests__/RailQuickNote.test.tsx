import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RailQuickNote } from '../RailQuickNote';

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

describe('RailQuickNote', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 'note-1' }) }) as never;
  });

  it('submits the input on Enter and clears it', async () => {
    render(<RailQuickNote />);
    const input = screen.getByPlaceholderText(/Drop a thought/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'fix login bug' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/notes', expect.objectContaining({ method: 'POST' })),
    );
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('does not submit empty input', () => {
    render(<RailQuickNote />);
    const input = screen.getByPlaceholderText(/Drop a thought/i);
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps the input value on error', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false });
    render(<RailQuickNote />);
    const input = screen.getByPlaceholderText(/Drop a thought/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'whoops' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    await waitFor(() => expect(input.value).toBe('whoops'));
  });
});
