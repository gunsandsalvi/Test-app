/**
 * HH1 — the household balance sheet, and the claims that link it to the institutions.
 *
 * Runs after the clearing books, the indexes and the ETF flows, because every line here is marked
 * from a price something else cleared. It owns one question: what do households actually own, and
 * against whom?
 *
 * The answer used to be a single number that appreciated by a formula return. MS1 replaced most of
 * it with real claims; this stage adds the largest missing one and it was never missing from the
 * world at all — it was sitting on the institutions' own balance sheets with no holder.
 *
 * **The claim.** An insurer's assets are 495B against 40B of its own equity capital. The other
 * 455B is policyholder reserves. A pension fund's 146B against 17B is entitlements. An asset
 * manager's 188B against 31B is fund shares. Measured together, **740B was a liability to somebody
 * and nobody held the claim** (§7.48) — the same real thing represented once instead of twice, and
 * 46% of the gap MS1 had to label unmodeled.
 *
 * It is DERIVED, never stated: the claim is the residual `totalAssets − equityCapital` on a real
 * balance sheet, re-marked every week. So when an insurer's bond book falls, household wealth
 * falls with it — the transmission that could not exist while these claims belonged to no one. And
 * the institution's own equity capital is excluded because that half is already attributed: these
 * are listed companies whose shares clear in 07e and sit in somebody's register.
 *
 * Entity types whose liabilities already have named holders are left alone — money funds (WS7's
 * shareholders), ETFs (MS1's), and private equity (HC4's named LP commitments) — or the same
 * dollar would be claimed twice.
 */

import { GameState, RegionId, InstitutionalEntity } from '../../../types';
import { WeeklyStepContext } from './context';
import { ETF_INCEPTION_NAV_PER_SHARE } from '../../../domain/etf';
import { AVERAGE_HOUSEHOLD_SIZE, WealthTier } from '../../../domain/region-macro';
import { TIER_BALANCE_SHEET_WEIGHTS, WEALTH_TIERS } from '../../macro/household-cohorts';
import {
  householdDirectEquityUSD, householdEtfHoldingsUSD, householdPrivateBusinessEquityUSD,
} from '../../macro/household-portfolio';
import { publicComparableEvMultiple } from './pe-lifecycle';

/**
 * The institution types whose beneficiaries are households. Everything else in the sector either
 * has a named holder already or is somebody's equity rather than somebody's claim.
 */
const BENEFICIARY_TYPES: InstitutionalEntity['entityType'][] = [
  'INSURER', 'PENSION_FUND', 'ASSET_MANAGER', 'HEDGE_FUND',
];

