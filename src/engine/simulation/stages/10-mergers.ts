/**
 * Stage 10: M&A Consolidation
 *
 * Checks for a quarterly merger event and, if one fires, executes the acquisition:
 * cash/stock consideration, product-line and debt-tranche transfer, and target
 * wind-down. (IPOs are handled separately in stage 13, at their original point in
 * the sequence — see that file's header comment for why.)
 */

import { restateBankSheetStatistics } from '../../../domain/bank-resolution';
import { mergeBankSheets } from '../../ledger/bank-transfer';
import { rekeyBankLinks } from './bank-resolution';
import { bookHeadOf } from '../../../engine2/holdings';
import { ensureV2, internString, revHistSeed, rowOf, ringCopyRow } from '../../../engine2/world';
import { materializeLadder, facilityBookOf } from '../../../engine2/tranches';
import { moveFacilityLender } from '../../ledger/tranche-ledger';
import { rebuildLadder } from '../../ledger/tranche-ledger';
import { pay } from './settlement';
import { GameState, DebtTranche, RegionId, ItemizedHolding } from '../../../types';
import { getSimulationDate } from '../../formatters';
import { isAntitrustBlocked, isActiveCompany, isPubliclyListed } from '../../../domain/company';
import { checkForMerger } from '../merger';
import { bumpRegister } from './register-index';
import { WeeklyStepContext } from './context';
import { issueHolding, transferHolding } from '../../ledger/holdings-ledger';
import { heldInShares } from '../../../domain/assets';
import { marketCapOf } from '../../../domain/company';
import { cashOf, moveSectorRowsToBank, moveBankReserves, bankReservesOf, bankDepositLines } from '../../ledger/accounts';
import { moveOutputUnits, moveInputUnits } from '../../ledger/goods-ledger';
import { materializeInputInventory, inputUnitsHeld } from '../../../engine2/lots';
import { novateContracts } from '../../../engine2/contracts';
import { derivativesBookOf } from './derivative-lifecycle';
import { DerivativeParty } from '../../../domain/derivatives/contract';

/**
 * Consolidates a set of debt tranches into at most one tranche per (rateType, ~5-year tenor
 * bucket) combination, weighting coupon/margin/maturity by principal. Tranches referenced by
 * an open portfolio position are excluded by the caller and passed through untouched instead —
 * rewriting their id here would orphan the position's trancheId. Without this, every merger
 * appends the target's entire ladder onto the acquirer's with no consolidation, so tranche
 * count compounds indefinitely across repeated M&A (observed: a single merger turning two
 * ordinary 3-tranche companies into one 6-tranche one).
 */
