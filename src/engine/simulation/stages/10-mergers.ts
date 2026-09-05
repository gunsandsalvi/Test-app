/**
 * Stage 10: M&A Consolidation
 *
 * Checks for a quarterly merger event and, if one fires, executes the acquisition:
 * cash/stock consideration, product-line and debt-tranche transfer, and target
 * wind-down. (IPOs are handled separately in stage 13, at their original point in
 * the sequence — see that file's header comment for why.)
 */

import { movePlant, movePlantQueue, plantVintagesOf } from '../../ledger/plant-ledger';
import { writePlantRows } from '../../ledger/plant-ledger';
import { slicePlant, mergePlant } from '../../../domain/plant';
import { restateBankSheetStatistics } from '../../../domain/bank-resolution';
import { marketCapAt } from '../../../engine2/instruments';
import { registerCompanyEquity, setIssuedUnits } from '../../ledger/instrument-ledger';
import { issuedSharesOf } from '../../../engine2/instruments';
import { companyParty } from '../../../domain/party';
import { admitParty } from '../../ledger/wire';
import { currencyOf } from '../../../domain/geography';
import { mergeBankSheets } from '../../ledger/bank-transfer';
import { rekeyBankLinks } from './bank-resolution';
import { reassignConsignments } from './goods-arrival';
import { bookHeadOf, instrumentIdAt, rowUnits } from '../../../engine2/holdings';
import { ensureV2, revHistSeed, rowOf, ringCopyRow, internType, typeOf, internInstrument, instrumentRefOf } from '../../../engine2/world';
import { materializeLadder, facilityBookOf, issuerIdOf } from '../../../engine2/tranches';
import { rebuildLadder } from '../../ledger/tranche-ledger';
import { pay } from './settlement';
import { GameState, DebtTranche, RegionId, ItemizedHolding } from '../../../types';
import { dateOfWeek } from '../../../domain/calendar';
import { isAntitrustBlocked, isActiveCompany, isPubliclyListed } from '../../../domain/company';
import { checkForMerger } from '../merger';
import { bumpRegister } from './register-index';
import { WeeklyStepContext } from './context';
import { issueHolding, transferHolding } from '../../ledger/holdings-ledger';
import { heldInShares } from '../../../domain/assets';
import { cashOf, moveSectorRowsToBank, moveBankReserves, bankReservesOf, bankDepositLines } from '../../ledger/accounts';
import { moveOutputUnits, moveInputUnits } from '../../ledger/goods-ledger';
import { materializeInputInventory, inputUnitsHeld } from '../../../engine2/lots';
import { novateContracts } from '../../../engine2/contracts';
import { novateDerivatives } from '../../ledger/contract-ledger';
import { DerivativeParty } from '../../../domain/derivatives/contract';
import { assumedDebtTrancheId, acquiredTrancheId, equityInstrumentId } from '../../../domain/instrument-keys';
import type { InstrumentId } from '../../../domain/ids';
import { spinOffEntityId } from '../../../domain/entity-keys';
import { asTicker } from '../../../domain/ids';

/**
 * Consolidates a set of debt tranches into at most one tranche per (rateType, ~5-year tenor
 * bucket) combination, weighting coupon/margin/maturity by principal. Tranches referenced by
 * an open portfolio position are excluded by the caller and passed through untouched instead —
 * rewriting their id here would orphan the position's trancheId. Without this, every merger
 * appends the target's entire ladder onto the acquirer's with no consolidation, so tranche
 * count compounds indefinitely across repeated M&A (observed: a single merger turning two
 * ordinary 3-tranche companies into one 6-tranche one).
 */
