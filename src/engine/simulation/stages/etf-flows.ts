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

import { institutionProfile } from '../../../domain/institution-profiles';
import { bookHeadOf, pushBookRow, relinkBook, markBookDirty } from '../../../engine2/holdings';
import { internString } from '../../../engine2/world';
import { pay, institutionSpendableUSD } from './settlement';
import { GameState, InstitutionalEntity, RegionId } from '../../../types';
import { mandatePctOf } from '../../../domain/institutions';
import { bumpRegister } from './register-index';
import { WeeklyStepContext } from './context';
import { INDEX_DEFINITIONS, IndexDefinition, MarketIndex } from '../../../domain/indexes';
import { apWeeklyCapacityUSD, basketAssemblyCostRate, ETF_INCEPTION_NAV_PER_SHARE, NAMES_COVERED_AT_ONE_BILLION_AUM, RESEARCH_COVERAGE_SCALING_EXPONENT } from '../../../domain/etf';
import { ItemizedHolding } from '../../../domain/banking';
import { isActiveCompany, isPubliclyListed } from '../../../domain/company';
import { householdEtfHoldingsUSD, householdPrivateBusinessEquityUSD } from '../../macro/household-portfolio';
import { BUFFER_TARGET_WEEKS } from '../../macro/household-cohorts';
import { publicComparableEvMultiple } from './pe-lifecycle';
import { MAX_WEEKLY_PRICE_MOVE_PCT } from './07e-equity-clearing';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';
import { DESK_SPREAD_BPS_BY_BOOK } from '../../../domain/dealer-desk';
import { REGION_IDS } from '../../../domain/geography';


/** An entity's money for one asset class, from its own mandate weights. */
function classAppetiteUSD(entity: InstitutionalEntity, def: IndexDefinition): number {
  return Math.max(0, entity.totalAssetsUSD) * mandatePctOf(entity.assetAllocationTarget, def.assetClass);
}

/**
 * The share of an exposure this entity has to buy through an index, because it cannot cover the
 * names itself. Coverage is its own assets against the number of names in the tier; below full
 * coverage the shortfall is indexed.
 */
function indexedShare(entity: InstitutionalEntity, nameCount: number): number {
  if (nameCount <= 0) return 0;
  // A fund that picks names does not buy the basket that averages them away.
  // §7.241: the fact lives on the kind's registry row, not in a stage condition.
  if (institutionProfile(entity.entityType).picksOwnNames) return 0;
  const aumBillions = Math.max(0, entity.totalAssetsUSD) / 1e9;
  const namesCovered = NAMES_COVERED_AT_ONE_BILLION_AUM * Math.pow(aumBillions, RESEARCH_COVERAGE_SCALING_EXPONENT);
  return Math.max(0, 1 - Math.min(1, namesCovered / nameCount));
}

/** NAV of a fund: its real basket at this week's cleared marks, plus cash it has not deployed. */
// §7.313 flip: read off the rows — mid-week the persistent store is the book's authority.
function fundNavUSD(v2: import('../../../engine2/world').V2World, fund: InstitutionalEntity): number {
  const H = v2.holdings;
  let holdingsUSD = 0;
  for (let r = bookHeadOf(v2, fund.id); r >= 0; r = H.next[r]) holdingsUSD += H.qtyUSD[r];
  return holdingsUSD + Math.max(0, fund.cashUSD ?? 0);
}

