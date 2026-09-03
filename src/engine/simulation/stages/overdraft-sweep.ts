/**
 * M4 — NO BALANCE STANDS NEGATIVE AT THE CLOSE. A payer whose settled balance is below
 * zero has spent its bank's money; that is credit ALREADY extended, and the only choice left is
 * to name and price it (the 02b overdraft conversion's rule,, applied at the close to
 * every holder kind). A firm's overdraft becomes a revolver draw at its house bank; a fund's
 * becomes a prime-brokerage draw at its broker, past the struck line at a penalty; a pool's
 * becomes an SME facility draw at the region's banks. Every one is a loan that creates a
 * deposit — BANK_CREDIT → the holder, the asset on the bank in the same statement — so the
 * balance is zero at settlement and the money that was spent has a lender.
 */
import { WeeklyStepContext } from './context';
import { RegionId } from '../../../types';
import { pay, PartyRef, pendingSettlementUSD } from './settlement';
import { issueTranche } from '../../ledger/tranche-ledger';
import { smePoolId, facilityMarginBpsFor } from './bank-lending';
import { PrimeBrokerageLine } from '../../../domain/prime-brokerage';
import { WHOLESALE_FUNDING_SPREAD_BPS } from '../../../domain/banking';
import { cashOf, poolCashOf } from '../../ledger/accounts';
import { entityCashOf } from '../../ledger/accounts';

/** What a broker charges over its standing line for a balance it did not agree to fund. */
export const OVERDRAFT_PENALTY_BPS = 200;

