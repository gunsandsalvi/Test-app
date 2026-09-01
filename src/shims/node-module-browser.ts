/**
 * Browser stand-in for `node:module`, wired in vite.config.ts. The only consumer is
 * native-kernels.ts, whose loader both guards on `process.versions.node` (so this is never
 * called in a browser) and wraps the call in try/catch (so throwing is safe anywhere else).
 * It exists because rollup needs the named export to exist at build time.
 */
export function createRequire(_specifier: string | URL): (id: string) => unknown {
  throw new Error('node:module is unavailable outside Node');
}
