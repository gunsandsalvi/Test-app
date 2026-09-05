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
import { primeBrokerageBookOf, publishPrimeBrokerageBook } from '../../ledger/contract-ledger';
import type { EntityId } from '../../../domain/ids';
import { buildEntityIndex } from '../../ledger/entity-index';
import { defect } from '../../../domain/defect';
import { bankCreditParty, bankSecuritiesParty, companyParty } from '../../../domain/party';
import { currencyOf } from '../../../domain/geography';
import { RegionId } from '../../../types';
import { pay, PartyRef, pendingSettlementLocal } from './settlement';
import { drawRevolver } from '../../ledger/tranche-ledger';
import { smePoolId, facilityMarginBpsFor } from './bank-lending';
import { PrimeBrokerageLine } from '../../../domain/prime-brokerage';
import { WHOLESALE_FUNDING_SPREAD_BPS } from '../../../domain/banking';
import { cashOf, poolCashOf } from '../../ledger/accounts';
import { entityCashOf } from '../../ledger/accounts';
import { banksOf } from '../../../domain/company';
import type { Ticker } from '../../../domain/ids';
import { partyKey } from '../../ledger/party';
import { rollOverdraftStreaks } from '../../../domain/banking';

/** What a broker charges over its standing line for a balance it did not agree to fund. */
export const OVERDRAFT_PENALTY_BPS = 200;

