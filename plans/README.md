# Animation plans

Plans produced by the `improve-animations` skill. Each is fully self-contained —
an executor needs zero conversation context. Feature/product plans live in
`docs/plans/`; this directory is motion work only.

| # | Plan | Severity | Status |
| --- | --- | --- | --- |
| 001 | [Sign-out exit choreography](001-signout-exit-choreography.md) | HIGH | DONE (2026-07-16) |

## Execution order

Only one plan so far — no dependencies.

Run a plan with `improve-animations execute plans/001-signout-exit-choreography.md`
(or hand the file to any agent). After edits to `src/api-server/**` are NOT part
of plan 001, so no api-server restart is needed; the client needs `npm run build`
before checking on port 8788.
