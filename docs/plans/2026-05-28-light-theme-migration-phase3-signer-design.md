# Phase 3 — Signer Ceremony Dark→Light (new bottom-sheet mockup)

> Implementation spec for Phase 3 of the External-Signing design-system migration
> (`feat/light-theme-migration`, main repo). Engine-level decisions live in the
> master plan (`~/.claude/plans/lets-plan-on-how-tender-quokka.md`); this doc
> captures the **new Paper mockup deltas**, the pre-implementation `/interface-craft`
> critique conclusions, the `/color-expert` token decisions, and the ordered build.

## What changed since the master plan
The master plan assumed Phase 3 was a **recolor** of the existing dark signer. The
user then hand-designed a **new light bottom-sheet mockup** (Paper file SK_DB, 6
mobile screens) that is a *new layout + new copy + a real Draw/Type signature pad*,
not just a recolor. This spec reconciles the two.

## Architecture decision (the one the locked decisions didn't cover)
The mockup's six screens map 1:1 onto the **existing ceremony state machine**, so the
engine stays shared and we thread `light` through it (per the master plan) — we do
NOT fork a parallel signer ceremony component:

| Mockup screen | Existing owner | Phase-3 treatment |
|---|---|---|
| 1 Request code / 2 Enter code | `VerificationForm` | `light` branch + restyled OTP cells |
| 3 Review / 4 Sign / 5 Signed | `AgreementForm` (`read`→`sign`→`success`) | `light` branch: bottom-sheet chrome, new copy, consent line, **Draw/Type pad swap** |
| 6 Expired (+ signed/revoked) | `client.tsx` `StatusPage` | `LIGHT_TERMINAL_ICON` + self-service reissue CTA |

**Signature swap is one clean branch point**, not pervasive forking:
`{light ? <SignaturePad/> : <SignatureDrawing/>}`. Onboarding (`light=false`)
keeps the auto-handwriting `SignatureDrawing` and stays **pixel-identical**.

`light` defaults to `false` (dark) on every shared component; only the signer
(`/sign/[token]`) passes `light`. Last-wins via `cn()`/twMerge.

## `/interface-craft` critique conclusions (pre-build gate) — resolved
1. **Terminal icons** → `signed=green` / `expired=neutral-ink` / `revoked=quiet-red`
   (mockup wins over the Phase-0 azure/amber ladder; azure stays reserved for
   interaction). **Reverses a Phase-0 decision — flagged to user.**
2. **Muted subtitle** → keep 18px, darken `#A2A2A2`→`#6e6e6e` (AA). *(done in lightKit)*
3. **Primary pill ring** → `:focus-visible` only; drop the rest-state 2px outline; keep `shadow-seeko` elevation.
4. **Section bottom-fade** → keep, make **dynamic** (hide once scrolled to end). Do NOT gate Continue on scroll.
5. **Type scale** → keep mobile scale; **cap the card at ~420–440px on desktop** (not `max-w-2xl`).
6. **Must-fix during build:**
   - **e-signature consent line** under the Sign button (legal — ESIGN/UETA). *(structural)*
   - restore **logo + "Powered by SEEKO Studio" footer** on every screen.
   - preserve the **sender personal-note** block (request-code/review).
   - **live** "Section N of M" counter (tie to scroll; dynamic for guardian section).
   - define the **Type** signature state (Caveat); standardize OTP active cell to azure `#0d7aff`.
   - Sign-button submitting state ("Signing…"); touch canvas ~140px tall.
   - **Expired copy** → self-service: "Your signing link has expired. Request a fresh one below." (drop hardcoded "Karti").

## `/color-expert` token decisions (baked into `lightKit.ts`)
- `LIGHT_TERMINAL_ICON` signed `#15803d` (5.02:1) · expired `#6e6e6e` (4.74:1) · revoked `#d4503e` (≥3:1 graphic) · notfound `#9a9a9a`.
- `LIGHT_SUCCESS_CHIP` / `LIGHT_SUCCESS_TEXT` = `#15803d` for the just-signed confirmation check (was azure).
- `LIGHT_RECIPIENT_MUTED` darkened `#808080`→`#6e6e6e` (AA fix).

## SignaturePad (new shared component) — `src/components/agreement/SignaturePad.tsx`
Draw **or** Type, producing a single signature value the form carries:
- **Draw**: `<canvas>` (pointer events, ~140px tall touch target), `Clear` (disabled until a stroke exists), exports a trimmed **PNG dataURL**.
- **Type**: text input rendered in Caveat; value is the typed name string.
- Emits `{ kind: 'drawn'; dataUrl } | { kind: 'typed'; text }` via `onChange`; parent threads it into form state + the sign payload as `signature_image` (Phase 4 consumes it in the PDF + cert; the Phase-3 route ignores the unknown field safely).
- `light` prop for the relit toggle/border/labels (default dark so it's safe to reuse later).
- **TDD targets** (pure logic, jsdom canvas mocked): empty pad → no value / Clear disabled; a stroke → Clear enabled + non-empty dataURL; Type mode → typed text value; switching modes clears the other mode's value.

## Ordered build (TDD where there's logic; shared-tree writes stay sequential/inline)
1. ✅ `lightKit.ts` token changes (ladder override + muted AA + success tokens).
2. `SignaturePad.tsx` — **RED→GREEN** tests, then component.
3. Relight shared components via `light` (default dark):
   `AddressAutocomplete` → `SignatureDrawing` (text color only) → `VerificationForm` → `AgreementForm` (chrome + copy + consent + pad swap + success check + desktop width cap).
4. Relight `client.tsx` (verify/sign/status wrappers, verification card, footer, logo), pass `light` to `AgreementForm`/`VerificationForm`, `StatusPage` via `LIGHT_TERMINAL_ICON`, wire the Expired CTA → `POST /api/external-signing/reissue` (already built), relight `page.tsx` not-found.
5. **visual-qa** all states (verify / read / sign / success / 3 terminals / not-found), mobile + desktop, worst-case lengths → `docs/qa/external-signing/after/`.
6. **Regression**: onboarding `/agreement` (no `light`) must stay dark + pixel-identical (no consent line, no download button, auto-handwriting signature).

## Out of scope for Phase 3 (deferred to their phases)
- Cert PDF + audit page + `/download` route + success download button → **Phase 4** (depends on P1.1 + P3). The `signature_image` payload field is *plumbed* in P3 but *consumed* in P4.
- `RecipientShell` / `TerminalStatus` extraction → **Phase 5** (zero-visual refactor).

## Guardrails
`git diff` must touch **no** invoice / doc-share / `/shared` files. Screenshots stay
inside the tree (`docs/qa/external-signing/`), never `/Volumes/CODEUSER/` root. Dev
server runs from main only. `/interface-craft` after-critique runs in Phase 6.
