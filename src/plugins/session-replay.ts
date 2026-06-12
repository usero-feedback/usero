// Back-compat alias. The session-replay implementation moved to
// src/replay.ts (published as `@usero/sdk/replay`) when replay gained a
// standalone, widget-free mode. This subpath export
// (`@usero/sdk/plugins/session-replay`) is kept so existing consumers keep
// working unchanged; both paths resolve to the same module (shared chunk in
// the ESM build), so plugin state, the page-wide recording slot, and types
// are identical whichever path you import.
export * from '../replay'