export function runHouseholdBalanceSheetStage(state: GameState, ctx: WeeklyStepContext): void {
  // ---- 0. HH: what households MEASURABLY earned this week. Household income is the sum of what
  // they were paid — every employer's wages, the government's transfers, the interest the banks
  // really paid on their deposits — less the tax they really remitted. Recorded here for stage
  // 02 to read next week; a spend is not income, so purchases are excluded by name. ----
  const householdFlows = ctx.lastSettlementReport?.householdFlowsByRegion;
  if (householdFlows) {
    (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((regionId) => {
      const reg = ctx.updatedRegions[regionId];
      if (!reg) return;
      let receiptsUSD = reg.householdDepositInterestWeeklyUSD ?? 0;
      let taxPaidUSD = 0;
      householdFlows.get(regionId)?.forEach((amountUSD, reason) => {
        if (amountUSD > 0) { receiptsUSD += amountUSD; return; }
        if (reason.includes('tax')) taxPaidUSD += -amountUSD;
      });
      reg.lastWeekHouseholdReceiptsUSD = Number(receiptsUSD.toFixed(0));
      reg.lastWeekHouseholdTaxPaidUSD = Number(taxPaidUSD.toFixed(0));
    });
  }

  // ---- 1. Each institution records what it owes its beneficiaries. ----
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((entity) => {
    if (!BENEFICIARY_TYPES.includes(entity.entityType)) {
      return entity.beneficiaryLiabilityUSD === undefined ? entity : { ...entity, beneficiaryLiabilityUSD: undefined };
    }
    const liabilityUSD = Math.max(0, entity.totalAssetsUSD - Math.max(0, entity.equityCapitalUSD));
    return { ...entity, beneficiaryLiabilityUSD: liabilityUSD };
  });

  const fundNavPerShare = (fund: InstitutionalEntity): number => {
    const shares = fund.etf?.sharesOutstanding ?? 0;
    if (!(shares > 0)) return ETF_INCEPTION_NAV_PER_SHARE;
    const navUSD = fund.itemizedHoldings.reduce((a, h) => a + (h.quantityOrNotionalUSD ?? 0), 0)
      + Math.max(0, fund.cashUSD ?? 0);
    return navUSD / shares;
  };

  (['USA', 'EUR', 'UK', 'JPN'] as RegionId[]).forEach((region) => {
    const reg = ctx.updatedRegions[region];
    const hs = reg?.householdState;
    if (!hs) return;

    // ---- 2. Index-fund shares bought this week settle onto the household register. ----
    const etfShares = [...(hs.etfShares ?? [])];
    let boughtUSD = 0;
    ctx.updatedInstitutionalEntities.forEach((fund) => {
      if (fund.entityType !== 'ETF' || fund.region !== region) return;
      const spentUSD = ctx.householdEtfPurchasesUSD.get(fund.id) ?? 0;
      if (!(spentUSD > 0)) return;
      boughtUSD += spentUSD;
      const shares = spentUSD / fundNavPerShare(fund);
      const idx = etfShares.findIndex((x) => x.fundId === fund.id);
      if (idx >= 0) etfShares[idx] = { ...etfShares[idx], shares: etfShares[idx].shares + shares };
      else etfShares.push({ fundId: fund.id, shares });
    });

    // ---- 3. The claims on institutions, marked against the balance sheets that owe them. ----
    const institutionalClaims = ctx.updatedInstitutionalEntities
      .filter((e) => e.region === region && !e.isDefaulted && (e.beneficiaryLiabilityUSD ?? 0) > 0)
      .map((e) => ({ entityId: e.id, valueUSD: e.beneficiaryLiabilityUSD! }));
    const institutionalClaimsUSD = institutionalClaims.reduce((a, c) => a + c.valueUSD, 0);

    // ---- 4. The rest of the real book, marked from this week's clears. ----
    const evMultiple = publicComparableEvMultiple(region, ctx.updatedCompanies);
    const etfHoldingsUSD = householdEtfHoldingsUSD({ etfShares }, ctx.updatedInstitutionalEntities);
    const directEquityUSD = householdDirectEquityUSD(
      region, ctx.updatedCompanies, ctx.updatedInstitutionalEntities
    );
    const privateBusinessEquityUSD = householdPrivateBusinessEquityUSD(region, ctx.updatedCompanies, evMultiple);

    // ---- 5. The placeholder is paid DOWN by whatever the model has learned to see. ----
    // Never up: households did not get richer because a claim finally acquired a holder. It is set
    // once, at the opening gap, and thereafter only shrinks — which is how a placeholder behaves,
    // and what makes it this project's own scoreboard.
    const realClaimsUSD = etfHoldingsUSD + directEquityUSD + privateBusinessEquityUSD + institutionalClaimsUSD;
    const openingUnmodeledUSD = hs.unmodeledFinancialAssetsUSD ?? hs.equityHoldingsUSD ?? 0;
    const unmodeledFinancialAssetsUSD = Math.max(0, Math.min(
      openingUnmodeledUSD,
      Math.max(0, (hs.equityHoldingsUSD ?? 0) - realClaimsUSD)
    ));

    // ---- 6. HH2: the house. Households carried the mortgage and not the asset it secures. ----
    // Built from physical units — owning households at this week's median price — rather than
    // backed out of the debt, so a move in home prices moves household wealth. Backing it out of
    // the mortgage would have pinned the stock to the borrowing and left prices with no channel,
    // which is the transmission the omission was suppressing in the first place.
    const housingMarket = reg.housingMarket;
    const owningHouseholds = housingMarket
      ? (Math.max(0, reg.totalPopulation) / AVERAGE_HOUSEHOLD_SIZE) * Math.max(0, housingMarket.ownershipRatePct)
      : 0;
    const housingStockUSD = owningHouseholds * Math.max(0, housingMarket?.medianHomePriceUSD ?? 0);
    const mortgageUSD = hs.mortgageDebtUSD ?? 0;
    const homeEquityUSD = housingStockUSD - mortgageUSD;

    // Cash left the household balance sheet to buy the fund shares. HH4d: the banks have not
    // seen that money move yet — it settles against their deposit books next week (T+1), so
    // the in-flight amount is recorded for the bank pass and the household view nets it now.
    const depositsUSD = Math.max(0, (hs.depositsUSD ?? 0) - boughtUSD);
    const mmfSharesUSD = Math.max(0, hs.mmfSharesUSD ?? 0);
    const equityHoldingsUSD = realClaimsUSD + unmodeledFinancialAssetsUSD;

    // ---- 7. HH4c: the tier balance sheets are DERIVED SPLITS of the same marked components —
    // tier net worth is a sum over real lines, not a drifted stock. The split weights are
    // stated primitives (SCF-shaped); what they split is real, so when home prices move it is
    // the middle tiers' net worth that moves, and when equities rally it is the top's — the
    // difference the tier wealth-effect MPCs exist to price.
    if (reg.wealthDistribution) {
      const W = TIER_BALANCE_SHEET_WEIGHTS;
      const consumerDebtUSD = (hs.creditCardDebtUSD ?? 0) + (hs.otherConsumerLoanDebtUSD ?? 0);

      // DIST/COH — THE DEPOSIT SPLIT IS AN OUTCOME OF WHO SAVED, not a stated weight.
      //
      // §5-COH's own sentence is "who holds deposits is whose savings accumulated", and it was
      // not true: `W.deposits` applied a fixed share of the aggregate every week, so a tier that
      // saved more never got richer and the wealth distribution could not respond to the one
      // thing that produces it (rule 13). Each tier now carries the stock its own saving built,
      // and the split is that stock's share of the total.
      //
      // The stated weights remain the OPENING CONDITION only, used until the accumulation has
      // anything in it (§7.4: a seed may state what the mechanism will then own). This is the
      // largest of the nine tables §6.3-A records, and the first of them to become a measurement.
      const accumulatedByTier = WEALTH_TIERS.map((t: WealthTier) =>
        Math.max(0, reg.wealthDistribution?.[t]?.accumulatedSavingsUSD ?? 0));
      const accumulatedTotal = accumulatedByTier.reduce((a, b) => a + b, 0);
      const depositShareOf = (t: WealthTier, i: number) =>
        accumulatedTotal > 0 ? accumulatedByTier[i] / accumulatedTotal : W.deposits[t];

      // DIST/COH — AND THE OTHER FINANCIAL SPLITS FALL OUT OF THE SAME TWO MEASUREMENTS.
      //
      // A tier's holding of an asset class is the stock its own saving built, allocated by its own
      // appetite for risk — and the model measures both: `accumulatedSavingsUSD` (§7.144) and
      // `equityExposureShare`, which HH already derives per tier. So four more of §6.3-A's stated
      // tables become one derivation:
      //
      //   equity-like and private business — RISKY OWNERSHIP, weighted by risk appetite;
      //   institutional claims            — the long, non-equity half of the same saving
      //                                     (a pension entitlement is what a cautious saver holds);
      //   unmodeled                       — the residual placeholder, split by the same stock
      //                                     rather than by a table, since nothing better is known
      //                                     about it and a stated split of an unknown is the
      //                                     worst of both.
      //
      // Equity-like and private business share a driver deliberately: both are appetite for risky
      // illiquid ownership, and the model measures ONE such appetite. Two tables with one cause is
      // one derivation, not two (rule 3).
      const riskyByTier = WEALTH_TIERS.map((t: WealthTier, i: number) =>
        accumulatedByTier[i] * Math.max(0, reg.wealthDistribution?.[t]?.equityExposureShare ?? 0));
      const cautiousByTier = WEALTH_TIERS.map((t: WealthTier, i: number) =>
        accumulatedByTier[i] * Math.max(0, 1 - Math.max(0, reg.wealthDistribution?.[t]?.equityExposureShare ?? 0)));
      const riskyTotal = riskyByTier.reduce((a, b) => a + b, 0);
      const cautiousTotal = cautiousByTier.reduce((a, b) => a + b, 0);
      const riskyShareOf = (t: WealthTier, i: number, fallback: number) =>
        riskyTotal > 0 ? riskyByTier[i] / riskyTotal : fallback;
      const cautiousShareOf = (t: WealthTier, i: number, fallback: number) =>
        cautiousTotal > 0 ? cautiousByTier[i] / cautiousTotal : fallback;

      // DIST/COH — HOUSING AND DEBT FOLLOW DIFFERENT MEASUREMENTS AGAIN, and that is the point:
      // each of §6.3-A's tables was a separate stated number precisely because nobody had asked
      // what CAUSED it.
      //
      //   HOUSING and MORTGAGE follow BORROWING CAPACITY, not wealth. A house is bought with a
      //   mortgage, and what a lender will advance is a multiple of INCOME — so housing
      //   concentrates in the tiers that have income rather than the tiers that have assets. That
      //   is why the middle of the distribution is house-rich and cash-poor (§7.142's
      //   wealthy-hand-to-mouth result), and it falls straight out of using income here.
      //
      //   CONSUMER DEBT follows WHO DOES NOT COVER THEIR SPENDING. A tier saving a third of its
      //   income does not run a card balance; one saving a hundredth does. `savingsRate` is
      //   measured per tier from the cohorts' own budgets, so the split is `(1 − savings rate) x
      //   income` — the propensity to borrow times the base it is borrowed against.
      const incomeByTier = WEALTH_TIERS.map((t: WealthTier) =>
        Math.max(0, reg.wealthDistribution?.[t]?.shareOfIncomeUSD ?? 0));
      const incomeTotal = incomeByTier.reduce((a, b) => a + b, 0);
      const incomeShareOf = (t: WealthTier, i: number, fallback: number) =>
        incomeTotal > 0 ? incomeByTier[i] / incomeTotal : fallback;
      const borrowByTier = WEALTH_TIERS.map((t: WealthTier, i: number) =>
        incomeByTier[i] * Math.max(0, 1 - Math.max(0, Math.min(1, reg.wealthDistribution?.[t]?.savingsRate ?? 0))));
      const borrowTotal = borrowByTier.reduce((a, b) => a + b, 0);
      const borrowShareOf = (t: WealthTier, i: number, fallback: number) =>
        borrowTotal > 0 ? borrowByTier[i] / borrowTotal : fallback;

      WEALTH_TIERS.forEach((t: WealthTier, i: number) => {
        const tierAssetsUSD =
          (depositsUSD + mmfSharesUSD) * depositShareOf(t, i)
          + (etfHoldingsUSD + directEquityUSD) * riskyShareOf(t, i, W.equityLike[t])
          + privateBusinessEquityUSD * riskyShareOf(t, i, W.privateBusiness[t])
          + institutionalClaimsUSD * cautiousShareOf(t, i, W.institutionalClaims[t])
          + unmodeledFinancialAssetsUSD * depositShareOf(t, i)
          + housingStockUSD * incomeShareOf(t, i, W.housing[t]);
        const tierDebtUSD = mortgageUSD * incomeShareOf(t, i, W.mortgage[t])
          + consumerDebtUSD * borrowShareOf(t, i, W.consumerDebt[t]);
        const prev = reg.wealthDistribution[t];
        reg.wealthDistribution[t] = {
          ...prev,
          priorNetWorthUSD: prev.shareOfNetWorthUSD,
          shareOfNetWorthUSD: Number((tierAssetsUSD - tierDebtUSD).toFixed(0)),
          homeEquityUSD: Number((housingStockUSD * incomeShareOf(t, i, W.housing[t])
            - mortgageUSD * incomeShareOf(t, i, W.mortgage[t])).toFixed(0)),
        };
      });
    }

    reg.householdState = {
      ...hs,
      // Last week's marked net worth, so next week's wealth effect can read a CHANGE.
      priorNetWorthUSD: hs.netWorthUSD ?? 0,
      housingStockUSD,
      homeEquityUSD,
      depositsUSD,
      mmfSharesUSD,
      pendingBankSettlementUSD: Number(((hs.pendingBankSettlementUSD ?? 0) - boughtUSD).toFixed(0)),
      etfShares,
      etfHoldingsUSD,
      directEquityUSD,
      privateBusinessEquityUSD,
      institutionalClaims,
      institutionalClaimsUSD,
      unmodeledFinancialAssetsUSD,
      equityHoldingsUSD,
      // The house is an ASSET at full value and the mortgage a liability, as in any set of
      // national accounts. Omitting the asset while carrying the debt understated net worth by
      // the entire housing stock.
      netWorthUSD: depositsUSD + mmfSharesUSD + equityHoldingsUSD + housingStockUSD
        - (mortgageUSD + (hs.creditCardDebtUSD ?? 0) + (hs.otherConsumerLoanDebtUSD ?? 0)),
    };
  });
}