export function runEtfFlowsStage(state: GameState, ctx: WeeklyStepContext): void {
  const indexById = new Map(ctx.updatedMarketIndexes.map((i) => [i.id, i]));
  const defById = new Map(INDEX_DEFINITIONS.map((d) => [d.id, d]));
  const funds = ctx.updatedInstitutionalEntities.filter((e) => e.entityType === 'ETF' && e.etf);
  if (funds.length === 0) return;

  // ---- 1. The sponsor's fee, out of the fund's assets. A real flow between two named books. ----
  const navByFundId = new Map<string, number>();
  funds.forEach((fund) => {
    const navUSD = fundNavUSD(ctx.v2, fund);
    // §4.0 Tier 1 item 6 — a fee is paid FROM CASH THE FUND HAS. Charging the full ratio into a
    // fund whose cash-plus-pending was already spent dug the small persistent overdrafts the
    // harness flags (USAIGX −18M, the IGX/LLX residue); the sponsor of a cash-short fund waits,
    // and next week's ratio is computed fresh off the NAV as before.
    const payableCapUSD = institutionSpendableUSD(ctx, fund);
    const feeUSD = Math.min((navUSD * fund.etf!.expenseRatioAnnual) / 52, payableCapUSD);
    // §7.241: ONE fee, ONE payment. The old form computed the fee twice from two different NAVs
    // — the sponsor's credit off the pre-flow book here, the fund's debit off the post-flow book
    // in the apply pass — so the two sides of one fee disagreed by the week's flow, silently.
    if (feeUSD > 0) {
      pay(ctx, {
        payer: { kind: 'INSTITUTION', id: fund.id },
        payee: { kind: 'INSTITUTION', id: fund.etf!.sponsorEntityId },
        amountUSD: feeUSD,
        reason: 'etf expense ratio to sponsor',
      });
    }
    navByFundId.set(fund.id, Math.max(0, navUSD - feeUSD));
  });

  // ---- 2. What every investor wants to hold in each fund next week. ----
  const investors = ctx.updatedInstitutionalEntities.filter(
    // §7.241: an INCLUSION fact from the registry — the old exclusion list silently opted a new
    // kind IN as an ETF investor, whatever it was.
    (e) => institutionProfile(e.entityType).investsInEtfs && !e.isDefaulted
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
  REGION_IDS.forEach((region) => {
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
      hs.pendingDirectEquitySaleUSD = 0;
    } else {
      // The floor is the SAME buffer the saving decision is taken against — it is the same
      // buffer, so it is the same number (rule 3).
      const bufferFloorUSD = (reg.estimatedHouseholdIncomeUSD / 52) * BUFFER_TARGET_WEEKS;
      const depositHeadroomUSD = Math.max(0, (hs.depositsUSD ?? 0) - bufferFloorUSD);
      // Sell only the part of the gap the cash cannot meet, and never more than is held.
      const heldUSD = householdEtfHoldingsUSD(ctx.v2, hs, ctx.updatedInstitutionalEntities);
      const cashGapUSD = Math.max(0, -weeklySavingUSD - depositHeadroomUSD);
      intoFundsUSD = -Math.min(Math.max(0, heldUSD), cashGapUSD);
      // §7.281 — the ladder's NEXT rung. What neither the deposit buffer nor the fund shares
      // could cover is announced as a direct-equity sale, and next week's 07e session executes
      // it against the households' own residual shares — the position §7.166's row said was
      // not a position ("a holding that cannot be sold is not a holding"). Announce-then-price,
      // the same one-week rhythm every flow in this stage follows.
      hs.pendingDirectEquitySaleUSD = Math.round(Math.max(0, cashGapUSD - Math.max(0, heldUSD)));
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
  REGION_IDS.forEach((r) => {
    const banks = ctx.updatedCompanies.filter((c) => c.region === r && c.bankBalanceSheet);
    const equityUSD = banks.reduce((s, c) => s + (c.bankBalanceSheet?.bankEquityUSD ?? 0), 0);
    // ETF2: the desks' capital over the risk a basket consumes while they hold it — the equity
    // book's own weekly move cap, which is the same number the prime brokers haircut equity by.
    apCapacityByRegion.set(r, apWeeklyCapacityUSD({
      dealerEquityUSD: equityUSD, bookWeeklyMoveCap: MAX_WEEKLY_PRICE_MOVE_PCT,
    }));
  });

  // ---- 4. Creations and redemptions, and the residual the arbitrage could not absorb. ----
  // A region's dealers have ONE balance sheet between them, so the week's baskets compete for it.
  // Allocating the whole regional capacity to every fund independently would let ten funds each
  // spend the same dollar of dealer equity.
  const netFlowByFund = new Map<string, number>();
  const householdExecutedByFund = new Map<string, { spentUSD: number; navPerShare: number }>();
  const holdingsDeltaByInvestor = new Map<string, Map<string, number>>();
  /** ETF2: redeemer id -> fund id -> the value of the basket the fund owes it this week. */
  const inKindRedemptionsByInvestor = new Map<string, Map<string, number>>();

  /** What each investor wants to move in each fund, and the fund's net — computed before any
   *  execution, because the AP capacity split depends on the whole week's demand at once. */
  const flowPlanByFund = new Map<string, {
    navPerShare: number; wantDelta: Map<string, number>; grossCreateUSD: number; grossRedeemUSD: number;
    householdUSD: number;
  }>();
  // One pass over the investors' books instead of a `.find` per investor PER FUND — the same
  // first-match-wins row each per-fund scan used to stop at (per-item scans in per-item loops:
  // the §7.32 anti-pattern, found here by the SCALE profile at ~17 ms/week).
  // §7.313 flip: first-match-wins share counts read off the rows.
  const etfShareRowByInvestor = new Map<string, Map<string, number>>();
  const investorById = new Map(investors.map((i) => [i.id, i]));
  {
    const H = ctx.v2.holdings;
    const etfShareRef0 = internString(ctx.v2, 'ETF_SHARE');
    investors.forEach((inv) => {
      let rows: Map<string, number> | undefined;
      for (let r = bookHeadOf(ctx.v2, inv.id); r >= 0; r = H.next[r]) {
        if (H.typeRef[r] !== etfShareRef0) continue;
        const fundId = ctx.v2.internedStrings[H.instrRef[r]];
        if (!rows) { rows = new Map(); etfShareRowByInvestor.set(inv.id, rows); }
        if (!rows.has(fundId)) {
          const sh = H.shares[r];
          rows.set(fundId, Number.isNaN(sh) ? 0 : sh);
        }
      }
    });
  }

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
    const opening = institutionSpendableUSD(ctx, inv);
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
      const held = etfShareRowByInvestor.get(inv.id)?.get(fund.id);
      if (held !== undefined) heldByInvestor.set(inv.id, held * navPerShare);
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
  REGION_IDS.forEach((region) => {
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
    const fundCashAvailableUSD = institutionSpendableUSD(ctx, fund);
    // ETF2 — AND NOW IT IS IN KIND, which is what makes the cash cap unnecessary rather than
    // merely honest. An institutional redemption hands over the BASKET: the fund delivers the
    // redeemer its pro-rata slice of everything it owns — securities and cash together — and no
    // money has to be found, because a fund that owns something can always deliver a fraction of
    // it. That is why a real ETF cannot have a run in the way an open-ended fund can, and it is
    // the property this mechanism existed to have.
    //
    // The HOUSEHOLD leg stays in cash, because a household cannot take delivery of a basket. Its
    // redemption is the one that still needs the fund to find money, so the cash ration now
    // applies where it is genuinely a constraint instead of to everybody.
    const householdCashFillRatio = householdUSD < 0
      ? Math.min(1, fundCashAvailableUSD / Math.max(1, -householdUSD))
      : 1;
    const executedByInvestor = new Map<string, number>();
    wantDeltaByInvestor.forEach((deltaUSD, id) => {
      // The netted part always clears; only the imbalance is rationed.
      const nettedShare = Math.abs(netUSD) > 0
        ? (deltaUSD > 0 ? Math.min(grossCreateUSD, grossRedeemUSD) / Math.max(1, grossCreateUSD)
                        : Math.min(grossCreateUSD, grossRedeemUSD) / Math.max(1, grossRedeemUSD))
        : 1;
      const imbalanceShare = 1 - nettedShare;
      const executedUSD = deltaUSD * (nettedShare + imbalanceShare * fillRatio);
      if (Math.abs(executedUSD) >= 1) executedByInvestor.set(id, executedUSD);
    });

    // The household leg, rationed at the same fill the institutions get — the AP cannot choose
    // whose basket to carry. Paid for out of the deposits stage 02 credited this week, so the
    // money genuinely leaves the household balance sheet to buy the shares.
    let householdExecutedUSD = householdUSD * fillRatio * householdCashFillRatio;
    // §7.248: a household cannot redeem more than it holds — the register has always trimmed the
    // share leg at the holding (household-balance-sheet); now that the CASH leg is a real
    // payment, the same trim applies to it, or a household would be paid for shares it does not
    // hold. One number for both legs.
    if (householdExecutedUSD < 0) {
      const held = ctx.updatedRegions[fund.region]?.householdState?.etfShares
        ?.find((x) => x.fundId === fund.id);
      const heldUSD = (held?.shares ?? 0) * navPerShare;
      householdExecutedUSD = Math.max(-heldUSD, householdExecutedUSD);
    }
    if (householdExecutedUSD !== 0) {
      // §7.248: a REAL payment now, signed by direction. A purchase pays the fund out of the
      // household's deposits; a redemption pays the household out of the fund's cash. Settlement
      // moves the household deposit and the pending bank leg (T+1 to the banks, the standing
      // convention) and the fund's cash with its home bank's institutional line — so
      // household-balance-sheet no longer debits the deposit view or the pending itself, which
      // was the hand-off's other half. The SHARE register still settles there.
      pay(ctx, householdExecutedUSD > 0
        ? {
          payer: { kind: 'HOUSEHOLD', region: fund.region },
          payee: { kind: 'INSTITUTION', id: fund.id },
          amountUSD: householdExecutedUSD,
          reason: 'etf household flow',
        }
        : {
          payer: { kind: 'INSTITUTION', id: fund.id },
          payee: { kind: 'HOUSEHOLD', region: fund.region },
          amountUSD: -householdExecutedUSD,
          reason: 'etf household flow',
        });
      // §7.248: the register settles shares at the SAME price this cash leg paid — the fund's
      // book is mid-flight when household-balance-sheet reads it (the payment applies at the
      // close), so a re-derived NAV divided by an empty week-one book there.
      householdExecutedByFund.set(fund.id, { spentUSD: householdExecutedUSD, navPerShare });
    }
    executedByInvestor.forEach((executedUSD, id) => {
      if (executedUSD < 0) {
        // IN KIND: the basket goes out, not money. Recorded here and delivered in one pass below,
        // because the fund's own book has to be sliced once for every redeemer at once rather
        // than shrunk under each of them in turn.
        const byFund = inKindRedemptionsByInvestor.get(id) ?? new Map<string, number>();
        byFund.set(fund.id, (byFund.get(fund.id) ?? 0) + -executedUSD);
        inKindRedemptionsByInvestor.set(id, byFund);
      } else {
        // §7.241: a creation is a PAYMENT — this file used to contain no pay() call at all, so
        // no instruction ever reached settlement, no bank saw the deposits move, and 02b's
        // reconcile invented the reserves (the institutional 9.9B slice of the recorded plug).
        pay(ctx, {
          payer: { kind: 'INSTITUTION', id },
          payee: { kind: 'INSTITUTION', id: fund.id },
          amountUSD: executedUSD,
          reason: 'etf shares created',
        });
      }
      const shares = executedUSD / navPerShare;
      const byFund = holdingsDeltaByInvestor.get(id) ?? new Map<string, number>();
      byFund.set(fund.id, (byFund.get(fund.id) ?? 0) + shares);
      holdingsDeltaByInvestor.set(id, byFund);
    });

    // Shares are cancelled whether the redemption paid cash or a basket, so the register moves on
    // the whole executed flow — not just the part that moved money.
    let executedNetUSD = householdExecutedUSD;
    executedByInvestor.forEach((usd) => { executedNetUSD += usd; });
    const createdShares = executedNetUSD / navPerShare;
    const unabsorbedUSD = Math.abs(netUSD) - absorbedUSD;
    fund.etf = {
      ...fund.etf!,
      sharesOutstanding: Math.max(0, sharesOutstanding + createdShares),
      // The share of THIS WEEK'S FLOW the arbitrage could not carry — bounded in [-1, 1] because
      // it is a fraction of the flow, not of the fund.
      unmetFlowShare: Math.abs(netUSD) > 0 ? (Math.sign(netUSD) * unabsorbedUSD) / Math.abs(netUSD) : 0,
    };
  });

  // ---- 4b. DELIVER THE BASKETS. Every fund's book is sliced ONCE, for all of its redeemers at
  // the same time: a fund that owes 10% of itself to one redeemer and 5% to another hands over
  // 15% of every line, and each redeemer's slice is a real position it now holds. Nothing is
  // created and nothing is sold — this is the transfer that makes an in-kind redemption need no
  // cash, and it is why an ETF cannot be run on the way an open-ended fund can. ----
  const inKindOwedByFund = new Map<string, number>();
  inKindRedemptionsByInvestor.forEach((byFund) => {
    byFund.forEach((usd, fundId) => inKindOwedByFund.set(fundId, (inKindOwedByFund.get(fundId) ?? 0) + usd));
  });
  if (inKindOwedByFund.size > 0) {
    const entityById = new Map(ctx.updatedInstitutionalEntities.map((e) => [e.id, e]));
    const deliveredRowsByInvestor = new Map<string, ItemizedHolding[]>();
    const fundAssetsUSD = new Map<string, number>();
    // §7.262 — the cash the slice loop has NOT yet promised. The payments below settle at the
    // close, so `fund.cashUSD` never falls between redeemers — while `share` renormalizes
    // against the SHRUNKEN total. Two 40%-of-the-fund redeemers therefore took 0.4 + 0.667 of
    // the SAME opening cash (the holdings legs shrink in place and were right; only the cash
    // slice double-promised), and the fund settled overdrawn by the excess — the steady
    // 0.13–0.19B weekly overdraft on exactly the funds whose redemptions are chronic (the
    // small-cap ETFs, 34x at reference). One local balance, decremented as it is promised.
    const remainingCashByFund = new Map<string, number>();
    inKindOwedByFund.forEach((_owed, fundId) => {
      const fund = entityById.get(fundId);
      if (!fund) return;
      // §7.307 holdings flip: row walk on the mirror.
      let holdingsUSD = 0;
      { const H = ctx.v2.holdings; for (let r = bookHeadOf(ctx.v2, fundId); r >= 0; r = H.next[r]) holdingsUSD += H.qtyUSD[r]; }
      fundAssetsUSD.set(fundId, holdingsUSD + institutionSpendableUSD(ctx, fund, false));
      remainingCashByFund.set(fundId, institutionSpendableUSD(ctx, fund, false));
    });
    inKindRedemptionsByInvestor.forEach((byFund, investorId) => {
      byFund.forEach((owedUSD, fundId) => {
        const fund = entityById.get(fundId);
        const totalUSD = fundAssetsUSD.get(fundId) ?? 0;
        if (!fund || !(totalUSD > 0) || !(owedUSD > 0)) return;
        // A redeemer cannot take more of the fund than there is; a fund whose whole book is owed
        // out is a fund being wound up, which is a real outcome rather than a failure to settle.
        const share = Math.min(1, owedUSD / totalUSD);
        const rows = deliveredRowsByInvestor.get(investorId) ?? [];
        // §7.313 flip: the basket slice reads the fund's rows; the clones append to the
        // investor's chain below.
        {
          const H = ctx.v2.holdings;
          for (let r = bookHeadOf(ctx.v2, fundId); r >= 0; r = H.next[r]) {
            const qty = H.qtyUSD[r] * share;
            if (!(Math.abs(qty) > 0.0001)) continue;
            const sh = H.shares[r];
            const out: ItemizedHolding = {
              instrumentId: ctx.v2.internedStrings[H.instrRef[r]],
              instrumentType: ctx.v2.internedStrings[H.typeRef[r]] as ItemizedHolding['instrumentType'],
              issuerRegion: ctx.v2.internedStrings[H.regionRef[r]] as ItemizedHolding['issuerRegion'],
              quantityOrNotionalUSD: qty,
            };
            if (!Number.isNaN(sh)) out.quantityShares = sh * share;
            rows.push(out);
          }
        }
        deliveredRowsByInvestor.set(investorId, rows);
        // The cash slice of the basket travels with it: a pro-rata claim is on everything the
        // fund owns, and leaving the cash behind would hand the last redeemer a fund of pure
        // cash. Sliced from the REMAINING balance (§7.262) — the same base the renormalized
        // `share` divides — never from the live field the settlement has not yet debited.
        const remainingCashUSD = remainingCashByFund.get(fundId) ?? 0;
        const cashSliceUSD = remainingCashUSD * share;
        remainingCashByFund.set(fundId, remainingCashUSD - cashSliceUSD);
        if (cashSliceUSD > 0) {
          pay(ctx, {
            payer: { kind: 'INSTITUTION', id: fundId },
            payee: { kind: 'INSTITUTION', id: investorId },
            amountUSD: cashSliceUSD,
            reason: 'etf in-kind redemption: cash slice',
          });
        }
        // And the fund's own book shrinks by exactly what left it — in place, on the rows.
        {
          const H = ctx.v2.holdings;
          for (let r = bookHeadOf(ctx.v2, fundId); r >= 0; r = H.next[r]) {
            const sh = H.shares[r];
            if (!Number.isNaN(sh)) H.shares[r] = sh * (1 - share);
            H.qtyUSD[r] = H.qtyUSD[r] * (1 - share);
          }
          markBookDirty(ctx.v2, fundId);
        }
        fundAssetsUSD.set(fundId, totalUSD * (1 - share));
      });
    });
    deliveredRowsByInvestor.forEach((rows, investorId) => {
      const investor = entityById.get(investorId);
      if (!investor || rows.length === 0) return;
      for (const h of rows) pushBookRow(ctx.v2, investor.id, h);
      bumpRegister(ctx);
    });
  }

  // ---- 4c. THE SHARE BOOK — the row's actual title, and the thing `unmetFlowShare` was standing
  // in for. Until now a fund's shares were carried at net asset value and the arbitrage residual
  // was reported as a fraction of unmet flow, deliberately NOT called a premium, because a premium
  // is a price and that was not one. Now the shares clear:
  //
  //   THE FLOAT is what this fund's investors hold between them — the same OWN7 rule every other
  //   book uses: the float is what the participants in THIS book hold, plus the primary offering.
  //   THE PRIMARY OFFERING is what the APs will create this week, and no AP creates below net
  //   asset value, because creating at a discount is selling a dollar for less than a dollar.
  //   That withdraw level is what holds the top of a discount — a participant's price, not a
  //   bracket around someone else's (rule 15).
  //   THE PARTICIPANTS are the investors, and their reservation is the point at which they would
  //   rather go and assemble the index themselves: net asset value plus what the constituent
  //   books charge to buy every name in it. That is what bounds a premium by something real.
  //
  // So a week the APs can absorb prints at net asset value and a week they cannot prints a
  // premium — which is what an ETF's premium IS, rather than a number derived from one.
  const shareBookSpreadBps = DESK_SPREAD_BPS_BY_BOOK['equity'];
  const assemblyCostRate = basketAssemblyCostRate(shareBookSpreadBps);
  // SCALE: the ETF_SHARE rows of the whole register, once. Each fund below asked every entity for
  // its holding of THAT fund by reducing over the entity's entire book — 27 funds x 75 entities x
  // ~1,600 rows is 3.2M row visits a week to read a few thousand positions. One pass, indexed by
  // fund, gives every fund its own holders directly.
  // §7.307 holdings flip: row walk — a non-ETF row costs one int compare.
  const etfSharesByFundByInvestor = new Map<string, Map<string, number>>();
  {
    const H = ctx.v2.holdings;
    const etfShareRef = internString(ctx.v2, 'ETF_SHARE');
    ctx.updatedInstitutionalEntities.forEach((e) => {
      for (let r = bookHeadOf(ctx.v2, e.id); r >= 0; r = H.next[r]) {
        if (H.typeRef[r] !== etfShareRef) continue;
        const fundId = ctx.v2.internedStrings[H.instrRef[r]];
        let byInvestor = etfSharesByFundByInvestor.get(fundId);
        if (!byInvestor) { byInvestor = new Map(); etfSharesByFundByInvestor.set(fundId, byInvestor); }
        const sh = H.shares[r];
        byInvestor.set(e.id, (byInvestor.get(e.id) ?? 0) + (Number.isNaN(sh) ? 0 : sh));
      }
    });
  }

  funds.forEach((fund) => {
    const plan = flowPlanByFund.get(fund.id);
    if (!plan) return;
    const navPerShare = plan.navPerShare;
    if (!(navPerShare > 0)) return;
    const instrumentId = `ETFSHARE-${fund.id}`;

    // What the investors hold between them, and what each of them wants to hold.
    const heldSharesByInvestor = new Map<string, number>();
    const heldOfThisFund = etfSharesByFundByInvestor.get(fund.id);
    ctx.updatedInstitutionalEntities.forEach((e) => {
      if (e.id === fund.id) return;
      const held = heldOfThisFund?.get(e.id) ?? 0;
      const delta = holdingsDeltaByInvestor.get(e.id)?.get(fund.id) ?? 0;
      const shares = held + delta;
      if (shares > 1e-6) heldSharesByInvestor.set(e.id, shares);
    });
    const floatShares = Array.from(heldSharesByInvestor.values()).reduce((a, v) => a + v, 0);
    const apCreationShares = Math.max(0, (capacityByFund.get(fund.id) ?? 0) / navPerShare);
    if (!(floatShares > 0) && !(apCreationShares > 0)) return;

    const instrument: ClearingInstrument = {
      id: instrumentId,
      outstandingUSD: fund.etf!.sharesOutstanding,
      tradableFloatUSD: floatShares,
      currentStat: fund.etf!.marketPricePerShare && fund.etf!.marketPricePerShare > 0
        ? fund.etf!.marketPricePerShare : navPerShare,
      statKind: 'PRICE_LIKE',
      durationYears: 0,
      primaryOfferingUSD: apCreationShares,
      // An AP does not create shares to sell below what the basket behind them is worth.
      primaryWithdrawStat: navPerShare,
    };

    const participants: ClearingParticipant[] = [];
    heldSharesByInvestor.forEach((shares, investorId) => {
      const wantUSD = plan.wantDelta.get(investorId) ?? 0;
      const targetShares = Math.max(shares, shares + wantUSD / navPerShare);
      participants.push({
        id: investorId,
        currentHoldingsByInstrumentId: new Map([[instrumentId, shares]]),
        demandByInstrumentId: new Map<string, ParticipantDemand>([[instrumentId, {
          // Indifferent between owning the fund here and assembling the index itself.
          reservationStat: navPerShare * (1 + assemblyCostRate),
          maxHoldingUSD: targetShares,
          fullSizeStatRange: Math.max(0.01, navPerShare * assemblyCostRate),
        }]]),
      });
    });
    if (participants.length === 0) return;

    const result = clearFinancialAsset([instrument], participants, new Map(), {
      // The AP's own spread is its capacity constraint, already priced above; the book itself has
      // no separate dealer standing in it.
      dealerSpreadBps: 0,
      // Undamped: a fund's shares can only move as far as the basket behind them plus the
      // assembly cost, which is a real bound and does not need a second one.
      maxWeeklyStatMovePct: Number.NaN,
    });
    const clearedPrice = result.newStatById.get(instrumentId);
    if (clearedPrice === undefined || !(clearedPrice > 0)) return;
    fund.etf = {
      ...fund.etf!,
      marketPricePerShare: Number(clearedPrice.toFixed(4)),
      // THE PREMIUM. A price against the assets behind it, which is what a premium is.
      premiumToNavBps: Number((((clearedPrice / navPerShare) - 1) * 10000).toFixed(1)),
    };
  });

  // ---- 5. Apply every cash and share movement in one pass, then re-mark every ETF claim. ----
  // A holder's shares are a claim on the fund's assets, so they have to be carried at the fund's
  // CURRENT net asset value per share — not at whatever NAV happened to prevail when the holder
  // last traded. Marking only the holdings that moved left the claims drifting away from the
  // assets backing them (measured: 13.49B of fund assets against 13.38B of claims after thirty
  // weeks), which is the same class of error as any stale mark.
  const finalNavPerShareByFund = new Map<string, number>();
  // §7.313 flip: the deltas land on the rows — first matching row mutates in place, a spent
  // position's row is dropped by one relink, a new position appends at the tail (where the old
  // array push put it).
  {
    const H = ctx.v2.holdings;
    const etfShareRefD = internString(ctx.v2, 'ETF_SHARE');
    ctx.updatedInstitutionalEntities.forEach((entity) => {
      const shareDeltas = holdingsDeltaByInvestor.get(entity.id);
      if (!shareDeltas) return;
      const removed = new Set<number>();
      shareDeltas.forEach((shares, fundId) => {
        const fund = funds.find((f) => f.id === fundId)!;
        const navPerShare = (navByFundId.get(fundId) ?? 0) > 0 && fund.etf!.sharesOutstanding > 0
          ? (navByFundId.get(fundId) ?? 0) / fund.etf!.sharesOutstanding
          : ETF_INCEPTION_NAV_PER_SHARE;
        const iRef = ctx.v2.internedIdByString.get(fundId);
        let found = -1;
        if (iRef !== undefined) {
          for (let r = bookHeadOf(ctx.v2, entity.id); r >= 0; r = H.next[r]) {
            if (removed.has(r)) continue;
            if (H.typeRef[r] === etfShareRefD && H.instrRef[r] === iRef) { found = r; break; }
          }
        }
        if (found >= 0) {
          const sh = H.shares[found];
          const held = (Number.isNaN(sh) ? 0 : sh) + shares;
          if (held <= 1e-6) removed.add(found);
          else { H.shares[found] = held; H.qtyUSD[found] = held * navPerShare; markBookDirty(ctx.v2, entity.id); }
        } else if (shares > 1e-6) {
          pushBookRow(ctx.v2, entity.id, {
            instrumentId: fundId,
            instrumentType: 'ETF_SHARE',
            issuerRegion: fund.region,
            quantityShares: shares,
            quantityOrNotionalUSD: shares * navPerShare,
          } as ItemizedHolding);
        }
      });
      if (removed.size > 0) {
        const kept: number[] = [];
        for (let r = bookHeadOf(ctx.v2, entity.id); r >= 0; r = H.next[r]) {
          if (!removed.has(r)) kept.push(r);
        }
        relinkBook(ctx.v2, entity.id, kept);
      }
    });
  }

  // Every fund's final price per share, after this week's creations, fees and cash movements.
  // ETF2: what a holder's shares are WORTH is what they trade at, which is the share book's own
  // cleared price — not the net asset value behind them. The two differ by the premium, and the
  // premium is a transfer between holders (a buyer paid a seller for it), not wealth anybody
  // created; a fund whose book has not cleared yet still marks at net asset value, because that
  // is the only number about it that exists.
  ctx.updatedInstitutionalEntities.forEach((e) => {
    if (e.entityType !== 'ETF' || !e.etf) return;
    const shares = e.etf.sharesOutstanding;
    const navPerShare = shares > 0 ? fundNavUSD(ctx.v2, e) / shares : ETF_INCEPTION_NAV_PER_SHARE;
    const marketPrice = e.etf.marketPricePerShare;
    finalNavPerShareByFund.set(e.id, marketPrice && marketPrice > 0 ? marketPrice : navPerShare);
  });
  // §7.313 flip: the re-mark writes the rows in place — an ETF claim row costs one int compare
  // and, when its fund priced, two column writes.
  {
    const H = ctx.v2.holdings;
    const etfShareRefM = internString(ctx.v2, 'ETF_SHARE');
    ctx.updatedInstitutionalEntities.forEach((entity) => {
      let touched = false;
      for (let r = bookHeadOf(ctx.v2, entity.id); r >= 0; r = H.next[r]) {
        if (H.typeRef[r] !== etfShareRefM) continue;
        const navPerShare = finalNavPerShareByFund.get(ctx.v2.internedStrings[H.instrRef[r]]);
        if (navPerShare === undefined) continue;
        const sh = H.shares[r];
        H.qtyUSD[r] = (Number.isNaN(sh) ? 0 : sh) * navPerShare;
        touched = true;
      }
      if (touched) markBookDirty(ctx.v2, entity.id);
    });
  }

  // The household creation leg is handed to `household-balance-sheet.ts`, which owns the
  // household books. This stage owns the FLOW — who wanted what, and what the dealers could carry.
  ctx.householdEtfPurchasesUSD = householdExecutedByFund;
}