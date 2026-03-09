# Signature Animation Design

**Goal:** Replace the basic italic-serif signature preview in the NDA agreement form with a handwriting-style font (Caveat) that animates on the success state.

## Font

Caveat (Google Font) — clean, natural handwriting. Loaded via `next/font/google` alongside Outfit and JetBrains Mono.

## Changes by Phase

### Sign Phase (live preview)
- Swap italic serif for Caveat at ~28px in the existing bordered preview box
- Rendered statically as user types — no animation
- "Digital Signature" label stays

### Success Phase (animated reveal)
- Signature (typed name in Caveat) draws in character-by-character over ~1.5s
- Each character staggers with `opacity: 0→1` and slight `x` translate (left to right) via Motion stagger
- Horizontal underline draws across using `scaleX: 0→1` after characters land
- Green checkmark and "Agreement Signed" / email confirmation text fade in after underline
- Auto-redirect after ~2.5s total

### What Stays the Same
- Three phases: read → sign → success
- Form fields (name, address, engagement type)
- API call and redirect logic
- Read phase entirely unchanged
