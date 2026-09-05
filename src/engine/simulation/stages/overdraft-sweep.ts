/**
 * M4 — NO BALANCE STANDS NEGATIVE UNNAMED AT THE CLOSE. A payer whose settled balance is below
 * zero has spent its bank's money; that is credit ALREADY extended, and the close names and
 * prices it (the 02b overdraft conversion's rule, applied at the close to every holder kind).
 * A firm's overdraft becomes a revolver draw at its house bank; a fund's becomes a
 * prime-brokerage draw at its broker, past the struck line at a penalty; a pool's becomes an
 * SME facility draw at the region's banks. Every one is a loan that creates a deposit —
 * BANK_CREDIT → the holder, the asset on the bank in the same statement.
 *
 * §3.20-ii — THE LENDER HAS A CAPACITY, AND IT CAN SAY NO. A bank lends here to the balance
 * sheet its equity still supports under the leverage floor (`leverageHeadroomLocal`, the same
 * room every other book of the bank is bounded by), consumed in the order the sweep reaches
 * the draws; a draw past it is REFUSED. A refused draw is not silent: the party's balance stands
 * negative through the close, and the refusal is recorded on its run (`OverdraftStreak.refusedLocal`)
 * beside what was lent, where the news tells it. What a payer in that state IS — a default of
 * payment — is §3 step 20-LLR's, which owns the funding channel; this pass is the lender's side.
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
import { leverageHeadroomLocal } from '../../macro/banking';
import { bankReservesOf } from '../../ledger/accounts';
import { facilityBookOf } from '../../../engine2/tranches';
import { bankBookAssetsLocal } from '../../desk-register';

/** What a broker charges over its standing line for a balance it did not agree to fund. */
const OVERDRAFT_PENALTY_BPS = 200;

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
  // §3.20-ii: who the close REFUSED, and for how much — the balance that stands negative.
  const refused = new Map<string, number>();
  const note = (m: Map<string, number>, key: string, usd: number): void => { if (usd > 1) m.set(key, (m.get(key) ?? 0) + usd); };
  // §3.20-ii: each lender's room, read once off its own sheet and consumed as the sweep lends.
  const roomByBank = new Map<EntityId, number>();
  const lend = (bank: { id: EntityId; bankBalanceSheet?: import('../../../domain/banking').BankingSector }, wantLocal: number): number => {
    let room = roomByBank.get(bank.id);
    if (room === undefined) {
      room = bank.bankBalanceSheet
        ? leverageHeadroomLocal(bank.bankBalanceSheet, bankReservesOf(v2, bank.id), facilityBookOf(v2, bank.id), bankBookAssetsLocal(v2, bank.id))
        : 0;
    }
    const granted = Math.max(0, Math.min(wantLocal, room));
    roomByBank.set(bank.id, room - granted);
    return granted;
  };

  // ---- 1. Firms: a revolver draw at the house bank (the 02b conversion, at the close). ----
  ctx.updatedCompanies.forEach((c) => {
    if (c.isDefaulted || c.isBankEntity || c.mergerAcquired || !c.homeBankId) return;
    const balanceLocal = cashOf(ctx.v2, c) + pendingLocal(companyParty(c));
    if (!(balanceLocal < -1)) return;
    const drawLocal = -balanceLocal;
    const reg = ctx.updatedRegions[c.region];
    const homeBank = companyById.get(c.homeBankId);
    if (!homeBank) return defect(`firm ${c.id} banks at ${c.homeBankId}, which is not an entity`);
    const marginBps = facilityMarginBpsFor(v2, c, reg, homeBank);
    // §3.20-ii: the house bank lends to its room and refuses the rest.
    const grantedLocal = lend(homeBank, drawLocal);
    note(refused, partyKey(companyParty(c)), drawLocal - grantedLocal);
    if (grantedLocal <= 1) return;
    // §3.16-i: a TAP of the firm's one revolver at its house bank — the sweep used to write a
    // fresh facility per firm per week, each at its own struck margin.
    drawRevolver(v2, { id: c.id, ticker: c.ticker, region: c.region }, homeBank.id, grantedLocal, { marginBps, week: ctx.nextWeek }, 'overdraft converted to a facility draw');
    swept.set(partyKey(companyParty(c)), grantedLocal);
    pay(ctx, {
      payer: bankCreditParty(homeBank),
      payee: companyParty(c),
      amount: grantedLocal,
      currency: currencyOf(c.region),
      reason: 'overdraft converted to facility draw at the close',
    });
  });

  (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];

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
      const wantLocal = -balanceLocal;
      // §3.20-ii: the broker lends to its room and refuses the rest.
      const drawLocal = lend(broker, wantLocal);
      note(refused, partyKey({ kind: 'INSTITUTION', id: fund.id }), wantLocal - drawLocal);
      if (drawLocal <= 1) return fund;
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
        if (penalty) line.rateAnnual = Number(Math.max(line.rateAnnual, reg.policyRateAnnual + (WHOLESALE_FUNDING_SPREAD_BPS + penalty) / 10000).toFixed(6));
      } else {
        book.push({
          id: `${regionId}-PB-${fund.id}`,
          regionId,
          brokerId: brokerBankId,
          fundId: fund.id,
          drawnLocal: Math.round(drawLocal),
          haircutRate: 0.5,
          rateAnnual: Number((reg.policyRateAnnual + (WHOLESALE_FUNDING_SPREAD_BPS + penalty) / 10000).toFixed(6)),
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
    (reg.smePools).forEach((seg) => {
      const balanceLocal = poolCashOf(ctx.v2, regionId, seg.industry) + pendingLocal({ kind: 'SEGMENT', region: regionId, industry: seg.industry });
      if (balanceLocal >= -1 || !(totalShare > 0)) return;
      const drawLocal = -balanceLocal;
      const poolKey = partyKey({ kind: 'SEGMENT', region: regionId, industry: seg.industry });
      banks.forEach((b) => {
        const wantLocal = drawLocal * ((b.bankMarketShare ?? 0) / totalShare);
        // §3.20-ii: each bank lends its share to its own room and refuses the rest.
        const shareLocal = lend(b, wantLocal);
        note(refused, poolKey, wantLocal - shareLocal);
        if (shareLocal <= 1) return;
        note(swept, poolKey, shareLocal);
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
      const loans = [...(c.bankBalanceSheet.businessLoans)];
      (smeRows ?? []).forEach((r) => {
        const existing = loans.find((l) => l.borrowerId === r.poolId);
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
  ctx.overdraftStreaks = rollOverdraftStreaks(ctx.overdraftStreaks, swept, ctx.nextWeek, refused);
}
