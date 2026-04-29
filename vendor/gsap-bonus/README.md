# GSAP+ Bonus Plugins (vendored)

ESM bundles of GSAP's formerly-paid bonus plugins. Distributed publicly via the GreenSock account dashboard since GSAP went fully free in 2024 (Webflow acquisition). Source: `gsap-public.zip` from greensock.com.

## What's here

Bonus plugins not included in the public `gsap` npm package:

- **DrawSVGPlugin** — animate SVG stroke draw-on
- **MorphSVGPlugin** — morph SVG shapes between paths
- **SplitText** — split text into lines/words/chars for stagger animation
- **ScrollSmoother** — buttery scroll-based scrolling
- **ScrambleTextPlugin** — text scramble effects
- **InertiaPlugin** — momentum-based animation after drag
- **MotionPathHelper** — visual path editor for MotionPath
- **GSDevTools** — dev playback timeline controls
- **Physics2DPlugin** / **PhysicsPropsPlugin** — physics-based motion
- **CustomEase / CustomBounce / CustomWiggle** — custom easing
- **PixiPlugin** — Pixi.js renderer integration
- **EaselPlugin** — EaselJS integration
- **Flip** — FLIP layout animations (also in public gsap, here for parity)

Public plugins (`Draggable`, `ScrollTrigger`, `ScrollToPlugin`, `MotionPathPlugin`, `Observer`, `EasePack`, `TextPlugin`, `CSSPlugin`, `CSSRulePlugin`) are included for completeness but should be imported from the `gsap` npm package instead.

## Usage

```ts
import { gsap } from 'gsap';
import { SplitText } from '@/lib/gsap';
// or directly:
import { SplitText } from '@/../vendor/gsap-bonus/SplitText.js';

gsap.registerPlugin(SplitText);
```

The `@/lib/gsap.ts` module re-exports everything with proper TypeScript typing and registers plugins once.

## Updating

1. Download a fresh `gsap-public.zip` from your GreenSock account: https://greensock.com/club
2. Extract and copy the contents of `gsap-public/esm/` into this directory:
   ```bash
   unzip -q ~/Downloads/gsap-public.zip -d /tmp/gsap-extract
   cp -r /tmp/gsap-extract/gsap-public/esm/* vendor/gsap-bonus/
   rm -rf /tmp/gsap-extract
   ```

## License

Per GreenSock's 2024 announcement after Webflow acquisition, all plugins are MIT-licensed and freely redistributable.
