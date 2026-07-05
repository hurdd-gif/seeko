import { render, screen, fireEvent } from '@testing-library/react';
import { CreateTaskModal } from '../CreateTaskModal';

// The modal calls the task action on submit; stub it so the unit stays
// focused on the modal's own contract.
const createTask = vi.fn();
vi.mock('@/lib/dashboard-actions', () => ({
  createTask: (...args: unknown[]) => createTask(...args),
}));

const baseProps = {
  onClose: vi.fn(),
  team: [{ id: 't1', display_name: 'Karti' }],
  areas: [{ id: 'a1', name: 'Main Game' }],
};

describe('CreateTaskModal', () => {
  it('renders nothing when closed', () => {
    render(<CreateTaskModal open={false} {...baseProps} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders the New task dialog when open', () => {
    render(<CreateTaskModal open {...baseProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('New task')).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText('What needs to get done?'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Create task' }),
    ).toBeInTheDocument();
  });

  it('disables Create task until the required name is provided', () => {
    render(<CreateTaskModal open {...baseProps} />);
    const submit = screen.getByRole('button', { name: 'Create task' });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('What needs to get done?'), {
      target: { value: 'Ship the thing' },
    });
    expect(submit).toBeEnabled();

    fireEvent.change(screen.getByPlaceholderText('What needs to get done?'), {
      target: { value: '   ' },
    });
    expect(submit).toBeDisabled();
  });

  it('shows a validation error when the form is submitted with an empty name', () => {
    render(<CreateTaskModal open {...baseProps} />);
    const form = screen
      .getByRole('button', { name: 'Create task' })
      .closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    expect(screen.getByText('Task name is required')).toBeInTheDocument();
    expect(createTask).not.toHaveBeenCalled();
  });

  it('closes when Cancel is clicked', () => {
    const onClose = vi.fn();
    render(<CreateTaskModal open {...baseProps} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
