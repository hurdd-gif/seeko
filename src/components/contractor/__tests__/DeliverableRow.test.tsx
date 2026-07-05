// src/components/contractor/__tests__/DeliverableRow.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ContractorDeliverable } from '@/lib/contractor-index';
import { DeliverableRow } from '../DeliverableRow';

const base: ContractorDeliverable = {
  id: 't1',
  name: 'Main menu wireframes',
  department: 'UI/UX',
  status: 'In Progress',
  priority: 'High',
  deadline: '2026-07-10',
  progress: 45,
  description: 'Low-fi flows for the main menu.',
};

describe('DeliverableRow', () => {
  it('renders name, department, status pill, and progress in the collapsed row', () => {
    render(<DeliverableRow deliverable={base} />);
    expect(screen.getByText('Main menu wireframes')).toBeInTheDocument();
    expect(screen.getByText('UI/UX')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
    expect(screen.getByText('45%')).toBeInTheDocument();
  });

  it('expands on click and commits a new progress value', async () => {
    const onProgressCommit = vi.fn().mockResolvedValue(undefined);
    render(<DeliverableRow deliverable={base} onProgressCommit={onProgressCommit} />);

    fireEvent.click(screen.getByRole('button', { name: /main menu wireframes/i }));
    const slider = await screen.findByRole('slider', { name: /progress/i });
    fireEvent.change(slider, { target: { value: '70' } });
    fireEvent.pointerUp(slider);

    await waitFor(() => expect(onProgressCommit).toHaveBeenCalledWith('t1', 70));
  });

  it('uploads a deliverable file through the injected handler', async () => {
    const onUpload = vi.fn().mockResolvedValue(undefined);
    render(<DeliverableRow deliverable={base} onUpload={onUpload} />);

    fireEvent.click(screen.getByRole('button', { name: /main menu wireframes/i }));
    const file = new File(['x'], 'menu.fig', { type: 'application/octet-stream' });
    const input = await screen.findByLabelText(/upload deliverable/i);
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith('t1', [file]));
  });
});