export function runOverdraftSweep(ctx: WeeklyStepContext): void {
  const v2 = ctx.v2;
  // The balance the close will leave: the settled balance plus the net of every instruction
  // recorded since the last pass. That is the running net, and it is now the ONE representation
  // of it — this used to re-derive the whole thing by walking the journal, because the paying
  // agent journalled its payments without touching the net and a quarterly dividend or coupon
  // paid that way left the biggest names negative after the first sweep.
  const pendingUSD = (ref: PartyRef): number => pendingSettlementUSD(ctx, ref);

  // ---- 1. Firms: a revolver draw at the house bank (the 02b conversion, at the close). ----
  ctx.updatedCompanies.forEach((c) => {
    if (c.isDefaulted || c.isBankEntity || c.mergerAcquired || !c.homeBankTicker) return;
    const balanceUSD = cashOf(ctx.v2, c) + pendingUSD({ kind: 'COMPANY', ticker: c.ticker });
    if (!(balanceUSD < -1)) return;
    const drawUSD = -balanceUSD;
    const reg = ctx.updatedRegions[c.region];
    const marginBps = reg ? facilityMarginBpsFor(v2, c, reg, ctx.updatedCompanies.find((b) => b.ticker === c.homeBankTicker)) : 350;
    const tranche = {
      id: `${c.id}-REVOLVER-OD-${ctx.nextWeek}-C`,
      principalUSD: drawUSD,
      rateType: 'FLOATING' as const,
      floatingMarginBps: marginBps,
      originationWeek: ctx.nextWeek,
      maturityWeek: ctx.nextWeek + 52,
      seniority: 'SENIOR' as const,
      isBankFacility: true,
      facilityBankTicker: c.homeBankTicker,
    };
    issueTranche(v2, { id: c.id, ticker: c.ticker, region: c.region }, tranche, 'overdraft converted to a facility draw');
    pay(ctx, {
      payer: { kind: 'BANK_CREDIT', ticker: c.homeBankTicker },
      payee: { kind: 'COMPANY', ticker: c.ticker },
      amountUSD: drawUSD,
      reason: 'overdraft converted to facility draw at the close',
    });
  });

  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;

    // ---- 2. Funds of every kind: a prime-brokerage draw at the home bank. Past the line the
    // morning struck it is still funded — the money is already spent — at a penalty the next
    // morning's re-strike replaces with proper terms. ----
    const book: PrimeBrokerageLine[] = reg.primeBrokerageBook ?? [];
    const drawnByBroker = new Map<string, number>();
    ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((fund) => {
      if (fund.region !== regionId || fund.isDefaulted || !fund.homeBankTicker) return fund;
      const brokerTicker = fund.homeBankTicker;
      const balanceUSD = entityCashOf(ctx.v2, fund) + pendingUSD({ kind: 'INSTITUTION', id: fund.id });
      if (balanceUSD >= -1) return fund;
      const drawUSD = -balanceUSD;
      const withinLineUSD = Math.min(fund.primeBrokerageAvailableUSD ?? 0, drawUSD);
      pay(ctx, {
        payer: { kind: 'BANK_SECURITIES', ticker: brokerTicker },
        payee: { kind: 'INSTITUTION', id: fund.id },
        amountUSD: drawUSD,
        reason: withinLineUSD >= drawUSD ? 'prime brokerage drawdown' : 'prime brokerage drawdown past the line',
      });
      const penalty = withinLineUSD >= drawUSD ? 0 : OVERDRAFT_PENALTY_BPS;
      const line = book.find((l) => l.fundId === fund.id);
      if (line) {
        line.drawnUSD = Math.round(line.drawnUSD + drawUSD);
        if (penalty) line.rateAnnual = Number(Math.max(line.rateAnnual, reg.policyRate + (WHOLESALE_FUNDING_SPREAD_BPS + penalty) / 10000).toFixed(6));
      } else {
        book.push({
          id: `${regionId}-PB-${fund.id}`,
          regionId,
          brokerTicker,
          fundId: fund.id,
          drawnUSD: Math.round(drawUSD),
          haircutRate: 0.5,
          rateAnnual: Number((reg.policyRate + (WHOLESALE_FUNDING_SPREAD_BPS + penalty) / 10000).toFixed(6)),
          struckWeek: ctx.nextWeek,
        });
      }
      drawnByBroker.set(brokerTicker, (drawnByBroker.get(brokerTicker) ?? 0) + drawUSD);
      return { ...fund, primeBrokerageAvailableUSD: Math.max(0, (fund.primeBrokerageAvailableUSD ?? 0) - withinLineUSD) };
    });
    reg.primeBrokerageBook = book;

    // ---- 3. Pools: an SME facility draw at the region's banks, by their share of the pool's
    // deposits (the split settlement itself uses for a SEGMENT balance). ----
    const banks = ctx.updatedCompanies.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet && !c.isDefaulted);
    const totalShare = banks.reduce((a, b) => a + (b.bankMarketShare ?? 0), 0);
    const smeDrawByBank = new Map<string, { industry: string; poolId: string; usd: number }[]>();
    (reg.smePools ?? []).forEach((seg) => {
      const balanceUSD = poolCashOf(ctx.v2, regionId, seg.industry) + pendingUSD({ kind: 'SEGMENT', region: regionId, industry: seg.industry });
      if (balanceUSD >= -1 || !(totalShare > 0)) return;
      const drawUSD = -balanceUSD;
      banks.forEach((b) => {
        const shareUSD = drawUSD * ((b.bankMarketShare ?? 0) / totalShare);
        if (shareUSD <= 1) return;
        const rows = smeDrawByBank.get(b.ticker) ?? [];
        rows.push({ industry: seg.industry, poolId: smePoolId(regionId, seg.industry), usd: shareUSD });
        smeDrawByBank.set(b.ticker, rows);
        pay(ctx, {
          payer: { kind: 'BANK_CREDIT', ticker: b.ticker },
          payee: { kind: 'SEGMENT', region: regionId, industry: seg.industry },
          amountUSD: shareUSD,
          reason: 'pool overdraft converted to SME facility draw',
        });
      });
    });

    // The brokers' and lenders' assets, on the live sheet (post-08 the only bank-sheet write
    // that survives, ).
    ctx.updatedCompanies = ctx.updatedCompanies.map((c) => {
      if (!c.bankBalanceSheet || c.region !== regionId) return c;
      const drawnUSD = drawnByBroker.get(c.ticker) ?? 0;
      const smeRows = smeDrawByBank.get(c.ticker);
      if (!drawnUSD && !smeRows) return c;
      const loans = [...(c.bankBalanceSheet.businessLoans ?? [])];
      (smeRows ?? []).forEach((r) => {
        const existing = loans.find((l) => l.borrowerKind === 'SME_POOL' && l.borrowerId === r.poolId);
        if (existing) existing.principalUSD = Math.round(existing.principalUSD + r.usd);
        else loans.push({
          id: `${c.ticker}-SME-${r.industry}`, borrowerId: r.poolId, borrowerKind: 'SME_POOL', principalUSD: Math.round(r.usd),
          marginBps: 350, originationWeek: ctx.nextWeek, termWeeks: 52 * 5, status: 'PERFORMING',
        });
      });
      const sheet = {
        ...c.bankBalanceSheet,
        primeBrokerageLoansUSD: Math.round((c.bankBalanceSheet.primeBrokerageLoansUSD ?? 0) + drawnUSD),
        businessLoans: loans,
      };
      return { ...c, bankBalanceSheet: sheet };
    });
  });
}
