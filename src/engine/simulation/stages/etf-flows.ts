/**
 * ETF FLOWS — who buys the index, how the shares come into existence, and what the dealers do
 * about the gap.
 *
 * Runs after the indexes are struck, so this week's memberships and weights are final, and it
 * sets up NEXT week's fund demand — the same announce-then-price rhythm WS8 uses, because an ETF
 * that decides and executes in the same instant is not intermediation, it is teleportation.
 *
 * Three real steps:
 *
 *   1. **Who indexes what.** Running a direct book takes research capacity, and capacity scales
 *      with the money you run against the number of names you would have to cover. So an entity
 *      indexes the part of the market it cannot cover, TIER BY TIER: a large insurer researches
 *      the two dozen large caps itself and buys the small-cap index, because those are a hundred
 *      and fifty names it will never staff. That is the real pattern, and it falls out of one
 *      coverage rule rather than a preference assigned per entity type. Hedge funds are the
 *      exception in the other direction and never index — a fund expressing a view on a name does
 *      not buy the basket that dilutes it.
 *   2. **Creations and redemptions.** The fund does not sell its own shares. An authorised
 *      participant — a dealer — delivers the basket and takes shares, or the reverse, and its
 *      capacity is real balance sheet: the basket sits on its book between buying and delivering.
 *   3. **The premium.** What the APs could not absorb, as a fraction of NAV. Zero when the
 *      arbitrage is unconstrained, which is most weeks; positive when a week's flow is larger
 *      than the dealers can carry, which is the case worth being able to see.
 */

import { GameState, InstitutionalEntity, RegionId } from '../../../types';
import { WeeklyStepContext } from './context';
import { pendingSettlementUSD } from './settlement';
import { INDEX_DEFINITIONS, IndexDefinition, MarketIndex } from '../../../domain/indexes';
import { AP_WEEKLY_CAPACITY_MULTIPLE_OF_EQUITY, ETF_INCEPTION_NAV_PER_SHARE, NAMES_COVERED_AT_ONE_BILLION_AUM, RESEARCH_COVERAGE_SCALING_EXPONENT } from '../../../domain/etf';
import { ItemizedHolding } from '../../../domain/banking';
import { isActiveCompany, isPubliclyListed } from '../../../domain/company';
import { householdEtfHoldingsUSD, householdPrivateBusinessEquityUSD } from '../../macro/household-portfolio';
import { BUFFER_TARGET_WEEKS } from '../../macro/household-cohorts';
import { publicComparableEvMultiple } from './pe-lifecycle';

/** An entity's money for one asset class, from its own mandate weights. */
function classAppetiteUSD(entity: InstitutionalEntity, def: IndexDefinition): number {
  const t = entity.assetAllocationTarget;
  const pct = def.assetClass === 'EQUITY' ? t.equityPct
    : def.assetClass === 'CORP_BOND' ? t.corpBondPct
    : t.loanPct;
  return Math.max(0, entity.totalAssetsUSD) * pct;
}

/**
 * The share of an exposure this entity has to buy through an index, because it cannot cover the
 * names itself. Coverage is its own assets against the number of names in the tier; below full
 * coverage the shortfall is indexed.
 */
function indexedShare(entity: InstitutionalEntity, nameCount: number): number {
  if (nameCount <= 0) return 0;
  // A fund that picks names does not buy the basket that averages them away.
  if (entity.entityType === 'HEDGE_FUND') return 0;
  const aumBillions = Math.max(0, entity.totalAssetsUSD) / 1e9;
  const namesCovered = NAMES_COVERED_AT_ONE_BILLION_AUM * Math.pow(aumBillions, RESEARCH_COVERAGE_SCALING_EXPONENT);
  return Math.max(0, 1 - Math.min(1, namesCovered / nameCount));
}

/** NAV of a fund: its real basket at this week's cleared marks, plus cash it has not deployed. */
function fundNavUSD(fund: InstitutionalEntity): number {
  const holdingsUSD = fund.itemizedHoldings.reduce((s, h) => s + (h.quantityOrNotionalUSD ?? 0), 0);
  return holdingsUSD + Math.max(0, fund.cashUSD ?? 0);
}

