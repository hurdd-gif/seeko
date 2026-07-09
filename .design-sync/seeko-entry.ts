// Bundle entry for the Claude Design sync (cfg.entry).
//
// Two jobs:
//  1. esbuild compiles this → _ds_bundle.js (IIFE → window.Seeko.*). Every
//     symbol re-exported here lands on the global, so designs can render the
//     full primitive families (Card + CardHeader + …), not just the roots.
//  2. Its location under .design-sync/ makes the converter walk up to the
//     repo's own package.json for PKG_DIR — the "DS's own source repo"
//     mechanism (package-build.mjs ENTRY_OVERRIDE branch). No node_modules
//     self-install / symlink needed.
//
// Scope = the presentational ui/* primitives only. Feature-coupled members of
// ui/ (tour.tsx context provider + hooks, editor/, __tests__) are intentionally
// omitted — they need app context and aren't design-system material.
// The curated *picker* list (the ~20 roots) is defined separately by the types
// barrel (../index.d.ts); this file is deliberately permissive.

export * from "../src/components/ui/AnimatedNumber";
export * from "../src/components/ui/avatar";
export * from "../src/components/ui/badge";
export * from "../src/components/ui/button";
export * from "../src/components/ui/card";
export * from "../src/components/ui/checkbox";
export * from "../src/components/ui/date-picker";
export * from "../src/components/ui/dialog";
export * from "../src/components/ui/dropdown-menu";
export * from "../src/components/ui/alert-dialog";
export * from "../src/components/ui/empty-state";
export * from "../src/components/ui/gradient-avatar";
export * from "../src/components/ui/input";
export * from "../src/components/ui/label";
export * from "../src/components/ui/mono-badge";
export * from "../src/components/ui/progress";
export * from "../src/components/ui/select";
export * from "../src/components/ui/separator";
export * from "../src/components/ui/switch";
export * from "../src/components/ui/textarea";
