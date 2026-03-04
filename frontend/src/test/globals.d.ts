// Ambient declaration for the Node.js / Vitest `global` identifier.
//
// Vitest runs tests in a jsdom environment that exposes `global` at runtime
// (as an alias for `globalThis`), but the TypeScript "DOM" lib does not
// declare it.  Adding "@types/node" to the whole project would pollute
// non-test code with Node-specific types.  This file sits inside the `src`
// include path and has no imports/exports, so it acts as a true global
// ambient module, making `global` visible in every file the TS compiler sees.
//
// eslint-disable-next-line no-var
declare var global: typeof globalThis;
