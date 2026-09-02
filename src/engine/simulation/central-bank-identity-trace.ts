/**
 * §5-CLOSE — THE CENTRAL BANK'S IDENTITY, PER STAGE (CB_IDENTITY_TRACE=1). A read-only
 * instrument: after every stage, each region's `reserves + treasury account + currency + money in
 * transit − assets` is recomputed and any stage that moved it by more than the floor is named.
 * Settlement moves it by design (the payments' legs land there); anything else that moves it is a
 * writer the ledger does not know about. Mirrors bank-identity-trace.ts; mutates nothing.
 */
import { bankReservesOf, treasuryAccountOf, waysAndMeansOf } from '../ledger/accounts';
import { GameState, RegionId } from '../../types';
import { WeeklyStepContext } from './stages/context';
import { REGION_IDS } from '../../domain/geography';
import { centralBankAssetsUSD } from '../../domain/central-bank';

const FLOOR_USD = 1e7;

export function centralBankIdentityTraceEnabled(): boolean {
  return process.env.CB_IDENTITY_TRACE === '1';
}

export class CentralBankIdentityTrace {
  private last = new Map<RegionId, number>();
  private byStage = new Map<string, number>();

  private lastParts = new Map<RegionId, Record<string, number>>();

  private residuals(ctx: WeeklyStepContext): Map<RegionId, number> {
    const out = new Map<RegionId, number>();
    const parts = new Map<RegionId, Record<string, number>>();
    REGION_IDS.forEach((r) => {
      const reg = ctx.updatedRegions[r];
      const cb = reg?.centralBankSheet;
      if (!reg || !cb) return;
      let reserves = 0;
      ctx.updatedCompanies.forEach((c) => {
        if (!c.isBankEntity || c.region !== r || c.isDefaulted || c.mergerAcquired) return;
        const sheet = (!ctx.bankSheetChannelClosed && ctx.companyUpdates[c.ticker]?.bankBalanceSheet) || c.bankBalanceSheet;
        if (sheet) reserves += bankReservesOf(ctx.v2, c.ticker);
      });
      const tga = treasuryAccountOf(ctx.v2, r), assets = centralBankAssetsUSD(cb, waysAndMeansOf(ctx.v2, r));
      out.set(r, reserves + tga + cb.currencyInCirculationUSD - assets);
      parts.set(r, { reserves, tga, assets });
    });
    this.parts = parts;
    return out;
  }
  private parts = new Map<RegionId, Record<string, number>>();

  begin(_state: GameState, ctx: WeeklyStepContext): void { this.last = this.residuals(ctx); this.lastParts = this.parts; }

  afterStage(stage: string, _state: GameState, ctx: WeeklyStepContext): void {
    const now = this.residuals(ctx);
    const parts: string[] = [];
    now.forEach((v, r) => {
      const d = v - (this.last.get(r) ?? v);
      if (Math.abs(d) >= FLOOR_USD) {
        const p = this.parts.get(r) ?? {}; const q = this.lastParts.get(r) ?? {};
        const detail = Object.keys(p).map((k) => `${k} ${((p[k] - (q[k] ?? p[k])) / 1e6).toFixed(0)}`).join(' ');
        parts.push(`${r} ${d >= 0 ? '+' : ''}${(d / 1e6).toFixed(1)}M [${detail}]`);
        this.byStage.set(`${stage}:${r}`, (this.byStage.get(`${stage}:${r}`) ?? 0) + d);
      }
    });
    if (parts.length) console.log(`  [cb-id] w${ctx.nextWeek} ${stage} :: ${parts.join(' | ')}`);
    this.last = now; this.lastParts = this.parts;
  }

  report(week: number): void {
    const rows = [...this.byStage.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 12);
    if (rows.length) console.log(`  [cb-id] w${week} cumulative by stage: ${rows.map(([k, v]) => `${k} ${(v / 1e9).toFixed(2)}B`).join(' | ')}`);
  }
}