function consolidateTranches(tranches: DebtTranche[], nextWeek: number, idPrefix: string, newIdByOldId?: Map<InstrumentId, InstrumentId>): DebtTranche[] {
  // GUARD: the bucket key is everything that makes a tranche a DIFFERENT INSTRUMENT, not just
  // its rate type and tenor. Keying on those two alone consolidated a bank facility and a
  // syndicated loan into one tranche and dropped both flags along with the call protection —
  // so the combined paper appeared in 07d's float (the G2 double-count), and its call regime
  // was gone, which the call-protection guard caught on the first merger of a 60-week run.
  const buckets = new Map<string, DebtTranche[]>();
  tranches.forEach(t => {
    const tenorBucket = Math.round((t.maturityWeek - nextWeek) / 260); // nearest 5-year bucket
    const key = [t.rateType, tenorBucket, t.callProtection ?? 'none', t.seniority,
      t.isBankFacility ? `F:${t.facilityBankId ?? ''}` : '', t.isCommercialPaper ? 'CP' : ''].join('-');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(t);
  });

  const result: DebtTranche[] = [];
  let bucketIndex = 0;
  buckets.forEach(group => {
    if (group.length === 1) { result.push(group[0]); newIdByOldId?.set(group[0].id, group[0].id); return; }
    const totalPrincipal = group.reduce((s, t) => s + t.principalLocal, 0);
    if (totalPrincipal <= 0) return;
    // Every member's holders re-key to the bucket's one id (the exchange reads this map).
    group.forEach((t) => newIdByOldId?.set(t.id, assumedDebtTrancheId(idPrefix, nextWeek, bucketIndex)));
    const weightedCoupon = group.reduce((s, t) => s + (t.couponRate ?? 0) * t.principalLocal, 0) / totalPrincipal;
    const weightedMarginBps = group.reduce((s, t) => s + (t.floatingMarginBps ?? 0) * t.principalLocal, 0) / totalPrincipal;
    const weightedMaturityWeek = Math.round(group.reduce((s, t) => s + t.maturityWeek * t.principalLocal, 0) / totalPrincipal);
    result.push({
      id: assumedDebtTrancheId(idPrefix, nextWeek, bucketIndex++),
      principalLocal: totalPrincipal,
      rateType: group[0].rateType,
      couponRate: group[0].rateType === 'FIXED' ? weightedCoupon : undefined,
      floatingMarginBps: group[0].rateType === 'FLOATING' ? Math.round(weightedMarginBps) : undefined,
      originationWeek: nextWeek,
      maturityWeek: weightedMaturityWeek,
      seniority: group[0].seniority,
      // Identical across the group by construction (they are in the key).
      callProtection: group[0].callProtection,
      isBankFacility: group[0].isBankFacility,
      facilityBankId: group[0].facilityBankId,
      isCommercialPaper: group[0].isCommercialPaper,
    });
  });
  return result;
}

/**
 * IND7's SECOND HALF: THE DIVESTITURE, with the register mint it was waiting on.
 *
 * The hold was measured: a firm dominant in a category for a sustained year may not
 * acquire. What follows a sustained hold in reality is a REMEDY — the authority makes the firm
 * divest the dominant line — and that was recorded as unbuilt because a spin-off must MINT a
 * new issuer's holder register, and `settleCorporateActionOnHolders` only scales an existing
 * float; minting carelessly undoes OWN7 (a share with no holder, or a holder with no share).
 *
 * The mint that respects OWN7 is the real one: a spin-off distributes the new company's shares
 * PRO RATA to the parent's holders of record. Every institutional holder of parent equity gets
 * spin-co rows in proportion to its stake; the household residual gets its slice by the same
 * subtraction that defines it (OWN4) — no claim exists without a holder, and no value is minted
 * because the parent's own price steps down by exactly the carve-out.
 *
 * Conservation, leg by leg: revenue/staff/plant split by the line's revenue share (a split, not
 * a copy); the opening cash is CARVED from the parent through settlement like a firm birth's;
 * debt stays with the parent (the common real structure, and the one that moves no holder);
 * equity value moves price-for-price (parent steps down by the carve-out, spin-co opens at it,
 * and 07e reprices both from their own fundamentals next session).
 */