function consolidateTranches(tranches: DebtTranche[], nextWeek: number, idPrefix: string): DebtTranche[] {
  // GUARD: the bucket key is everything that makes a tranche a DIFFERENT INSTRUMENT, not just
  // its rate type and tenor. Keying on those two alone consolidated a bank facility and a
  // syndicated loan into one tranche and dropped both flags along with the call protection —
  // so the combined paper appeared in 07d's float (the G2 double-count), and its call regime
  // was gone, which the call-protection guard caught on the first merger of a 60-week run.
  const buckets = new Map<string, DebtTranche[]>();
  tranches.forEach(t => {
    const tenorBucket = Math.round((t.maturityWeek - nextWeek) / 260); // nearest 5-year bucket
    const key = [t.rateType, tenorBucket, t.callProtection ?? 'none', t.seniority,
      t.isBankFacility ? `F:${t.facilityBankTicker ?? ''}` : '', t.isCommercialPaper ? 'CP' : ''].join('-');
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(t);
  });

  const result: DebtTranche[] = [];
  let bucketIndex = 0;
  buckets.forEach(group => {
    if (group.length === 1) { result.push(group[0]); return; }
    const totalPrincipal = group.reduce((s, t) => s + t.principalUSD, 0);
    if (totalPrincipal <= 0) return;
    const weightedCoupon = group.reduce((s, t) => s + (t.couponRate ?? 0) * t.principalUSD, 0) / totalPrincipal;
    const weightedMarginBps = group.reduce((s, t) => s + (t.floatingMarginBps ?? 0) * t.principalUSD, 0) / totalPrincipal;
    const weightedMaturityWeek = Math.round(group.reduce((s, t) => s + t.maturityWeek * t.principalUSD, 0) / totalPrincipal);
    result.push({
      id: `${idPrefix}-ASSUMED-${nextWeek}-${bucketIndex++}`,
      principalUSD: totalPrincipal,
      rateType: group[0].rateType,
      couponRate: group[0].rateType === 'FIXED' ? weightedCoupon : undefined,
      floatingMarginBps: group[0].rateType === 'FLOATING' ? Math.round(weightedMarginBps) : undefined,
      originationWeek: nextWeek,
      maturityWeek: weightedMaturityWeek,
      seniority: group[0].seniority,
      // Identical across the group by construction (they are in the key).
      callProtection: group[0].callProtection,
      isBankFacility: group[0].isBankFacility,
      facilityBankTicker: group[0].facilityBankTicker,
      isCommercialPaper: group[0].isCommercialPaper,
    });
  });
  return result;
}

