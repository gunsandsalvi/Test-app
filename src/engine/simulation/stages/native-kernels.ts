/**
 * §5-SCALE, the native-cores campaign (§7.308) — the loader and the only gate.
 *
 * Loads `native/build/kernels.node` (built per-machine by `npm run build:native`; the artifact
 * is never committed) and registers each verified C core at its injection point. Everything
 * here is defensive by design: Node-only, absent-addon-silent, and `NATIVE_KERNELS=0` is the
 * kill-switch — in every one of those cases the canonical JS path runs and the world is the
 * same world, because a core may only register after passing the §5-SCALE oracle gate
 * (bit-equal outputs on captured real inputs, then a STATE_DUMP differ at 4 and 13 weeks).
 *
 * Marshaling is positional (arrays of typed arrays in an order fixed here and mirrored in
 * kernels.c) — a name lookup per array per call would be pure overhead on a hot path.
 */
import { createRequire } from 'node:module';
import {
  PackedClearing, KernelShardResult, registerNativeKernel,
} from './financial-clearing-engine';

interface NativeAddon {
  clearingKernel(
    inArrs: (Float64Array | Uint8Array)[],
    scalars: Float64Array,
    outArrs: (Float64Array | Uint8Array | Int32Array)[],
  ): number;
}

function loadAddon(): NativeAddon | null {
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  if (process.env.NATIVE_KERNELS === '0') return null;
  try {
    const req = createRequire(import.meta.url);
    // src/engine/simulation/stages -> repo root
    return req(new URL('../../../../native/build/kernels.node', import.meta.url).pathname) as NativeAddon;
  } catch {
    return null; // addon not built (or not loadable here): the JS path is canonical anyway
  }
}

const addon = loadAddon();

if (addon) {
  const scalars = new Float64Array(5);
  registerNativeKernel((packed: PackedClearing, from: number, to: number): KernelShardResult => {
    const span = to - from;
    const out: KernelShardResult = {
      from, to,
      clearedStat: new Float64Array(span),
      damper: new Uint8Array(span),
      dealerInventory: new Float64Array(span),
      primaryWithdrawn: new Uint8Array(span),
      primaryMarketTake: new Float64Array(span),
      hasPrimary: new Uint8Array(span),
      fillInst: new Int32Array(span * packed.pCount),
      fillPart: new Int32Array(span * packed.pCount),
      fillFilled: new Float64Array(span * packed.pCount),
      fillTraded: new Float64Array(span * packed.pCount),
      fillFee: new Float64Array(span * packed.pCount),
      fillCount: 0,
    };
    scalars[0] = packed.n; scalars[1] = packed.pCount;
    scalars[2] = packed.dealerSpreadBps; scalars[3] = packed.maxWeeklyStatMovePct;
    scalars[4] = packed.unsoldStaysWithHolder ? 1 : 0;
    out.fillCount = addon.clearingKernel(
      [packed.float, packed.offering, packed.withdrawStat, packed.currentStat,
        packed.yieldLike, packed.skip, packed.present,
        packed.dRes, packed.dRange, packed.dMaxH, packed.dMaxNet, packed.dMinH, packed.prevHolding],
      scalars,
      [out.clearedStat, out.damper, out.dealerInventory, out.primaryWithdrawn,
        out.primaryMarketTake, out.hasPrimary, out.fillInst, out.fillPart,
        out.fillFilled, out.fillTraded, out.fillFee],
    );
    return out;
  });
}

/** Whether the native addon is active this process (a diagnostic, read by nothing hot). */
export const nativeKernelsActive = addon !== null;
