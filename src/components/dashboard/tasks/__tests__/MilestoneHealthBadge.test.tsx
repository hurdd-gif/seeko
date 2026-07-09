import { render } from '@testing-library/react';
import { MilestoneHealthBadge } from '../MilestoneHealthBadge';

// The glyph paints its color via `stroke` (on_track ring/check) or `fill`
// (at_risk square, off_track diamond). These helpers read whichever the glyph
// for that level uses, so the test asserts the actual rendered signal color.
function ringStroke(c: HTMLElement) {
  return c.querySelector('circle')?.getAttribute('stroke');
}
function squareFill(c: HTMLElement) {
  return c.querySelector('rect')?.getAttribute('fill');
}
function diamondFill(c: HTMLElement) {
  return c.querySelector('path')?.getAttribute('fill');
}

describe('MilestoneHealthBadge', () => {
  // Default = dark issues rail. These colors are tuned for the dark surface and
  // MUST NOT change — MilestoneEditPopover + MilestonesSection depend on them.
  describe('default (dark rail)', () => {
    it('on_track uses the dark-rail green', () => {
      const { container } = render(<MilestoneHealthBadge level="on_track" />);
      expect(ringStroke(container)).toBe('#22c55e');
    });
    it('at_risk uses the dark-rail amber', () => {
      const { container } = render(<MilestoneHealthBadge level="at_risk" />);
      expect(squareFill(container)).toBe('#f59e0b');
    });
    it('off_track uses the dark-rail red', () => {
      const { container } = render(<MilestoneHealthBadge level="off_track" />);
      expect(diamondFill(container)).toBe('#ef4444');
    });
  });

  // light = relayed onto the white Overview card. Glyph colors must clear the
  // 3:1 graphic-contrast floor on #fff, reusing the validated AA-on-white
  // signal palette already used by the Overview priority chevrons.
  describe('light (AA-on-white)', () => {
    it('on_track deepens green to >=3:1 on white', () => {
      const { container } = render(<MilestoneHealthBadge level="on_track" light />);
      expect(ringStroke(container)).toBe('#16a34a');
    });
    it('at_risk reuses the validated chevron amber #bd7e10', () => {
      const { container } = render(<MilestoneHealthBadge level="at_risk" light />);
      expect(squareFill(container)).toBe('#bd7e10');
    });
    it('off_track reuses the validated chevron red #f04438', () => {
      const { container } = render(<MilestoneHealthBadge level="off_track" light />);
      expect(diamondFill(container)).toBe('#f04438');
    });
    it('still renders the text label so meaning is never color-only', () => {
      const { getByText } = render(
        <MilestoneHealthBadge level="at_risk" light showLabel />,
      );
      expect(getByText('At risk')).toBeInTheDocument();
    });
  });
});
