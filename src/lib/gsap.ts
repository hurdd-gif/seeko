/**
 * Central GSAP module — registers plugins once and re-exports.
 *
 * Coexists with motion/react: GSAP for scroll-driven, timeline-heavy,
 * SVG, and complex sequenced motion. motion/react for component-state
 * and gesture-driven animation tied to React render cycles.
 *
 * See docs/visual-guidelines.md "Motion" section for the policy.
 */

import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { Flip } from 'gsap/Flip';
import { Observer } from 'gsap/Observer';
import { Draggable } from 'gsap/Draggable';

// Bonus plugins from vendor/gsap-bonus (not on public npm).
import { SplitText } from '../../vendor/gsap-bonus/SplitText.js';
import { DrawSVGPlugin } from '../../vendor/gsap-bonus/DrawSVGPlugin.js';
import { MorphSVGPlugin } from '../../vendor/gsap-bonus/MorphSVGPlugin.js';
import { ScrollSmoother } from '../../vendor/gsap-bonus/ScrollSmoother.js';
import { CustomEase } from '../../vendor/gsap-bonus/CustomEase.js';

if (typeof window !== 'undefined') {
  gsap.registerPlugin(
    ScrollTrigger,
    ScrollToPlugin,
    Flip,
    Observer,
    Draggable,
    SplitText,
    DrawSVGPlugin,
    MorphSVGPlugin,
    ScrollSmoother,
    CustomEase
  );
}

export {
  gsap,
  ScrollTrigger,
  ScrollToPlugin,
  Flip,
  Observer,
  Draggable,
  SplitText,
  DrawSVGPlugin,
  MorphSVGPlugin,
  ScrollSmoother,
  CustomEase,
};
