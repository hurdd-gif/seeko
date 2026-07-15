# `maintenance.html` — the Render maintenance page

The static page Render serves for **all** incoming requests while the SEEKO Studio
app and API are offline for a deploy. It is the visual sibling of `/404` and `/500`
(same sunset ink, same halftone veil, same voice), rebuilt as a single standalone
file because during maintenance there is no app, no build step, and no API to lean on.

---

## The one hard rule: keep it self-contained

Render's Maintenance Mode serves this file **while the service it belongs to is down.**
That means the page cannot fetch anything from that service — no React, no Tailwind
build, no API call, no CDN font, no `/assets/...` request. Everything is inlined:

- **Font** — Inter (weight 400–600) is base64-embedded in an `@font-face` `data:` URI.
- **Marks & favicon** — inline SVG, no external files.
- **Color tokens** — resolved hex values (light + `prefers-color-scheme: dark`),
  identical to the values in `/404`, `/500`, and `globals.css`. **Do not** convert
  them to `oklch()` here — it would desync the siblings and risk rounding drift.
- **Halftone veil** — a vanilla-JS `<canvas>` port of `HalftoneVeil`, no bundler.

The only external reference in the file is the SVG XML namespace string, which is not
a network request. If you edit this file, re-verify there are no `fetch`, `import`,
`src="/..."`, or `url(/...)` references before shipping.

---

## Deploying on Render

Render's *Custom Maintenance Page* field wants a public URL, and that URL must stay up
**while the main service is down** — so it cannot be served by the service being
maintained (Render's docs: the source "must _not_ be a URL of the service in maintenance
mode"). The page therefore lives on its own always-on service. Because we deploy the app
via a Blueprint, that service is declared in `render.yaml`.

1. **The `seeko-maintenance` static site is already in `render.yaml`.** It's a separate
   `runtime: static` service that publishes `./public` (no build), so it stays alive when
   `seeko-studio` is down. Push the repo and **apply the Blueprint** in the Render
   dashboard — Render detects the new service and creates it. It gets a URL like
   `https://seeko-maintenance.onrender.com`, serving the page at `/maintenance.html`.
2. **Point the app at it.** `seeko-studio` service → **Settings → Maintenance Mode** →
   paste `https://seeko-maintenance.onrender.com/maintenance.html` into **Custom
   Maintenance Page URL**. This one field is a dashboard setting, not a Blueprint field.
3. **Verify the source returns 200 first.** Render's docs: *"If your custom URL returns an
   error, Render responds with that error (not the default maintenance page)."* Load the
   `…/maintenance.html` URL in a fresh tab and confirm the gradient hero renders and the
   veil animates **before** you ever flip the toggle.
4. **Toggle Maintenance Mode on** when you start a deploy; **off** when the service is
   healthy again.

**It's served under your own domain, not redirected.** When Maintenance Mode is on, Render
"responds to every incoming request with a `503 Service Unavailable` status code and your
specified maintenance page" — it *proxies* the content under `www.seekostudios.com`. The
`onrender.com` source URL never appears in anyone's address bar, so no custom subdomain is
needed for the source.

---

## Behavior worth knowing

- **Auto-refresh every 30s** (`location.reload()`). Once you toggle Maintenance Mode off,
  users are carried back into the app on the next reload — no action needed from them.
- **Entrance runs once per tab.** The staggered fade-up is gated behind
  `sessionStorage['seeko-maint-entrance']`, so the 30s refresh does **not** replay it —
  the page never flickers while someone waits.
- **Accessibility fallbacks are built in.** `prefers-reduced-motion` renders it instantly
  with no drift; `forced-colors` / `prefers-contrast: more` swaps the gradient mark for
  solid ink, hides the veil, and gives the button a border.

---

## Editing

The hero line, subline copy, and the sunset palette are the only things you'd normally
touch. The hero is a single wide line sized by `min(104px, (100vw − 64px) / 11)` with
`white-space: nowrap` — if you change the wording, re-check that the new phrase still fits
one line from 360px to 1440px (the `/11` divisor buys ~4% headroom for the current copy).
`background-clip: text` clips descenders, so the hero keeps `line-height: 1.1` +
`padding-bottom: 0.16em` to protect the `g`/`y` bowls — don't drop those.
