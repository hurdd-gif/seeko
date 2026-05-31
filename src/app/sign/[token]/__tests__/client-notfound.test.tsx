import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SigningPageClient } from '../client';

// page.tsx routes unknown tokens AND sibling-product rows through the client as
// status='notfound', so they wear the same light terminal chrome as every other
// end state. These guard the two decisions that routing locked in: the unified
// "Link not found" terminal renders, and the signer ceremony carries no logo.
describe('SigningPageClient — not-found terminal', () => {
  it('renders the unified "Link not found" terminal', () => {
    render(<SigningPageClient token="whatever" initialData={{ status: 'notfound' }} />);
    expect(screen.getByRole('heading', { name: /link not found/i })).toBeInTheDocument();
  });

  it('renders no logo image (the S-mark was removed from the signer)', () => {
    const { container } = render(
      <SigningPageClient token="whatever" initialData={{ status: 'notfound' }} />,
    );
    expect(container.querySelector('img')).toBeNull();
  });
});
