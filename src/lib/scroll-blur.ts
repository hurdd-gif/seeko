/**
 * Scroll-edge blur damper.
 *
 * Heavy backdrop blur on scroll-edge chrome (mobile headers, bottom navs,
 * sticky doc headers) destroys perceived smoothness during fast scrolls and
 * taxes the GPU. While any scroll container is actively scrolling we set
 * `data-scrolling` on <html>, which drops `--edge-blur-scale` (globals.css)
 * so every `.scroll-edge-blur` surface renders at a fraction of its blur
 * radius. The attribute is removed IDLE_MS after the last scroll event and
 * the full blur eases back in.
 *
 * The listener is capture-phase on window so it hears scroll events from
 * every inner overflow container (scroll doesn't bubble, but it does
 * capture), and the attribute is only written on state flips — never per
 * scroll event.
 */

const IDLE_MS = 140;

let idleTimer: number | undefined;
let scrolling = false;
let installed = false;

function onScroll() {
  if (!scrolling) {
    scrolling = true;
    document.documentElement.setAttribute('data-scrolling', '');
  }
  window.clearTimeout(idleTimer);
  idleTimer = window.setTimeout(() => {
    scrolling = false;
    document.documentElement.removeAttribute('data-scrolling');
  }, IDLE_MS);
}

export function initScrollEdgeBlurDamper() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });
}
