# boneyard skeleton bones

Layout-only skeleton data captured by `npm run bones` (boneyard-js CDP capture).
One `<name>.bones.json` per `<ContentSkeleton name="…">` target, keyed by name.
These are **editable source** — hand-tweak a bone, or re-capture when a layout changes.

## Capturing

1. `npm run dev` — server on :3000
2. Launch Chrome with remote debugging:
   `open -a "Google Chrome" --args --remote-debugging-port=9222`
3. Log into localhost:3000 in that Chrome window
4. `npm run bones` — connects over CDP (port 9222), snapshots the authenticated
   pages into this folder at the configured breakpoints (390 / 768 / 1440).

Config lives in `boneyard.config.json` at the repo root.

## Auth alternative

Instead of CDP you can set `auth.cookies` in `boneyard.config.json` (supply the
Supabase session cookie) — but CDP against your already-logged-in Chrome avoids
committing any credentials.