function runDivestitures(ctx: WeeklyStepContext): void {
  const blocked = ctx.updatedCompanies.filter((c) =>
    isActiveCompany(c) && !c.isBankEntity && !c.isInstitutionalEntity
    && isPubliclyListed(c) && isAntitrustBlocked(c)
    && (c.productLines?.length ?? 0) >= 2 && issuedSharesOf(ctx.v2, c.id) > 0 && c.stockPrice > 0);
  blocked.forEach((parent) => {
    const line = [...(parent.productLines ?? [])]
      .sort((a, b) => (b.categoryMarketShare) - (a.categoryMarketShare)).at(0);
    if (!line) return;
    const share = Math.max(0.05, Math.min(0.9, line.revenueShare));

    const tickers = new Set(ctx.updatedCompanies.map((c) => c.ticker));
    // §3.13-BOOK slice (c2c): a spin-off's ticker is minted here, from its parent's.
    let ticker = asTicker(`${parent.ticker}SP`);
    for (let n = 2; tickers.has(ticker); n++) ticker = asTicker(`${parent.ticker}SP${n}`);
    const spinMcapLocal = Math.max(1, marketCapAt(ctx.v2, parent) * share);
    // One spin-co share per parent share — the classic ratio, so a holder's fraction of the
    // parent IS its fraction of the spin-co and the mint below is one multiplication.
    const spinShares = issuedSharesOf(ctx.v2, parent.id);
    const spinPrice = spinMcapLocal / Math.max(1e-9, spinShares);
    const employees = Math.max(1, Math.round(parent.employeeCount * share));

    // structuredClone: a shallow spread would SHARE every nested array/object with the parent,
    // and the first later mutation of either book would corrupt the other.
    const spin: typeof parent = structuredClone(parent);
    spin.id = spinOffEntityId(parent.id, ctx.nextWeek);
    spin.ticker = ticker;
    spin.name = `${parent.name} (${line.subUnitId} spin-off)`;
    spin.productLines = [{ ...line, revenueShare: 1 }];
    spin.annualRevenue = Number((parent.annualRevenue * share).toFixed(1));
    spin.netIncome = Number((parent.netIncome * share).toFixed(1));
    spin.ebitda = Number((parent.ebitda * share).toFixed(1));
    spin.employeeCount = employees;
    spin.stockPrice = Number(spinPrice.toFixed(4));
    spin.debtTranches = [];
    // §3.26-f-ii — the plant moves as vintages: the line's share of every vintage goes with the
    // spin-off (the machines keep their age), and so does that share of the construction queue —
    // the structuredClone had given BOTH books the whole queue, capital minted twice.
    const split = slicePlant(plantVintagesOf(ctx.v2, parent.id), share);
    writePlantRows(ctx.v2, spin.id, spin.region, split.taken); // §3.13-BOOK g-ii: the rows are both registers
    writePlantRows(ctx.v2, parent.id, parent.region, split.kept);
    const queue = parent.assetsUnderConstruction ?? [];
    spin.assetsUnderConstruction = queue.map((lot) => ({ ...lot, valueLocal: lot.valueLocal * share }));
    parent.assetsUnderConstruction = queue.map((lot) => ({ ...lot, valueLocal: lot.valueLocal * (1 - share) }));
    if (spin.baselineNetPpeLocal !== undefined) spin.baselineNetPpeLocal = spin.baselineNetPpeLocal * share;
    spin.antitrustWeeksAboveThreshold = 0;
    revHistSeed(ctx.v2!, rowOf(ctx.v2!, spin.id), spin.annualRevenue);
    // II.5 — structuredClone(parent) used to carry the histories; the rings copy rows.
    {
      const v2r = ctx.v2!;
      const pf = rowOf(v2r, parent.id), sf = rowOf(v2r, spin.id);
      v2r.priceRing = ringCopyRow(v2r.priceRing, pf, sf);
      v2r.ratingRing = ringCopyRow(v2r.ratingRing, pf, sf);
    }

    // THE MINT: each holder of parent equity receives its pro-rata spin-co register rows,
    // BEFORE the parent's price steps down (the stake fraction reads the pre-split register).
    // holdings flip: row walk for the stake read (the push and sync below stay on objects).
    const Hs = ctx.v2.holdings;
    // §3.13-BOOK slice (b): the rows wanted are the ones holding the parent's EQUITY, and an
    // equity is keyed by its issuer's own id — so this is the same string it always was, now
    // saying which space it is read in. Built from the entity id, the compiler rejected it
    // against `instrRef`, which is exactly the crossing `instrument-keys.ts` exists to count.
    const parentRef = internInstrument(ctx.v2, equityInstrumentId(parent.id));
    const equityRefS = internType(ctx.v2, 'EQUITY');
    ctx.updatedInstitutionalEntities.forEach((e) => {
      if (e.isDefaulted) return;
      let heldShares = 0;
      for (let r = bookHeadOf(ctx.v2, e.id); r >= 0; r = Hs.next[r]) {
        if (Hs.instrRef[r] !== parentRef || Hs.typeRef[r] !== equityRefS) continue;
        const sh = Hs.shares[r];
        heldShares += Number.isNaN(sh) ? Hs.qtyLocal[r] / Math.max(0.01, parent.stockPrice) : sh;
      }
      if (!(heldShares > 0)) return;
      const fraction = Math.min(1, heldShares / issuedSharesOf(ctx.v2, parent.id));
      issueHolding(ctx.v2, companyParty(spin), { kind: 'INSTITUTION', id: e.id },
        { instrumentType: 'EQUITY', instrumentId: equityInstrumentId(spin.id), issuerRegion: spin.region, valueLocal: fraction * spinMcapLocal, shares: fraction * spinShares }, 'spin-off: shares distributed');
    });
    bumpRegister(ctx);

    // The parent keeps its shares; its price carries the value that left. The remaining lines
    // re-normalise so revenue shares still sum to one.
    parent.productLines = (parent.productLines ?? [])
      .filter((l) => l !== line)
      .map((l) => ({ ...l, revenueShare: Number((l.revenueShare / Math.max(1e-9, 1 - share)).toFixed(6)) }));
    parent.annualRevenue = Number((parent.annualRevenue * (1 - share)).toFixed(1));
    parent.netIncome = Number((parent.netIncome * (1 - share)).toFixed(1));
    parent.ebitda = Number((parent.ebitda * (1 - share)).toFixed(1));
    parent.employeeCount = Math.max(1, parent.employeeCount - employees);
    if (parent.baselineNetPpeLocal !== undefined) parent.baselineNetPpeLocal = parent.baselineNetPpeLocal * (1 - share);
    parent.stockPrice = Number((parent.stockPrice * (1 - share)).toFixed(4));
    parent.antitrustWeeksAboveThreshold = 0;

    // Opening cash is CARVED from the parent through settlement, like a firm birth's — the
    // economy's total cash never moves.
    const openingCashLocal = Math.max(0, cashOf(ctx.v2, parent)) * share;
    // §3.13-BOOK d2/dI: the spin-off is admitted to the wire world, and its equity declared on
    // the instrument index, before its first wire.
    admitParty(companyParty(spin));
    // §3.26-f-iii — the plant and the queue moved above; here, once the spin-off is a party, the
    // wires that say so (the consideration is the shares minted below, so the price is nothing).
    movePlant(companyParty(parent), companyParty(spin), plantVintagesOf(ctx.v2, spin.id), 0, 'spin-off: plant carved out with the line');
    movePlantQueue(companyParty(parent), companyParty(spin), spin.assetsUnderConstruction ?? [], 'spin-off: construction in progress carved out');
    registerCompanyEquity(ctx.v2, spin, spinShares);
    if (openingCashLocal > 0) {
      pay(ctx, {
        payer: companyParty(parent),
        payee: companyParty(spin),
        amount: openingCashLocal,
        currency: currencyOf(parent.region),
        reason: 'divestiture: opening balance carved from parent',
      });
    }

    ctx.updatedCompanies.push(spin);
  });
}

