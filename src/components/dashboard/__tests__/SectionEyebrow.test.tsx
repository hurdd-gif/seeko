import { render, screen } from '@testing-library/react';
import { Clock } from 'lucide-react';
import { SectionEyebrow } from '../SectionEyebrow';

describe('SectionEyebrow', () => {
  it('renders icon + sentence-case label', () => {
    render(<SectionEyebrow icon={Clock}>Recently visited</SectionEyebrow>);
    expect(screen.getByText('Recently visited')).toBeInTheDocument();
  });
});