export function runOverdraftSweep(ctx: WeeklyStepContext): void {
  const v2 = ctx.v2;
  // The balance the close will leave: the settled balance plus the net of every instruction
  // recorded since the last pass. That is the running net, and it is now the ONE representation
  // of it — this used to re-derive the whole thing by walking the journal, because the paying
  // agent journalled its payments without touching the net and a quarterly dividend or coupon
  // paid that way left the biggest names negative after the first sweep.
  const pendingLocal = (ref: PartyRef): number => pendingSettlementLocal(ctx, ref);
  // §3.13-BOOK (c-then-3b): `homeBankId` names the house bank in the ENTITY space now, so the
  // house bank is a LOOKUP rather than `updatedCompanies.find(b => b.ticker === …)` — which was a
  // full scan of every company per overdrawn firm, and is where the O(firms x overdrafts) went.
  const { companyById } = buildEntityIndex(ctx.updatedCompanies, ctx.updatedInstitutionalEntities);
  // §3.15b-iii: who the close swept, and for how much — the week's non-performances, by party.
  const swept = new Map<string, number>();

  // ---- 1. Firms: a revolver draw at the house bank (the 02b conversion, at the close). ----
  ctx.updatedCompanies.forEach((c) => {
    if (c.isDefaulted || c.isBankEntity || c.mergerAcquired || !c.homeBankId) return;
    const balanceLocal = cashOf(ctx.v2, c) + pendingLocal(companyParty(c));
    if (!(balanceLocal < -1)) return;
    const drawLocal = -balanceLocal;
    const reg = ctx.updatedRegions[c.region] ?? defect(`firm ${c.id} is in ${c.region}, which is not a region`);
    const homeBank = companyById.get(c.homeBankId);
    if (!homeBank) return defect(`firm ${c.id} banks at ${c.homeBankId}, which is not an entity`);
    const marginBps = facilityMarginBpsFor(v2, c, reg, homeBank);
    // §3.16-i: a TAP of the firm's one revolver at its house bank — the sweep used to write a
    // fresh facility per firm per week, each at its own struck margin.
    drawRevolver(v2, { id: c.id, ticker: c.ticker, region: c.region }, homeBank.id, drawLocal, { marginBps, week: ctx.nextWeek }, 'overdraft converted to a facility draw');
    swept.set(partyKey(companyParty(c)), drawLocal);
    pay(ctx, {
      payer: bankCreditParty(homeBank),
      payee: companyParty(c),
      amount: drawLocal,
      currency: currencyOf(c.region),
      reason: 'overdraft converted to facility draw at the close',
    });
  });

  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    if (!reg) return;

    // ---- 2. Funds of every kind: a prime-brokerage draw at the home bank. Past the line the
    // morning struck it is still funded — the money is already spent — at a penalty the next
    // morning's re-strike replaces with proper terms. ----
    // §3.13-BOOK d4c-iv: the lines are the store's; the sweep moves a COPY and publishes it back.
    const book: PrimeBrokerageLine[] = primeBrokerageBookOf(ctx.v2, regionId).map((l) => ({ ...l }));
    const drawnByBroker = new Map<EntityId, number>();
    ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((fund) => {
      if (fund.region !== regionId || fund.isDefaulted || !fund.homeBankId) return fund;
      const broker = companyById.get(fund.homeBankId);
      if (!broker) return defect(`fund ${fund.id} banks at ${fund.homeBankId}, which is not an entity`);
      const brokerBankId = broker.id;
      const balanceLocal = entityCashOf(ctx.v2, fund) + pendingLocal({ kind: 'INSTITUTION', id: fund.id });
      if (balanceLocal >= -1) return fund;
      const drawLocal = -balanceLocal;
      swept.set(partyKey({ kind: 'INSTITUTION', id: fund.id }), drawLocal);
      const withinLineLocal = Math.min(fund.primeBrokerageAvailableLocal ?? 0, drawLocal);
      pay(ctx, {
        payer: bankSecuritiesParty(broker),
        payee: { kind: 'INSTITUTION', id: fund.id },
        amount: drawLocal,
        currency: currencyOf(fund.region),
        reason: withinLineLocal >= drawLocal ? 'prime brokerage drawdown' : 'prime brokerage drawdown past the line',
      });
      const penalty = withinLineLocal >= drawLocal ? 0 : OVERDRAFT_PENALTY_BPS;
      const line = book.find((l) => l.fundId === fund.id);
      if (line) {
        line.drawnLocal = Math.round(line.drawnLocal + drawLocal);
        if (penalty) line.rateAnnual = Number(Math.max(line.rateAnnual, reg.policyRate + (WHOLESALE_FUNDING_SPREAD_BPS + penalty) / 10000).toFixed(6));
      } else {
        book.push({
          id: `${regionId}-PB-${fund.id}`,
          regionId,
          brokerId: brokerBankId,
          fundId: fund.id,
          drawnLocal: Math.round(drawLocal),
          haircutRate: 0.5,
          rateAnnual: Number((reg.policyRate + (WHOLESALE_FUNDING_SPREAD_BPS + penalty) / 10000).toFixed(6)),
          struckWeek: ctx.nextWeek,
        });
      }
      drawnByBroker.set(brokerBankId, (drawnByBroker.get(brokerBankId) ?? 0) + drawLocal);
      return { ...fund, primeBrokerageAvailableLocal: Math.max(0, (fund.primeBrokerageAvailableLocal ?? 0) - withinLineLocal) };
    });
    publishPrimeBrokerageBook(ctx.v2, regionId, book); // §3.13-BOOK d4b: the contract ledger's door

    // ---- 3. Pools: an SME facility draw at the region's banks, by their share of the pool's
    // deposits (the split settlement itself uses for a SEGMENT balance). ----
    const banks = banksOf(ctx.updatedCompanies, regionId);
    const totalShare = banks.reduce((a, b) => a + (b.bankMarketShare ?? 0), 0);
    const smeDrawByBank = new Map<Ticker, { industry: string; poolId: string; usd: number }[]>();
    (reg.smePools ?? []).forEach((seg) => {
      const balanceLocal = poolCashOf(ctx.v2, regionId, seg.industry) + pendingLocal({ kind: 'SEGMENT', region: regionId, industry: seg.industry });
      if (balanceLocal >= -1 || !(totalShare > 0)) return;
      const drawLocal = -balanceLocal;
      swept.set(partyKey({ kind: 'SEGMENT', region: regionId, industry: seg.industry }), drawLocal);
      banks.forEach((b) => {
        const shareLocal = drawLocal * ((b.bankMarketShare ?? 0) / totalShare);
        if (shareLocal <= 1) return;
        const rows = smeDrawByBank.get(b.ticker) ?? [];
        rows.push({ industry: seg.industry, poolId: smePoolId(regionId, seg.industry), usd: shareLocal });
        smeDrawByBank.set(b.ticker, rows);
        pay(ctx, {
          payer: bankCreditParty(b),
          payee: { kind: 'SEGMENT', region: regionId, industry: seg.industry },
          amount: shareLocal,
          currency: currencyOf(regionId),
          reason: 'pool overdraft converted to SME facility draw',
        });
      });
    });

    // The brokers' and lenders' assets, on the live sheet (post-08 the only bank-sheet write
    // that survives, ).
    ctx.updatedCompanies = ctx.updatedCompanies.map((c) => {
      if (!c.bankBalanceSheet || c.region !== regionId) return c;
      const drawnLocal = drawnByBroker.get(c.id) ?? 0;
      const smeRows = smeDrawByBank.get(c.ticker);
      if (!drawnLocal && !smeRows) return c;
      const loans = [...(c.bankBalanceSheet.businessLoans ?? [])];
      (smeRows ?? []).forEach((r) => {
        const existing = loans.find((l) => l.borrowerKind === 'SME_POOL' && l.borrowerId === r.poolId);
        if (existing) existing.principalLocal = Math.round(existing.principalLocal + r.usd);
        else loans.push({
          id: `${c.ticker}-SME-${r.industry}`, borrowerId: r.poolId, borrowerKind: 'SME_POOL', principalLocal: Math.round(r.usd),
          marginBps: 350, originationWeek: ctx.nextWeek, termWeeks: 52 * 5, status: 'PERFORMING',
        });
      });
      const sheet = {
        ...c.bankBalanceSheet,
        primeBrokerageLoansLocal: Math.round((c.bankBalanceSheet.primeBrokerageLoansLocal ?? 0) + drawnLocal),
        businessLoans: loans,
      };
      return { ...c, bankBalanceSheet: sheet };
    });
  });

  // §3.15b-iii: the runs, rolled once — a party swept again extends its run, a clean close ends it.
  ctx.overdraftStreaks = rollOverdraftStreaks(ctx.overdraftStreaks, swept, ctx.nextWeek);
}
