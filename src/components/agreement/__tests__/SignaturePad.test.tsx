import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SignaturePad } from '../SignaturePad';

// jsdom ships no canvas backend, so the pad's 2D context + PNG export must be
// stubbed. These mocks only need to satisfy the calls SignaturePad makes while
// drawing; the assertions below are about the component's behavior contract, not
// pixel output.
beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    closePath: vi.fn(),
    clearRect: vi.fn(),
    lineCap: '',
    lineJoin: '',
    lineWidth: 0,
    strokeStyle: '',
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => 'data:image/png;base64,SIGNED');
});

function drawStroke(canvas: HTMLElement) {
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 40, clientY: 30, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 40, clientY: 30, pointerId: 1 });
}

describe('SignaturePad', () => {
  it('starts empty: Clear is disabled and no drawn value is emitted', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);

    expect(screen.getByRole('button', { name: /clear/i })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'drawn' }),
    );
  });

  it('drawing a stroke enables Clear and emits a non-empty drawn dataURL', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);

    drawStroke(screen.getByTestId('signature-canvas'));

    expect(screen.getByRole('button', { name: /clear/i })).toBeEnabled();
    const last = onChange.mock.calls.at(-1)?.[0];
    expect(last).toMatchObject({ kind: 'drawn' });
    expect(last.dataUrl).toBeTruthy();
  });

  it('clearing a drawn stroke disables Clear again and emits null', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);

    drawStroke(screen.getByTestId('signature-canvas'));
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));

    expect(screen.getByRole('button', { name: /clear/i })).toBeDisabled();
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('Type mode emits the typed name as the signature value', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /^type$/i }));
    fireEvent.change(screen.getByPlaceholderText(/type your full name/i), {
      target: { value: 'Jane Doe' },
    });

    expect(onChange).toHaveBeenLastCalledWith({ kind: 'typed', text: 'Jane Doe' });
  });

  it('clearing the typed name (empty) emits null', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /^type$/i }));
    const input = screen.getByPlaceholderText(/type your full name/i);
    fireEvent.change(input, { target: { value: 'Jane' } });
    fireEvent.change(input, { target: { value: '' } });

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('switching from a drawn signature to Type mode clears the drawn value', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);

    drawStroke(screen.getByTestId('signature-canvas'));
    expect(onChange.mock.calls.at(-1)?.[0]).toMatchObject({ kind: 'drawn' });

    fireEvent.click(screen.getByRole('button', { name: /^type$/i }));

    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it('switching from a typed name back to Draw mode clears the typed value', () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);

    fireEvent.click(screen.getByRole('button', { name: /^type$/i }));
    fireEvent.change(screen.getByPlaceholderText(/type your full name/i), {
      target: { value: 'Jane Doe' },
    });
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'typed', text: 'Jane Doe' });

    fireEvent.click(screen.getByRole('button', { name: /^draw$/i }));

    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('button', { name: /clear/i })).toBeDisabled();
  });
});