export function runEtfFlowsStage(state: GameState, ctx: WeeklyStepContext): void {
  const indexById = new Map(ctx.updatedMarketIndexes.map((i) => [i.id, i]));
  const defById = new Map(INDEX_DEFINITIONS.map((d) => [d.id, d]));
  const funds = ctx.updatedInstitutionalEntities.filter((e) => e.entityType === 'ETF' && e.etf);
  if (funds.length === 0) return;

  // ---- 1. The sponsor's fee, out of the fund's assets. A real flow between two named books. ----
  const feeBySponsor = new Map<string, number>();
  const navByFundId = new Map<string, number>();
  funds.forEach((fund) => {
    const navUSD = fundNavUSD(fund);
    const feeUSD = (navUSD * fund.etf!.expenseRatioAnnual) / 52;
    if (feeUSD > 0) feeBySponsor.set(fund.etf!.sponsorEntityId, (feeBySponsor.get(fund.etf!.sponsorEntityId) ?? 0) + feeUSD);
    navByFundId.set(fund.id, Math.max(0, navUSD - feeUSD));
  });

  // ---- 2. What every investor wants to hold in each fund next week. ----
  const investors = ctx.updatedInstitutionalEntities.filter(
    (e) => e.entityType !== 'ETF' && e.entityType !== 'PRIVATE_EQUITY' && e.entityType !== 'MONEY_MARKET_FUND' && !e.isDefaulted
  );
  /** fundId -> investorId -> desired dollars */
  const desiredByFund = new Map<string, Map<string, number>>();
  funds.forEach((f) => desiredByFund.set(f.id, new Map()));

  investors.forEach((investor) => {
    // The tiers this investor could index, in its OWN region: an entity's book is domestic today,
    // so a global or foreign fund has no allocation to draw on (see the plan's note — cross-border
    // allocation arrives with WS9).
    const candidates = funds.filter((f) => {
      const def = defById.get(f.etf!.indexId);
      return !!def && def.region === investor.region;
    });
    if (candidates.length === 0) return;

    // Equity splits between the size tiers by coverage, so the tier an investor cannot staff is
    // the tier it indexes. ALL_CAP is what an investor buys when it cannot cover EITHER tier —
    // it is not picking a size, it is buying the market.
    const equityFunds = candidates.filter((f) => defById.get(f.etf!.indexId)!.assetClass === 'EQUITY');
    const tierFunds = equityFunds.filter((f) => {
      const tier = defById.get(f.etf!.indexId)!.tier;
      return tier === 'LARGE_CAP' || tier === 'SMALL_CAP';
    });
    const allCapFund = equityFunds.find((f) => defById.get(f.etf!.indexId)!.tier === 'ALL_CAP');
    const tierIndexedShares = tierFunds.map((f) => ({
      fund: f,
      share: indexedShare(investor, indexById.get(f.etf!.indexId)?.constituents.length ?? 0),
    }));

    // An investor indexes the WHOLE MARKET to the extent it indexes every tier, and tops up the
    // one tier it cannot cover. So the common part of its indexed appetite goes to the total-market
    // fund and only the DIFFERENCE between tiers goes to a size fund — which is what a core and a
    // tilt actually are. Routing purely by tier left the all-cap funds with no possible buyer, and
    // routing purely to all-cap would have lost the real fact that a house able to research two
    // dozen large caps still cannot staff a hundred and fifty small ones.
    const equityAppetiteUSD = allCapFund
      ? classAppetiteUSD(investor, defById.get(allCapFund.etf!.indexId)!)
      : 0;
    const coreShare = tierIndexedShares.length > 0
      ? Math.min(...tierIndexedShares.map((x) => x.share))
      : 0;
    if (allCapFund && coreShare > 0 && equityAppetiteUSD > 0) {
      desiredByFund.get(allCapFund.id)!.set(investor.id, equityAppetiteUSD * coreShare);
    }
    const allCapValueUSD = indexById.get(allCapFund?.etf?.indexId ?? '')?.totalValueUSD ?? 0;
    tierIndexedShares.forEach(({ fund, share }) => {
      const tiltShare = share - coreShare;
      if (!(tiltShare > 0)) return;
      const def = defById.get(fund.etf!.indexId)!;
      const tierValueUSD = indexById.get(def.id)?.totalValueUSD ?? 0;
      const tierShareOfMarket = allCapValueUSD > 0 ? tierValueUSD / allCapValueUSD : 0;
      const wantUSD = classAppetiteUSD(investor, def) * tierShareOfMarket * tiltShare;
      if (wantUSD > 0) desiredByFund.get(fund.id)!.set(investor.id, wantUSD);
    });

    // Credit: one book per index, indexed by the same coverage rule.
    candidates
      .filter((f) => defById.get(f.etf!.indexId)!.assetClass !== 'EQUITY')
      .forEach((fund) => {
        const def = defById.get(fund.etf!.indexId)!;
        const share = indexedShare(investor, indexById.get(def.id)?.constituents.length ?? 0);
        const wantUSD = classAppetiteUSD(investor, def) * share;
        if (wantUSD > 0) desiredByFund.get(fund.id)!.set(investor.id, wantUSD);
      });
  });

  // ---- 2b. HOUSEHOLDS. The truest source of index-fund demand, and the buyer the broad-market
  // funds never had. A household runs no research desk at all, so the coverage rule that decides
  // who indexes makes it a 100% indexer by construction — it is the one holder for which the
  // answer is not a judgement call.
  //
  // How much of this week's saving goes to funds rather than deposits is the HOUSEHOLD RATE
  // RESPONSE, and it comes from cleared prices against the real deposit rate: the earnings yield
  // the region's listed market is actually throwing off, less what a deposit pays. When cash pays
  // more than equities earn, households stop buying equities. That is the channel G1b is missing,
  // and it is the same shape WS7 already uses for the deposit-versus-money-fund split.
  const householdDemandByFund = new Map<string, number>();
  (['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach((region) => {
    const reg = ctx.updatedRegions[region];
    const hs = reg?.householdState;
    if (!hs) return;

    const listed = ctx.updatedCompanies.filter(
      (c) => c.region === region && isActiveCompany(c) && isPubliclyListed(c) && c.marketCap > 0
    );
    const capUSD = listed.reduce((a2, c) => a2 + c.marketCap, 0);
    const earningsUSD = listed.reduce((a2, c) => a2 + c.netIncome, 0);
    const earningsYield = capUSD > 0 ? earningsUSD / capUSD : 0;
    // What household cash earns as an alternative: the region's money fund's own cleared net
    // yield (WS7), which is the real competing rate deposits are priced against.
    const mmf = ctx.updatedInstitutionalEntities.find(
      (e) => e.region === region && e.entityType === 'MONEY_MARKET_FUND'
    );
    const depositYield = mmf?.mmfNetYieldAnnual ?? reg.policyRate ?? 0;
    const equityShareOfSaving = earningsYield > 0
      ? Math.max(0, Math.min(1, (earningsYield - depositYield) / earningsYield))
      : 0;

    // The saving actually available this week, out of the deposits stage 02 just credited.
    //
    // DIST — AND HOUSEHOLDS CAN SELL NOW, WHICH IS THE POINT OF THIS BLOCK.
    //
    // It was `Math.max(0, saving x equityShare)`: a household could buy funds or not buy funds,
    // and there was no household term in `grossRedeemUSD` anywhere. Unemployment could only ever
    // SLOW purchases, never force a sale — so a drawdown had no household seller in it, which is
    // precisely the amplifier that makes one self-reinforcing (§6.1).
    //
    // The savings rate is signed since §7.165, so this is too. What a household does with a
    // shortfall is not to sell at once: it runs its cash down first and sells only what its
    // deposits cannot cover. That ordering is why forced selling is rare, and why it is violent
    // when it comes — every buffer is exhausted at the same time, near the bottom.
    const weeklySavingUSD = (reg.estimatedHouseholdIncomeUSD * (hs.savingsRate ?? 0)) / 52;
    let intoFundsUSD: number;
    if (weeklySavingUSD >= 0) {
      intoFundsUSD = weeklySavingUSD * equityShareOfSaving;
    } else {
      // The floor is the SAME buffer the saving decision is taken against — it is the same
      // buffer, so it is the same number (rule 3).
      const bufferFloorUSD = (reg.estimatedHouseholdIncomeUSD / 52) * BUFFER_TARGET_WEEKS;
      const depositHeadroomUSD = Math.max(0, (hs.depositsUSD ?? 0) - bufferFloorUSD);
      // Sell only the part of the gap the cash cannot meet, and never more than is held.
      const heldUSD = householdEtfHoldingsUSD(hs, ctx.updatedInstitutionalEntities);
      intoFundsUSD = -Math.min(Math.max(0, heldUSD),
        Math.max(0, -weeklySavingUSD - depositHeadroomUSD));
    }
    if (Math.abs(intoFundsUSD) < 1) return;

    // Households buy the BROAD market: they are not picking a size tier, which is exactly what an
    // all-cap fund is for and why it had no buyer while institutions were the only investors.
    const broad = funds.find((f) => {
      const def = defById.get(f.etf!.indexId);
      return !!def && def.region === region && def.assetClass === 'EQUITY' && def.tier === 'ALL_CAP';
    });
    if (broad) householdDemandByFund.set(broad.id, (householdDemandByFund.get(broad.id) ?? 0) + intoFundsUSD);
  });

  // ---- 3. The authorised participants' capacity: real dealer balance sheet, per region. ----
  const apCapacityByRegion = new Map<RegionId, number>();
  (['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach((r) => {
    const banks = ctx.updatedCompanies.filter((c) => c.region === r && c.bankBalanceSheet);
    const equityUSD = banks.reduce((s, c) => s + (c.bankBalanceSheet?.bankEquityUSD ?? 0), 0);
    apCapacityByRegion.set(r, Math.max(0, equityUSD) * AP_WEEKLY_CAPACITY_MULTIPLE_OF_EQUITY);
  });

  // ---- 4. Creations and redemptions, and the residual the arbitrage could not absorb. ----
  // A region's dealers have ONE balance sheet between them, so the week's baskets compete for it.
  // Allocating the whole regional capacity to every fund independently would let ten funds each
  // spend the same dollar of dealer equity.
  const netFlowByFund = new Map<string, number>();
  const householdExecutedByFund = new Map<string, number>();
  const cashDeltaByEntity = new Map<string, number>();
  const holdingsDeltaByInvestor = new Map<string, Map<string, number>>();
  const addCash = (id: string, usd: number) => cashDeltaByEntity.set(id, (cashDeltaByEntity.get(id) ?? 0) + usd);

  /** What each investor wants to move in each fund, and the fund's net — computed before any
   *  execution, because the AP capacity split depends on the whole week's demand at once. */
  const flowPlanByFund = new Map<string, {
    navPerShare: number; wantDelta: Map<string, number>; grossCreateUSD: number; grossRedeemUSD: number;
    householdUSD: number;
  }>();
  // One pass over the investors' books instead of a `.find` per investor PER FUND — the same
  // first-match-wins row each per-fund scan used to stop at (per-item scans in per-item loops:
  // the §7.32 anti-pattern, found here by the SCALE profile at ~17 ms/week).
  const etfShareRowByInvestor = new Map<string, Map<string, { quantityShares?: number }>>();
  const investorById = new Map(investors.map((i) => [i.id, i]));
  investors.forEach((inv) => {
    let rows: Map<string, { quantityShares?: number }> | undefined;
    inv.itemizedHoldings.forEach((x) => {
      if (x.instrumentType !== 'ETF_SHARE') return;
      if (!rows) { rows = new Map(); etfShareRowByInvestor.set(inv.id, rows); }
      if (!rows.has(x.instrumentId)) rows.set(x.instrumentId, x);
    });
  });

  // ETF2 — ONE BUDGET PER INVESTOR, ACROSS EVERY FUND IT BUYS INTO.
  //
  // The cash test below is right and was applied in the wrong place: inside a loop over FUNDS, so
  // an investor buying into three of them was allowed its full balance in each. The same dollar
  // was budgeted once per fund, and the overdrafts that produced are the harness's largest
  // remaining violation family (§7.196 traced one of them; the reconcile plug was quietly paying
  // for it every week). A running budget is what every other book in this model gives a bidder.
  const budgetRemainingByInvestor = new Map<string, number>();
  const budgetOf = (inv: { id: string; cashUSD?: number }): number => {
    const existing = budgetRemainingByInvestor.get(inv.id);
    if (existing !== undefined) return existing;
    const opening = Math.max(0, (inv.cashUSD ?? 0)
      + pendingSettlementUSD(ctx, { kind: 'INSTITUTION', id: inv.id }));
    budgetRemainingByInvestor.set(inv.id, opening);
    return opening;
  };

  funds.forEach((fund) => {
    const desired = desiredByFund.get(fund.id)!;
    const navUSD = navByFundId.get(fund.id) ?? 0;
    const sharesOutstanding = fund.etf!.sharesOutstanding;
    const navPerShare = sharesOutstanding > 0 && navUSD > 0
      ? navUSD / sharesOutstanding
      : ETF_INCEPTION_NAV_PER_SHARE;

    // What each investor holds today, in dollars at the current NAV.
    const heldByInvestor = new Map<string, number>();
    investors.forEach((inv) => {
      const h = etfShareRowByInvestor.get(inv.id)?.get(fund.id);
      if (h) heldByInvestor.set(inv.id, (h.quantityShares ?? 0) * navPerShare);
    });

    // Gross flow both ways, netted — an AP only has to carry the net basket.
    let grossCreateUSD = 0;
    let grossRedeemUSD = 0;
    const wantDeltaByInvestor = new Map<string, number>();
    const ids = new Set([...desired.keys(), ...heldByInvestor.keys()]);
    ids.forEach((id) => {
      const investor = investorById.get(id);
      if (!investor) return;
      const wantUSD = desired.get(id) ?? 0;
      const haveUSD = heldByInvestor.get(id) ?? 0;
      // A buyer can only pay with money it has, and only once: the budget is what is LEFT after
      // the funds already visited this week, plus whatever this week's clearing books have
      // already committed of it (`pendingSettlementUSD`). A seller is unconstrained.
      const deltaUSD = wantUSD > haveUSD
        ? Math.min(wantUSD - haveUSD, budgetOf(investor))
        : wantUSD - haveUSD;
      if (Math.abs(deltaUSD) < 1) return;
      if (deltaUSD > 0) budgetRemainingByInvestor.set(id, budgetOf(investor) - deltaUSD);
      wantDeltaByInvestor.set(id, deltaUSD);
      if (deltaUSD > 0) grossCreateUSD += deltaUSD; else grossRedeemUSD += -deltaUSD;
    });

    // Household saving is a creation order like any other and competes for the same AP capacity.
    // ...and a household REDEMPTION is a redemption like any other, which is what makes a forced
    // household sale reach the fund's own basket and the prices in it.
    const householdUSD = householdDemandByFund.get(fund.id) ?? 0;
    if (householdUSD > 0) grossCreateUSD += householdUSD;
    else if (householdUSD < 0) grossRedeemUSD += -householdUSD;
    flowPlanByFund.set(fund.id, {
      navPerShare, wantDelta: wantDeltaByInvestor, grossCreateUSD, grossRedeemUSD, householdUSD,
    });
    netFlowByFund.set(fund.id, grossCreateUSD - grossRedeemUSD);
  });

  // Split each region's dealer capacity across the funds competing for it, by the size of the net
  // basket each one needs carried.
  const capacityByFund = new Map<string, number>();
  (['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach((region) => {
    const regionFunds = funds.filter((f) => f.region === region);
    const demandUSD = regionFunds.reduce((a, f) => a + Math.abs(netFlowByFund.get(f.id) ?? 0), 0);
    const capacityUSD = apCapacityByRegion.get(region) ?? 0;
    regionFunds.forEach((f) => {
      const share = demandUSD > 0 ? Math.abs(netFlowByFund.get(f.id) ?? 0) / demandUSD : 0;
      capacityByFund.set(f.id, capacityUSD * share);
    });
  });

  funds.forEach((fund) => {
    const plan = flowPlanByFund.get(fund.id);
    if (!plan) return;
    const { navPerShare, wantDelta: wantDeltaByInvestor, grossCreateUSD, grossRedeemUSD, householdUSD } = plan;
    const sharesOutstanding = fund.etf!.sharesOutstanding;
    const netUSD = grossCreateUSD - grossRedeemUSD;
    const capacityUSD = capacityByFund.get(fund.id) ?? 0;
    const absorbedUSD = Math.min(Math.abs(netUSD), capacityUSD);
    const fillRatio = Math.abs(netUSD) > 0 ? absorbedUSD / Math.abs(netUSD) : 1;

    // Everyone's order is filled in the same proportion — the AP cannot choose whose basket to
    // carry. Redemptions net against creations first, so only the residual consumes capacity.
    // ETF2 — AND A FUND CAN ONLY PAY A REDEMPTION OUT OF CASH IT HAS.
    //
    // A redemption settled in CASH is money leaving the fund, and nothing checked that it had
    // any: a fund whose assets are securities paid out anyway and went overdrawn, which is the
    // other half of the violation family above. What it cannot settle is unmet flow — the
    // mechanism already has a name and a meter for that (`unmetFlowShare`).
    //
    // The real answer is IN KIND: an ETF redemption hands over the basket, not money, and needs
    // no cash at all. That is the next slice of this row, and it is why the cap here is a
    // constraint rather than a fix — until the basket moves, a fund short of cash genuinely
    // cannot honour the redemption.
    const fundCashAvailableUSD = Math.max(0, (fund.cashUSD ?? 0)
      + pendingSettlementUSD(ctx, { kind: 'INSTITUTION', id: fund.id }));
    // The redemption side is rationed by the fund's own cash on top of the AP's capacity: both
    // are real constraints and the tighter one binds.
    const cashFillRatio = grossRedeemUSD > 0
      ? Math.min(1, fundCashAvailableUSD / grossRedeemUSD)
      : 1;
    const executedByInvestor = new Map<string, number>();
    wantDeltaByInvestor.forEach((deltaUSD, id) => {
      // The netted part always clears; only the imbalance is rationed.
      const nettedShare = Math.abs(netUSD) > 0
        ? (deltaUSD > 0 ? Math.min(grossCreateUSD, grossRedeemUSD) / Math.max(1, grossCreateUSD)
                        : Math.min(grossCreateUSD, grossRedeemUSD) / Math.max(1, grossRedeemUSD))
        : 1;
      const imbalanceShare = 1 - nettedShare;
      const apExecutedUSD = deltaUSD * (nettedShare + imbalanceShare * fillRatio);
      const executedUSD = apExecutedUSD < 0 ? apExecutedUSD * cashFillRatio : apExecutedUSD;
      if (Math.abs(executedUSD) >= 1) executedByInvestor.set(id, executedUSD);
    });

    let fundCashDeltaUSD = 0;
    // The household leg, rationed at the same fill the institutions get — the AP cannot choose
    // whose basket to carry. Paid for out of the deposits stage 02 credited this week, so the
    // money genuinely leaves the household balance sheet to buy the shares.
    const householdExecutedUSD = householdUSD * fillRatio * (householdUSD < 0 ? cashFillRatio : 1);
    if (householdExecutedUSD !== 0) {
      fundCashDeltaUSD += householdExecutedUSD;
      householdExecutedByFund.set(fund.id, householdExecutedUSD);
    }
    executedByInvestor.forEach((executedUSD, id) => {
      addCash(id, -executedUSD);
      fundCashDeltaUSD += executedUSD;
      const shares = executedUSD / navPerShare;
      const byFund = holdingsDeltaByInvestor.get(id) ?? new Map<string, number>();
      byFund.set(fund.id, (byFund.get(fund.id) ?? 0) + shares);
      holdingsDeltaByInvestor.set(id, byFund);
    });
    addCash(fund.id, fundCashDeltaUSD);

    const createdShares = fundCashDeltaUSD / navPerShare;
    const unabsorbedUSD = Math.abs(netUSD) - absorbedUSD;
    fund.etf = {
      ...fund.etf!,
      sharesOutstanding: Math.max(0, sharesOutstanding + createdShares),
      // The share of THIS WEEK'S FLOW the arbitrage could not carry — bounded in [-1, 1] because
      // it is a fraction of the flow, not of the fund.
      unmetFlowShare: Math.abs(netUSD) > 0 ? (Math.sign(netUSD) * unabsorbedUSD) / Math.abs(netUSD) : 0,
    };
  });

  // ---- 5. Apply every cash and share movement in one pass, then re-mark every ETF claim. ----
  // A holder's shares are a claim on the fund's assets, so they have to be carried at the fund's
  // CURRENT net asset value per share — not at whatever NAV happened to prevail when the holder
  // last traded. Marking only the holdings that moved left the claims drifting away from the
  // assets backing them (measured: 13.49B of fund assets against 13.38B of claims after thirty
  // weeks), which is the same class of error as any stale mark.
  const finalNavPerShareByFund = new Map<string, number>();
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((entity) => {
    const feeUSD = feeBySponsor.get(entity.id) ?? 0;
    const cashUSD = cashDeltaByEntity.get(entity.id) ?? 0;
    const shareDeltas = holdingsDeltaByInvestor.get(entity.id);
    // A fund pays its own fee out of the same cash the investors put in.
    const fundFeeUSD = entity.entityType === 'ETF' && entity.etf
      ? (fundNavUSD(entity) * entity.etf.expenseRatioAnnual) / 52
      : 0;
    if (!feeUSD && !cashUSD && !shareDeltas && !fundFeeUSD) return entity;

    let holdings = entity.itemizedHoldings;
    if (shareDeltas) {
      const next = [...holdings];
      shareDeltas.forEach((shares, fundId) => {
        const idx = next.findIndex((h) => h.instrumentType === 'ETF_SHARE' && h.instrumentId === fundId);
        const fund = funds.find((f) => f.id === fundId)!;
        const navPerShare = (navByFundId.get(fundId) ?? 0) > 0 && fund.etf!.sharesOutstanding > 0
          ? (navByFundId.get(fundId) ?? 0) / fund.etf!.sharesOutstanding
          : ETF_INCEPTION_NAV_PER_SHARE;
        if (idx >= 0) {
          const held = (next[idx].quantityShares ?? 0) + shares;
          if (held <= 1e-6) next.splice(idx, 1);
          else next[idx] = { ...next[idx], quantityShares: held, quantityOrNotionalUSD: held * navPerShare };
        } else if (shares > 1e-6) {
          next.push({
            instrumentId: fundId,
            instrumentType: 'ETF_SHARE',
            issuerRegion: fund.region,
            quantityShares: shares,
            quantityOrNotionalUSD: shares * navPerShare,
          } as ItemizedHolding);
        }
      });
      holdings = next;
    }
    return {
      ...entity,
      cashUSD: (entity.cashUSD ?? 0) + cashUSD + feeUSD - fundFeeUSD,
      itemizedHoldings: holdings,
    };
  });

  // Every fund's final NAV per share, after this week's creations, fees and cash movements.
  ctx.updatedInstitutionalEntities.forEach((e) => {
    if (e.entityType !== 'ETF' || !e.etf) return;
    const shares = e.etf.sharesOutstanding;
    finalNavPerShareByFund.set(e.id, shares > 0 ? fundNavUSD(e) / shares : ETF_INCEPTION_NAV_PER_SHARE);
  });
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((entity) => {
    if (!entity.itemizedHoldings.some((h) => h.instrumentType === 'ETF_SHARE')) return entity;
    return {
      ...entity,
      itemizedHoldings: entity.itemizedHoldings.map((h) => {
        if (h.instrumentType !== 'ETF_SHARE') return h;
        const navPerShare = finalNavPerShareByFund.get(h.instrumentId);
        if (navPerShare === undefined) return h;
        return { ...h, quantityOrNotionalUSD: (h.quantityShares ?? 0) * navPerShare };
      }),
    };
  });

  // The household creation leg is handed to `household-balance-sheet.ts`, which owns the
  // household books. This stage owns the FLOW — who wanted what, and what the dealers could carry.
  ctx.householdEtfPurchasesUSD = householdExecutedByFund;
}