export function runMergersStage(state: GameState, ctx: WeeklyStepContext): void {
  if (ctx.nextWeek % 13 !== 0) return;

  // The authority's remedy runs on the same quarterly clock as its docket, whether or
  // not a merger also fires this quarter.
  runDivestitures(ctx);

  const merger = checkForMerger(ctx.v2, ctx.updatedCompanies, ctx.nextWeek,
    (Object.values(ctx.updatedRegions) as { supplyRelationships?: import('../../../domain/market-microstructure').SupplyRelationship[] }[])
      .flatMap((r) => r.supplyRelationships ?? []));
  if (!merger) return;

  const acquirer = ctx.updatedCompanies.find(c => c.ticker === merger.acquirerTicker);
  const target = ctx.updatedCompanies.find(c => c.ticker === merger.targetTicker);
  if (!acquirer || !target || !isActiveCompany(acquirer) || !isActiveCompany(target)) return;

  // A firm under an antitrust hold does not get to buy another one. The hold is a
  // MEASURED position: a dominant share in some category it sells into, held for a sustained
  // window, not a snapshot and not a label. This is the half of IND7 that exists; the
  // divestiture that should follow it is recorded there as unbuilt.
  if (isAntitrustBlocked(acquirer)) return;

  const purchasePrice = marketCapAt(ctx.v2, target) * 1.15;
  const cashPaid = purchasePrice * 0.5;
  const stockPaid = purchasePrice * 0.5;
  const targetMarketCapLocal = Math.max(1, marketCapAt(ctx.v2, target));

  // The consideration is PAYMENTS now. The old form debited the acquirer directly and
  // the money arrived on NO book — target shareholders' register rows were neither re-keyed nor
  // paid, and `Math.max(10, …)` silently recapitalised an over-payer. This stage runs after the
  // corporate-action drains, so the tender pays holders of record directly by instruction
  // (the timing trap is why it must not go through `payHoldersCash`'s pending map here).
  pay(ctx, {
    payer: companyParty(acquirer),
    payee: companyParty(target),
    amount: cashPaid,
    currency: currencyOf(target.region),
    reason: 'merger consideration (cash leg)',
  });
  // The target's own cash comes WITH the business (S5 leak #4) — as a payment, so the two home
  // banks see the deposit move.
  pay(ctx, {
    payer: companyParty(target),
    payee: companyParty(acquirer),
    amount: Math.max(0, cashOf(ctx.v2, target)),
    currency: currencyOf(target.region),
    reason: 'merger: acquired cash absorbed',
  });
  // The tender: the target pays its equity holders of record their cash half, pro rata to the
  // stake each holds; the residual float (the household sector's) receives the remainder.
  let institutionalTenderLocal = 0;
  // holdings flip: row walk for the tender stake read.
  const Ht = ctx.v2.holdings;
  // §3.13-BOOK slice (b): the target's EQUITY, keyed by the target's own id — see the note in
  // `applyStakeSaleProceeds` above.
  const targetRef = internInstrument(ctx.v2, equityInstrumentId(target.id));
  const equityRefT = internType(ctx.v2, 'EQUITY');
  ctx.updatedInstitutionalEntities.forEach((e) => {
    if (e.isDefaulted) return;
    let heldLocal = 0;
    for (let r = bookHeadOf(ctx.v2, e.id); r >= 0; r = Ht.next[r]) {
      if (Ht.instrRef[r] === targetRef && Ht.typeRef[r] === equityRefT) heldLocal += Ht.qtyLocal[r];
    }
    if (!(heldLocal > 0)) return;
    const tenderLocal = cashPaid * Math.min(1, heldLocal / targetMarketCapLocal);
    institutionalTenderLocal += tenderLocal;
    pay(ctx, {
      payer: companyParty(target),
      payee: { kind: 'INSTITUTION', id: e.id },
      amount: tenderLocal,
      currency: currencyOf(target.region),
      reason: 'merger tender: cash for target shares',
    });
  });
  pay(ctx, {
    payer: companyParty(target),
    payee: { kind: 'HOUSEHOLD', region: target.region },
    amount: Math.max(0, cashPaid - institutionalTenderLocal),
    currency: currencyOf(target.region),
    reason: 'merger tender: cash for target shares',
  });
  const newShares = stockPaid / Math.max(1, acquirer.stockPrice);
  // §3.13-BOOK dIV: the stock leg mints acquirer shares on the instrument index — the one count.
  setIssuedUnits(ctx.v2, equityInstrumentId(acquirer.id), Number((issuedSharesOf(ctx.v2, acquirer.id) + newShares).toFixed(3)));
  acquirer.annualRevenue = Number((acquirer.annualRevenue + target.annualRevenue * 0.85).toFixed(1));
  acquirer.employeeCount += Math.round(target.employeeCount * 0.75);
  // §3.26-f-ii — the target's plant joins the acquirer's register vintage by vintage (each keeps
  // its age and life), and so does its construction queue: a lot that has arrived and not yet
  // entered service is capital, and an acquired shell never commissions it.
  // §3.26-f-iii — and both moves are wires (the consideration is the tender above: shares and cash).
  const targetPlant = plantVintagesOf(ctx.v2, target.id); // §3.13-BOOK g-ii-d: the rows
  movePlant(companyParty(target), companyParty(acquirer), targetPlant, 0, 'merger: plant to the acquirer');
  movePlantQueue(companyParty(target), companyParty(acquirer), target.assetsUnderConstruction ?? [], 'merger: construction in progress to the acquirer');
  writePlantRows(ctx.v2, acquirer.id, acquirer.region, mergePlant(plantVintagesOf(ctx.v2, acquirer.id), targetPlant)); // §3.13-BOOK g-ii
  acquirer.assetsUnderConstruction = [...(acquirer.assetsUnderConstruction ?? []), ...(target.assetsUnderConstruction ?? [])];
  target.assetsUnderConstruction = [];

  // Merge product lines
  if (target.productLines && acquirer.productLines) {
    target.productLines.forEach(tpl => {
      const existingPl = acquirer.productLines?.find(apl => apl.subUnitId === tpl.subUnitId);
      if (existingPl) {
        existingPl.categoryMarketShare = Number((existingPl.categoryMarketShare + tpl.categoryMarketShare).toFixed(4));
      } else {
        acquirer.productLines?.push({ ...tpl });
      }
    });
  }
  target.productLines = [];

  // Transfer debt. Tranches held by an open portfolio position (either side) are transferred
  // individually with a renamed id and remapped position, exactly as before. Tranches with no
  // open position are pooled across both companies and consolidated by (rateType, tenor
  // bucket) so the combined entity's ladder doesn't grow without bound across repeated mergers.
  // writer flip — the ladders are sourced from the ROWS (the authority) and written
  // back to the rows; the object arrays are a week-end materialized view now.
  const v2m = ensureV2(state);
  const newIdByOldTrancheId = new Map<InstrumentId, InstrumentId>();
  const targetLadder = materializeLadder(v2m, target.id);
  const acquirerLadder = materializeLadder(v2m, acquirer.id);
  if (targetLadder.length > 0) {
    const heldTrancheIds = new Set(
      ctx.workingPositions
        .filter(p => (p.symbol === target.ticker || p.symbol === acquirer.ticker) && p.trancheId)
        .map(p => p.trancheId!)
    );

    const protectedTargetTranches = targetLadder.filter(t => heldTrancheIds.has(t.id));
    const mergeableTargetTranches = targetLadder.filter(t => !heldTrancheIds.has(t.id));
    const protectedAcquirerTranches = acquirerLadder.filter(t => heldTrancheIds.has(t.id));
    const mergeableAcquirerTranches = acquirerLadder.filter(t => !heldTrancheIds.has(t.id));

    protectedTargetTranches.forEach(t => {
      // N2: the tranche is the ACQUIRER'S now and its id says so (the position that
      // protected it is re-pointed below, so nothing is orphaned); the old id stays inside for
      // the lineage.
      const transferredTranche = { ...t, id: acquiredTrancheId(acquirer.ticker, ctx.nextWeek, t.id) };
      protectedAcquirerTranches.push(transferredTranche);
      ctx.workingPositions = ctx.workingPositions.map(p => {
        if (p.symbol === target.ticker && p.trancheId === t.id) {
          return { ...p, symbol: acquirer.ticker, trancheId: transferredTranche.id };
        }
        return p;
      });
    });

    // step 9 (N2): a target tranche that consolidates alone keeps its row but
    // is the acquirer's now — its id says so, the old id inside for the lineage.
    // The map from every tranche id the holders' rows name today to the id they will name —
    // a target tranche's renamed id, then the bucket it consolidates into (an acquirer tranche
    // that consolidates re-keys too).
    const renamedByOld = new Map(mergeableTargetTranches.map((t) => [t.id, acquiredTrancheId(acquirer.ticker, ctx.nextWeek, t.id)] as const));
    protectedTargetTranches.forEach((t) => { newIdByOldTrancheId.set(t.id, acquiredTrancheId(acquirer.ticker, ctx.nextWeek, t.id)); });
    const consolidatedTranches = consolidateTranches(
      [...mergeableAcquirerTranches, ...mergeableTargetTranches.map((t) => ({ ...t, id: renamedByOld.get(t.id)! }))],
      ctx.nextWeek,
      acquirer.ticker,
      newIdByOldTrancheId
    );
    renamedByOld.forEach((renamed, old) => { const final = newIdByOldTrancheId.get(renamed); if (final !== undefined) newIdByOldTrancheId.set(old, final); });

    const newLadder = [...protectedAcquirerTranches, ...consolidatedTranches];
    rebuildLadder(v2m, { id: acquirer.id, ticker: acquirer.ticker, region: acquirer.region }, newLadder, 'merger: ladders consolidated');
  }
  rebuildLadder(v2m, { id: target.id, ticker: target.ticker, region: target.region }, [], 'merger: target ladder assumed');

  // HH4d (a hole the deposit-unification invariant exposed): an acquired BANK brings its whole
  // balance sheet — deposits, wholesale funding, the itemized business and household books, the
  // sovereign tenor book, cash and equity. Before this, the target bank's sheet was simply
  // stranded on the absorbed shell: 54B of deposits vanished from every derived sum in one week
  // while the households still held the money, and the borrowers' loans lost their lender.
  // The line-by-line move is the resolution's `absorbBankSheet` (one transfer for the
  // two events that move a bank whole); a merger moves cash, wholesale and equity with it.
  if (target.bankBalanceSheet && acquirer.bankBalanceSheet) {
    const tb = target.bankBalanceSheet;
    const ab = acquirer.bankBalanceSheet;
    mergeBankSheets(ctx.v2, acquirer.id, target.id, ab, tb);
    moveSectorRowsToBank(ctx.v2, target.ticker, acquirer.ticker); // A3.3: the sector parties' rows at the target join the acquirer's
    moveBankReserves(ctx.v2, target.id, acquirer.id); // A3.6a: and its reserves join the acquirer's row
    acquirer.bankMarketShare = Number(((acquirer.bankMarketShare ?? 0) + (target.bankMarketShare ?? 0)).toFixed(4));
    target.bankBalanceSheet = undefined;

    // The target's STANDING CONTRACTS come with the bank. Before this, the repo, swap,
    // CDS and FX-forward books still named the absorbed ticker — the merged encumbrance scalar
    // above described pledges no live contract carried, and every counterparty's hedge pointed at
    // a dead desk. A contract survives a merger by NOVATION to the acquirer, so the books re-key.
    // One re-key for every link that names a bank — the customers' house-bank field, the
    // facility rows, the repo and prime-brokerage books, the offering pipeline, the derivatives.
    rekeyBankLinks(state, ctx, target.region as RegionId, target, acquirer);
    // Steps 10/11: the re-key moved the target's facility rows to the acquirer as lender and its
    // customers' house-bank links with them; the statistics are read once every link has moved.
    restateBankSheetStatistics(ab, bankReservesOf(ctx.v2, acquirer.id), bankDepositLines(ctx, acquirer), facilityBookOf(ctx.v2, acquirer.id));
  }

  // The target's PAPER moves with its debt. Holdings are keyed by the issuer's company
  // id, so a holder of the target's bonds or loans kept a row against a company that has just
  // left the books — while the same principal, now on the acquirer's ladder, was re-cleared to
  // the same institutions the following week. One tranche, two holders' rows, and the
  // conservation check saw the corporate books mint claims on the merger week (measured: 161B
  // held against 131B outstanding in USA leveraged loans).: the equity rows ARE re-keyed
  // now — each target shareholder was paid the cash half in the tender above and holds the stock
  // half as real acquirer shares below, instead of keeping a claim on a dead company.
  // The STOCK half of the consideration becomes real acquirer shares on the holders'
  // rows — the old code minted `newShares` onto `sharesOutstanding` with rows for NOBODY, while
  // target equity rows stayed keyed to a dead company. Each target share row converts to the
  // acquirer stock it was exchanged for (its stake's share of the stock leg).
  // The re-key is column writes on the matching rows: interned refs swap to the
  // acquirer's, and the equity rows revalue in place.
  const stockRatio = stockPaid / targetMarketCapLocal;
  {
    // W2: the exchange is two wires per holder — the target's paper back to the target
    // (retired), the acquirer's paper out to the holder (issued) — never a re-key in place.
    const H = ctx.v2.holdings;
    // §3.13-BOOK slice (b): the target's EQUITY again — this ref is compared against `instrRef`.
    const targetIdRef = instrumentRefOf(ctx.v2, equityInstrumentId(target.id));
    if (targetIdRef >= 0) {
      const equityRefR = internType(ctx.v2, 'EQUITY');
      const corpBondRef = internType(ctx.v2, 'CORP_BOND');
      const levLoanRef = internType(ctx.v2, 'LEVERAGED_LOAN');
      // The target's commercial paper is on the acquirer's ladder too — its holders'
      // rows exchange like the bonds' (it was the one company-keyed kind the exchange skipped).
      const cpRef = internType(ctx.v2, 'COMMERCIAL_PAPER');
      ctx.updatedInstitutionalEntities.forEach((e) => {
        const swaps: { type: ItemizedHolding['instrumentType']; valueLocal: number; units: number; shares: number | undefined; id: InstrumentId }[] = [];
        for (let r = bookHeadOf(ctx.v2, e.id); r >= 0; r = H.next[r]) {
          // A row names a tranche or its issuer; the target's paper is what resolves to it.
          const rowId = instrumentIdAt(ctx.v2, r);
          if (H.instrRef[r] !== targetIdRef && issuerIdOf(ctx.v2, rowId) !== target.id) continue;
          const t = H.typeRef[r];
          if (t !== equityRefR && t !== corpBondRef && t !== levLoanRef && t !== cpRef) continue;
          swaps.push({ type: typeOf(ctx.v2, t) as ItemizedHolding['instrumentType'], valueLocal: H.qtyLocal[r], units: rowUnits(H, r), shares: Number.isNaN(H.shares[r]) ? undefined : H.shares[r], id: rowId });
        }
        if (swaps.length === 0) return;
        const holder = { kind: 'INSTITUTION' as const, id: e.id };
        // W3: the exchange settles through the clearing houses — the target's paper goes
        // back to its house, the acquirer's comes from its own; the issuers' wires are the
        // ladders' (`rebuildLadder` below) and the equity issuer's, counted once.
        swaps.forEach((sw) => {
          const isEquity = heldInShares(sw.type);
          // A credit row re-keys to the tranche it becomes on the acquirer's ladder (the
          // consolidation's map); a row that still names the issuer re-keys to the acquirer.
          const newInstrumentId = isEquity ? equityInstrumentId(acquirer.id) : (newIdByOldTrancheId.get(sw.id) ?? equityInstrumentId(acquirer.id));
          const oldSpec = { instrumentType: sw.type, instrumentId: sw.id, issuerRegion: target.region, valueLocal: sw.valueLocal, units: sw.units, shares: sw.shares };
          transferHolding(ctx.v2, holder, { kind: 'CLEARING_HOUSE', region: target.region }, oldSpec, 'merger: target paper exchanged');
          // The equity issuers' sides — the target's shares are cancelled (house →
          // target), the acquirer's created (acquirer → house); the credit kinds' are the ladders'.
          if (isEquity) transferHolding(ctx.v2, { kind: 'CLEARING_HOUSE', region: target.region }, companyParty(target), oldSpec, 'merger: target shares cancelled');
          const newValueLocal = isEquity ? sw.valueLocal * stockRatio : sw.valueLocal;
          if (newValueLocal > 1) {
            const newShares = isEquity && acquirer.stockPrice > 0 ? newValueLocal / acquirer.stockPrice : sw.shares;
            // §9.13-CREDIT row 5 — the QUANTITY the holder receives. Equity converts at the share
            // ratio and its units ARE its shares; the credit kinds keep their face, because a
            // merger re-keys the paper onto the acquirer rather than repricing it.
            const newSpec = { instrumentType: sw.type, instrumentId: newInstrumentId, issuerRegion: acquirer.region, valueLocal: newValueLocal, units: newShares ?? sw.units, shares: newShares };
            if (isEquity) transferHolding(ctx.v2, companyParty(acquirer), { kind: 'CLEARING_HOUSE', region: acquirer.region }, newSpec, 'merger: acquirer shares issued');
            transferHolding(ctx.v2, { kind: 'CLEARING_HOUSE', region: acquirer.region }, holder, newSpec, 'merger: acquirer paper delivered');
          }
        });
        bumpRegister(ctx);
      });
      // The ACQUIRER's own tranches that consolidated into a bucket re-key their holders'
      // rows too — the same paper under the bucket's id, through the house (old out, new in).
      ctx.updatedInstitutionalEntities.forEach((e) => {
        const rekeys: { type: ItemizedHolding['instrumentType']; valueLocal: number; units: number; id: InstrumentId; newId: InstrumentId }[] = [];
        for (let r = bookHeadOf(ctx.v2, e.id); r >= 0; r = H.next[r]) {
          const rowId = instrumentIdAt(ctx.v2, r);
          const newId = newIdByOldTrancheId.get(rowId);
          if (newId === undefined || newId === rowId || H.instrRef[r] === targetIdRef) continue;
          if (issuerIdOf(ctx.v2, rowId) === target.id) continue; // exchanged above
          rekeys.push({ type: typeOf(ctx.v2, H.typeRef[r]) as ItemizedHolding['instrumentType'], valueLocal: H.qtyLocal[r], units: rowUnits(H, r), id: rowId, newId });
        }
        if (rekeys.length === 0) return;
        const holder = { kind: 'INSTITUTION' as const, id: e.id };
        rekeys.forEach((rk) => {
          transferHolding(ctx.v2, holder, { kind: 'CLEARING_HOUSE', region: acquirer.region }, { instrumentType: rk.type, instrumentId: rk.id, issuerRegion: acquirer.region, valueLocal: rk.valueLocal, units: rk.units }, 'merger: acquirer paper consolidated');
          transferHolding(ctx.v2, { kind: 'CLEARING_HOUSE', region: acquirer.region }, holder, { instrumentType: rk.type, instrumentId: rk.newId, issuerRegion: acquirer.region, valueLocal: rk.valueLocal, units: rk.units }, 'merger: acquirer paper consolidated');
        });
        bumpRegister(ctx);
      });
    }
  }

  // step 9 — NOTHING STAYS BEHIND ON THE TARGET. Its standing derivatives
  // novate to the acquirer (a bank's already did through `rekeyBankLinks`), the consignments
  // still on their way to it are the acquirer's to take delivery of, its finished stock and
  // input lots move onto the acquirer's books by wire, and its supply contracts name the
  // acquirer on either side. A merged firm is not dead — an acquired firm's rows cannot exist.
  if (!target.bankBalanceSheet) {
    const rekey = (p: DerivativeParty): DerivativeParty => (p.kind === 'COMPANY' && p.id === target.id ? companyParty(acquirer) : p);
    novateDerivatives(ctx, rekey); // §3.13-BOOK d4b: through the contract ledger's door
  }
  reassignConsignments(state, target, acquirer);
  Object.entries(target.outputInventoryBySubUnit).forEach(([subUnitId, row]) => {
    if (!row) return;
    moveOutputUnits(target, acquirer, subUnitId, row.unitsHeld, row.valueLocal, 'merger: finished stock assumed');
  });
  Object.keys(materializeInputInventory(ctx.v2, target.id)).forEach((subUnitId) => {
    moveInputUnits(ctx.v2, target, acquirer, subUnitId, inputUnitsHeld(ctx.v2, target.id, subUnitId), ctx.nextWeek, 'merger: input lots assumed');
  });
  novateContracts(ctx.v2, [target.ticker, target.id], acquirer.ticker);

  // Target is absorbed and exits active operations
  target.mergerAcquired = true;
  target.acquiredById = acquirer.id;
  target.isDefaulted = false;
  target.stockPrice = 0;
  target.employeeCount = 0;
  target.annualRevenue = 0;
  target.capex = 0;
  target.maintenanceCapex = 0;
  target.growthCapex = 0;
  writePlantRows(ctx.v2, target.id, target.region, []); // §3.13-BOOK g-ii: the target's plant is the acquirer's now

  ctx.recentMergers.push({
    acquirerTicker: acquirer.ticker,
    acquirerName: acquirer.name,
    targetTicker: target.ticker,
    targetName: target.name,
    week: ctx.nextWeek,
    dealValueLocal: purchasePrice
  });
  if (ctx.recentMergers.length > 20) ctx.recentMergers.shift();

  ctx.newsItems.push({
    id: `merger-${merger.acquirerTicker}-${merger.targetTicker}-${ctx.nextWeek}`,
    week: ctx.nextWeek,
    title: merger.title,
    description: merger.description,
    category: 'EARNINGS',
    impactBadge: '[M&A MERGER]',
    impactRegion: acquirer.region,
    impactSector: acquirer.sector,
    affectedTicker: acquirer.ticker,
    urgent: true,
  });

  ctx.diagnosticLogs.push({
    week: ctx.nextWeek,
    // Sim calendar, never wall clock — see 02-region-macro's twin comment.
    timestamp: dateOfWeek(ctx.nextWeek).toISOString(),
    category: 'MICRO',
    message: `Merger Executed: ${acquirer.name} acquired ${target.name}`,
    deltaText: '',
    data: { acquirer: acquirer.ticker, target: target.ticker }
  });
}