/**
 * §7.283 — IND7's SECOND HALF: THE DIVESTITURE, with the register mint it was waiting on.
 *
 * The hold was measured (§7.138): a firm dominant in a category for a sustained year may not
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
    && (c.productLines?.length ?? 0) >= 2 && c.sharesOutstanding > 0 && c.stockPrice > 0);
  blocked.forEach((parent) => {
    const line = [...(parent.productLines ?? [])]
      .sort((a, b) => (b.categoryMarketShare ?? 0) - (a.categoryMarketShare ?? 0))[0];
    if (!line) return;
    const share = Math.max(0.05, Math.min(0.9, line.revenueShare ?? 0));

    const tickers = new Set(ctx.updatedCompanies.map((c) => c.ticker));
    let ticker = `${parent.ticker}SP`;
    for (let n = 2; tickers.has(ticker); n++) ticker = `${parent.ticker}SP${n}`;
    const spinMcapUSD = Math.max(1, marketCapOf(parent) * share);
    // One spin-co share per parent share — the classic ratio, so a holder's fraction of the
    // parent IS its fraction of the spin-co and the mint below is one multiplication.
    const spinShares = parent.sharesOutstanding;
    const spinPrice = spinMcapUSD / Math.max(1e-9, spinShares);
    const employees = Math.max(1, Math.round(parent.employeeCount * share));

    // structuredClone: a shallow spread would SHARE every nested array/object with the parent,
    // and the first later mutation of either book would corrupt the other.
    const spin: typeof parent = structuredClone(parent);
    spin.id = `${parent.id}-SPIN-${ctx.nextWeek}`;
    spin.ticker = ticker;
    spin.name = `${parent.name} (${line.subUnitId} spin-off)`;
    spin.productLines = [{ ...line, revenueShare: 1 }];
    spin.annualRevenue = Number((parent.annualRevenue * share).toFixed(1));
    spin.netIncome = Number((parent.netIncome * share).toFixed(1));
    spin.ebitda = Number((parent.ebitda * share).toFixed(1));
    spin.employeeCount = employees;
    spin.sharesOutstanding = spinShares;
    spin.stockPrice = Number(spinPrice.toFixed(4));
    spin.debtTranches = [];
    spin.grossPPEUSD = (parent.grossPPEUSD ?? 0) * share;
    spin.accumulatedDepreciationUSD = (parent.accumulatedDepreciationUSD ?? 0) * share;
    if (spin.baselineNetPpeUSD !== undefined) spin.baselineNetPpeUSD = spin.baselineNetPpeUSD * share;
    spin.antitrustWeeksAboveThreshold = 0;
    revHistSeed(ctx.v2!, rowOf(ctx.v2!, spin.id), spin.annualRevenue);
    // §4.C II.5 — structuredClone(parent) used to carry the histories; the rings copy rows.
    {
      const v2r = ctx.v2!;
      const pf = rowOf(v2r, parent.id), sf = rowOf(v2r, spin.id);
      v2r.priceRing = ringCopyRow(v2r.priceRing, pf, sf);
      v2r.ratingRing = ringCopyRow(v2r.ratingRing, pf, sf);
      v2r.oasRing = ringCopyRow(v2r.oasRing, pf, sf);
    }

    // THE MINT: each holder of parent equity receives its pro-rata spin-co register rows,
    // BEFORE the parent's price steps down (the stake fraction reads the pre-split register).
    // §7.307 holdings flip: row walk for the stake read (the push and sync below stay on objects).
    const Hs = ctx.v2.holdings;
    const parentRef = internString(ctx.v2, parent.id);
    const equityRefS = internString(ctx.v2, 'EQUITY');
    ctx.updatedInstitutionalEntities.forEach((e) => {
      if (e.isDefaulted) return;
      let heldShares = 0;
      for (let r = bookHeadOf(ctx.v2, e.id); r >= 0; r = Hs.next[r]) {
        if (Hs.instrRef[r] !== parentRef || Hs.typeRef[r] !== equityRefS) continue;
        const sh = Hs.shares[r];
        heldShares += Number.isNaN(sh) ? Hs.qtyUSD[r] / Math.max(0.01, parent.stockPrice) : sh;
      }
      if (!(heldShares > 0)) return;
      const fraction = Math.min(1, heldShares / parent.sharesOutstanding);
      issueHolding(ctx.v2, { kind: 'COMPANY', ticker: spin.ticker }, { kind: 'INSTITUTION', id: e.id },
        { instrumentType: 'EQUITY', instrumentId: spin.id, issuerRegion: spin.region, valueUSD: fraction * spinMcapUSD, shares: fraction * spinShares }, 'spin-off: shares distributed');
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
    parent.grossPPEUSD = (parent.grossPPEUSD ?? 0) * (1 - share);
    parent.accumulatedDepreciationUSD = (parent.accumulatedDepreciationUSD ?? 0) * (1 - share);
    if (parent.baselineNetPpeUSD !== undefined) parent.baselineNetPpeUSD = parent.baselineNetPpeUSD * (1 - share);
    parent.stockPrice = Number((parent.stockPrice * (1 - share)).toFixed(4));
    parent.antitrustWeeksAboveThreshold = 0;

    // Opening cash is CARVED from the parent through settlement, like a firm birth's — the
    // economy's total cash never moves.
    const openingCashUSD = Math.max(0, cashOf(ctx.v2, parent)) * share;
    if (openingCashUSD > 0) {
      pay(ctx, {
        payer: { kind: 'COMPANY', ticker: parent.ticker },
        payee: { kind: 'COMPANY', ticker: spin.ticker },
        amountUSD: openingCashUSD,
        reason: 'divestiture: opening balance carved from parent',
      });
    }

    ctx.updatedCompanies.push(spin);
  });
}

export function runMergersStage(state: GameState, ctx: WeeklyStepContext): void {
  if (ctx.nextWeek % 13 !== 0) return;

  // §7.283: the authority's remedy runs on the same quarterly clock as its docket, whether or
  // not a merger also fires this quarter.
  runDivestitures(ctx);

  const merger = checkForMerger(ctx.v2, ctx.updatedCompanies, ctx.nextWeek,
    (Object.values(ctx.updatedRegions) as { supplyRelationships?: import('../../../domain/market-microstructure').SupplyRelationship[] }[])
      .flatMap((r) => r.supplyRelationships ?? []));
  if (!merger) return;

  const acquirer = ctx.updatedCompanies.find(c => c.ticker === merger.acquirerTicker);
  const target = ctx.updatedCompanies.find(c => c.ticker === merger.targetTicker);
  if (!acquirer || !target || !isActiveCompany(acquirer) || !isActiveCompany(target)) return;

  // IND7 — a firm under an antitrust hold does not get to buy another one. The hold is a
  // MEASURED position: a dominant share in some category it sells into, held for a sustained
  // window (§7.138), not a snapshot and not a label. This is the half of IND7 that exists; the
  // divestiture that should follow it is recorded there as unbuilt.
  if (isAntitrustBlocked(acquirer)) return;

  const purchasePrice = marketCapOf(target) * 1.15;
  const cashPaid = purchasePrice * 0.5;
  const stockPaid = purchasePrice * 0.5;
  const targetMarketCapUSD = Math.max(1, marketCapOf(target));

  // §7.241: the consideration is PAYMENTS now. The old form debited the acquirer directly and
  // the money arrived on NO book — target shareholders' register rows were neither re-keyed nor
  // paid, and `Math.max(10, …)` silently recapitalised an over-payer. This stage runs after the
  // corporate-action drains, so the tender pays holders of record directly by instruction
  // (the §7.43 timing trap is why it must not go through `payHoldersCash`'s pending map here).
  pay(ctx, {
    payer: { kind: 'COMPANY', ticker: acquirer.ticker },
    payee: { kind: 'COMPANY', ticker: target.ticker },
    amountUSD: cashPaid,
    reason: 'merger consideration (cash leg)',
  });
  // The target's own cash comes WITH the business (S5 leak #4) — as a payment, so the two home
  // banks see the deposit move.
  pay(ctx, {
    payer: { kind: 'COMPANY', ticker: target.ticker },
    payee: { kind: 'COMPANY', ticker: acquirer.ticker },
    amountUSD: Math.max(0, cashOf(ctx.v2, target)),
    reason: 'merger: acquired cash absorbed',
  });
  // The tender: the target pays its equity holders of record their cash half, pro rata to the
  // stake each holds; the residual float (the household sector's) receives the remainder.
  let institutionalTenderUSD = 0;
  // §7.307 holdings flip: row walk for the tender stake read.
  const Ht = ctx.v2.holdings;
  const targetRef = internString(ctx.v2, target.id);
  const equityRefT = internString(ctx.v2, 'EQUITY');
  ctx.updatedInstitutionalEntities.forEach((e) => {
    if (e.isDefaulted) return;
    let heldUSD = 0;
    for (let r = bookHeadOf(ctx.v2, e.id); r >= 0; r = Ht.next[r]) {
      if (Ht.instrRef[r] === targetRef && Ht.typeRef[r] === equityRefT) heldUSD += Ht.qtyUSD[r];
    }
    if (!(heldUSD > 0)) return;
    const tenderUSD = cashPaid * Math.min(1, heldUSD / targetMarketCapUSD);
    institutionalTenderUSD += tenderUSD;
    pay(ctx, {
      payer: { kind: 'COMPANY', ticker: target.ticker },
      payee: { kind: 'INSTITUTION', id: e.id },
      amountUSD: tenderUSD,
      reason: 'merger tender: cash for target shares',
    });
  });
  pay(ctx, {
    payer: { kind: 'COMPANY', ticker: target.ticker },
    payee: { kind: 'HOUSEHOLD', region: target.region },
    amountUSD: Math.max(0, cashPaid - institutionalTenderUSD),
    reason: 'merger tender: cash for target shares',
  });
  const newShares = stockPaid / Math.max(1, acquirer.stockPrice);
  acquirer.sharesOutstanding = Number((acquirer.sharesOutstanding + newShares).toFixed(3));
  acquirer.annualRevenue = Number((acquirer.annualRevenue + target.annualRevenue * 0.85).toFixed(1));
  acquirer.employeeCount += Math.round(target.employeeCount * 0.75);
  acquirer.grossPPEUSD = (acquirer.grossPPEUSD ?? 0) + (target.grossPPEUSD ?? 0);
  acquirer.accumulatedDepreciationUSD = (acquirer.accumulatedDepreciationUSD ?? 0) + (target.accumulatedDepreciationUSD ?? 0);

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
  // §7.311 writer flip — the ladders are sourced from the ROWS (the authority) and written
  // back to the rows; the object arrays are a week-end materialized view now.
  const v2m = ensureV2(state);
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
      // §5-CLOSE N2: the tranche is the ACQUIRER'S now and its id says so (the position that
      // protected it is re-pointed below, so nothing is orphaned); the old id stays inside for
      // the lineage.
      const transferredTranche = { ...t, id: `${acquirer.ticker}-ACQ${ctx.nextWeek}-${t.id}` };
      protectedAcquirerTranches.push(transferredTranche);
      ctx.workingPositions = ctx.workingPositions.map(p => {
        if (p.symbol === target.ticker && p.trancheId === t.id) {
          return { ...p, symbol: acquirer.ticker, trancheId: transferredTranche.id };
        }
        return p;
      });
    });

    // §5-FINALIZATION step 9 (N2): a target tranche that consolidates alone keeps its row but
    // is the acquirer's now — its id says so, the old id inside for the lineage.
    const consolidatedTranches = consolidateTranches(
      [...mergeableAcquirerTranches, ...mergeableTargetTranches.map((t) => ({ ...t, id: `${acquirer.ticker}-ACQ${ctx.nextWeek}-${t.id}` }))],
      ctx.nextWeek,
      acquirer.ticker
    );

    const newLadder = [...protectedAcquirerTranches, ...consolidatedTranches];
    rebuildLadder(v2m, { id: acquirer.id, ticker: acquirer.ticker, region: acquirer.region }, newLadder, 'merger: ladders consolidated');
  }
  rebuildLadder(v2m, { id: target.id, ticker: target.ticker, region: target.region }, [], 'merger: target ladder assumed');

  // HH4d (a hole the deposit-unification invariant exposed): an acquired BANK brings its whole
  // balance sheet — deposits, wholesale funding, the itemized business and household books, the
  // sovereign tenor book, cash and equity. Before this, the target bank's sheet was simply
  // stranded on the absorbed shell: 54B of deposits vanished from every derived sum in one week
  // while the households still held the money, and the borrowers' loans lost their lender.
  // §7.339: the line-by-line move is the resolution's `absorbBankSheet` (one transfer for the
  // two events that move a bank whole); a merger moves cash, wholesale and equity with it.
  if (target.bankBalanceSheet && acquirer.bankBalanceSheet) {
    const tb = target.bankBalanceSheet;
    const ab = acquirer.bankBalanceSheet;
    mergeBankSheets(ab, tb);
    moveSectorRowsToBank(ctx.v2, target.ticker, acquirer.ticker); // A3.3: the sector parties' rows at the target join the acquirer's
    moveBankReserves(ctx.v2, target.ticker, acquirer.ticker); // A3.6a: and its reserves join the acquirer's row
    // §5-FINALIZATION step 10: the target's facilities are rows on its borrowers' ladders that
    // name it as lender; the acquirer's equity now carries them, so each is wired lender to
    // lender (before this the loan rows moved and the ladders kept naming the absorbed bank,
    // and the next sync wrote the whole book off the acquirer as "left the ladders").
    ctx.updatedCompanies.concat(ctx.prevActivePrivateFirms).forEach((c) => {
      moveFacilityLender(ctx.v2, { id: c.id, ticker: c.ticker, region: c.region }, target.ticker, acquirer.ticker, 'merger: facilities move to the acquiring bank');
    });
    restateBankSheetStatistics(ab, bankReservesOf(ctx.v2, acquirer.ticker), bankDepositLines(ctx, acquirer.ticker), facilityBookOf(ctx.v2, acquirer.ticker));
    acquirer.bankMarketShare = Number(((acquirer.bankMarketShare ?? 0) + (target.bankMarketShare ?? 0)).toFixed(4));
    target.bankBalanceSheet = undefined;

    // §7.241: the target's STANDING CONTRACTS come with the bank. Before this, the repo, swap,
    // CDS and FX-forward books still named the absorbed ticker — the merged encumbrance scalar
    // above described pledges no live contract carried, and every counterparty's hedge pointed at
    // a dead desk. A contract survives a merger by NOVATION to the acquirer, so the books re-key.
    // §7.339: one re-key for every link that names a bank — the customers' house-bank field, the
    // facility rows, the repo and prime-brokerage books, the offering pipeline, the derivatives.
    rekeyBankLinks(state, ctx, target.region as RegionId, target.ticker, acquirer.ticker);
  }

  // OWN7: the target's PAPER moves with its debt. Holdings are keyed by the issuer's company
  // id, so a holder of the target's bonds or loans kept a row against a company that has just
  // left the books — while the same principal, now on the acquirer's ladder, was re-cleared to
  // the same institutions the following week. One tranche, two holders' rows, and the
  // conservation check saw the corporate books mint claims on the merger week (measured: 161B
  // held against 131B outstanding in USA leveraged loans). §7.241: the equity rows ARE re-keyed
  // now — each target shareholder was paid the cash half in the tender above and holds the stock
  // half as real acquirer shares below, instead of keeping a claim on a dead company.
  // §7.241: the STOCK half of the consideration becomes real acquirer shares on the holders'
  // rows — the old code minted `newShares` onto `sharesOutstanding` with rows for NOBODY, while
  // target equity rows stayed keyed to a dead company. Each target share row converts to the
  // acquirer stock it was exchanged for (its stake's share of the stock leg).
  // §7.313 flip — the re-key is column writes on the matching rows: interned refs swap to the
  // acquirer's, and the equity rows revalue in place.
  const stockRatio = stockPaid / targetMarketCapUSD;
  {
    // §5-WIRES W2: the exchange is two wires per holder — the target's paper back to the target
    // (retired), the acquirer's paper out to the holder (issued) — never a re-key in place.
    const H = ctx.v2.holdings;
    const targetIdRef = ctx.v2.internedIdByString.get(target.id);
    if (targetIdRef !== undefined) {
      const equityRefR = internString(ctx.v2, 'EQUITY');
      const corpBondRef = internString(ctx.v2, 'CORP_BOND');
      const levLoanRef = internString(ctx.v2, 'LEVERAGED_LOAN');
      // Step 9 (O3): the target's commercial paper is on the acquirer's ladder too — its holders'
      // rows exchange like the bonds' (it was the one company-keyed kind the exchange skipped).
      const cpRef = internString(ctx.v2, 'COMMERCIAL_PAPER');
      ctx.updatedInstitutionalEntities.forEach((e) => {
        const swaps: { type: ItemizedHolding['instrumentType']; valueUSD: number; shares: number | undefined }[] = [];
        for (let r = bookHeadOf(ctx.v2, e.id); r >= 0; r = H.next[r]) {
          if (H.instrRef[r] !== targetIdRef) continue;
          const t = H.typeRef[r];
          if (t !== equityRefR && t !== corpBondRef && t !== levLoanRef && t !== cpRef) continue;
          swaps.push({ type: ctx.v2.internedStrings[t] as ItemizedHolding['instrumentType'], valueUSD: H.qtyUSD[r], shares: Number.isNaN(H.shares[r]) ? undefined : H.shares[r] });
        }
        if (swaps.length === 0) return;
        const holder = { kind: 'INSTITUTION' as const, id: e.id };
        // §5-WIRES W3: the exchange settles through the clearing houses — the target's paper goes
        // back to its house, the acquirer's comes from its own; the issuers' wires are the
        // ladders' (`rebuildLadder` below) and the equity issuer's, counted once.
        swaps.forEach((sw) => {
          transferHolding(ctx.v2, holder, { kind: 'CLEARING_HOUSE', region: target.region },
            { instrumentType: sw.type, instrumentId: target.id, issuerRegion: target.region, valueUSD: sw.valueUSD, shares: sw.shares }, 'merger: target paper exchanged');
          const isEquity = heldInShares(sw.type);
          const newValueUSD = isEquity ? sw.valueUSD * stockRatio : sw.valueUSD;
          if (newValueUSD > 1) {
            transferHolding(ctx.v2, { kind: 'CLEARING_HOUSE', region: acquirer.region }, holder,
              { instrumentType: sw.type, instrumentId: acquirer.id, issuerRegion: acquirer.region, valueUSD: newValueUSD, shares: isEquity && acquirer.stockPrice > 0 ? newValueUSD / acquirer.stockPrice : sw.shares }, 'merger: acquirer paper delivered');
          }
        });
        bumpRegister(ctx);
      });
    }
  }

  // §5-FINALIZATION step 9 — NOTHING STAYS BEHIND ON THE TARGET. Its standing derivatives
  // novate to the acquirer (a bank's already did through `rekeyBankLinks`), the consignments
  // still on their way to it are the acquirer's to take delivery of, its finished stock and
  // input lots move onto the acquirer's books by wire, and its supply contracts name the
  // acquirer on either side. A merged firm is not dead — an acquired firm's rows cannot exist.
  if (!target.bankBalanceSheet) {
    const rekey = (p: DerivativeParty): DerivativeParty => (p.kind === 'COMPANY' && p.ticker === target.ticker ? { kind: 'COMPANY', ticker: acquirer.ticker } : p);
    ctx.derivativesBook = derivativesBookOf(ctx, state).map((c) => ({ ...c, a: rekey(c.a), b: rekey(c.b) }));
  }
  (state.goodsInTransit ?? []).forEach((sh) => { if (sh.buyerTicker === target.ticker) sh.buyerTicker = acquirer.ticker; });
  Object.entries(target.outputInventoryBySubUnit ?? {}).forEach(([subUnitId, row]) => {
    moveOutputUnits(target, acquirer, subUnitId, row.unitsHeld, row.valueUSD, 'merger: finished stock assumed');
  });
  Object.keys(materializeInputInventory(ctx.v2, target.id)).forEach((subUnitId) => {
    moveInputUnits(ctx.v2, target, acquirer, subUnitId, inputUnitsHeld(ctx.v2, target.id, subUnitId), ctx.nextWeek, 'merger: input lots assumed');
  });
  novateContracts(ctx.v2, [target.ticker, target.id], acquirer.ticker);

  // Target is absorbed and exits active operations
  target.mergerAcquired = true;
  target.acquiredByTicker = acquirer.ticker;
  target.isDefaulted = false;
  target.stockPrice = 0;
  target.employeeCount = 0;
  target.annualRevenue = 0;
  target.capex = 0;
  target.maintenanceCapex = 0;
  target.growthCapex = 0;
  target.grossPPEUSD = 0;
  target.accumulatedDepreciationUSD = 0;

  ctx.recentMergers.push({
    acquirerTicker: acquirer.ticker,
    acquirerName: acquirer.name,
    targetTicker: target.ticker,
    targetName: target.name,
    week: ctx.nextWeek,
    dealValueUSD: purchasePrice
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
    timestamp: getSimulationDate(ctx.nextWeek).toISOString(),
    category: 'MICRO',
    message: `Merger Executed: ${acquirer.name} acquired ${target.name}`,
    deltaText: '',
    data: { acquirer: acquirer.ticker, target: target.ticker }
  });
}
