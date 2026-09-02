import { entityCashOf, householdDepositsOf } from '../../ledger/accounts';
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
import { institutionProfile } from '../../../domain/institution-profiles';
import { WeeklyStepContext } from './context';
import { ETF_INCEPTION_NAV_PER_SHARE } from '../../../domain/etf';
import { bookHeadOf } from '../../../engine2/holdings';
import { AVERAGE_HOUSEHOLD_SIZE, WealthTier } from '../../../domain/region-macro';
import { WEALTH_TIERS } from '../../macro/household-cohorts';
import {
  householdDirectEquityUSD, householdEtfHoldingsUSD, householdPrivateBusinessEquityUSD,
} from '../../macro/household-portfolio';
import { publicComparableEvMultiple } from './pe-lifecycle';
import { REGION_IDS } from '../../../domain/geography';
import { institutionTotalAssetsUSD } from './institutional-balance-sheet';

// Whose beneficiaries are households is the kind registry's `beneficiariesAreHouseholds` row
// (domain/institution-profiles.ts) — a new kind states it or fails to build.

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
      let dividendsUSD = 0;
      householdFlows.get(regionId)?.forEach((amountUSD, reason) => {
        if (amountUSD > 0) { receiptsUSD += amountUSD; if (reason === 'dividend to the public float') dividendsUSD += amountUSD; return; }
        if (reason.includes('tax')) taxPaidUSD += -amountUSD;
      });
      reg.lastWeekHouseholdReceiptsUSD = Math.round(receiptsUSD);
      reg.lastWeekHouseholdTaxPaidUSD = Math.round(taxPaidUSD);
      // §5-CLOSE C5: the dividends the public float was paid — a slice of the receipts above,
      // split out so the cohorts can put it where the equity exposure is.
      reg.lastWeekHouseholdDividendsUSD = Math.round(dividendsUSD);
    });
  }

  // ---- 1. Each institution records what it owes its beneficiaries. ----
  ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((entity) => {
    if (!institutionProfile(entity.entityType).beneficiariesAreHouseholds) {
      return entity.beneficiaryLiabilityUSD === undefined ? entity : { ...entity, beneficiaryLiabilityUSD: undefined };
    }
    // COH2 — REVERSED. This was `totalAssets − equityCapital`: the obligation derived from the
    // holdings, with equity pinned at its seed ratio and never updated, so a fund was as big as
    // its assets and households' claims were the residual that made the arithmetic work.
    // **In reality a pension fund is as big as the entitlements it owes**, and the entitlement is
    // now a real stock accumulated from contributions, benefits and investment return
    // (`insurance-and-pensions.ts`). What is a RESIDUAL is the fund's own capital — its surplus or
    // deficit against what it owes, which is the number that actually means something, and the
    // one that retires `INSTITUTIONAL_OPENING_BOOK_SHARE`.
    const liabilityUSD = Math.max(0, entity.beneficiaryLiabilityUSD
      ?? (institutionTotalAssetsUSD(ctx, entity) - Math.max(0, entity.equityCapitalUSD)));
    return {
      ...entity,
      beneficiaryLiabilityUSD: liabilityUSD,
      equityCapitalUSD: institutionTotalAssetsUSD(ctx, entity) - liabilityUSD,
    };
  });

  const fundNavPerShare = (fund: InstitutionalEntity): number => {
    const shares = fund.etf?.sharesOutstanding ?? 0;
    if (!(shares > 0)) return ETF_INCEPTION_NAV_PER_SHARE;
    // §7.307 holdings flip: row walk on the mirror.
    const H = ctx.v2.holdings;
    let heldUSD = 0;
    for (let r = bookHeadOf(ctx.v2, fund.id); r >= 0; r = H.next[r]) heldUSD += H.qtyUSD[r];
    const navUSD = heldUSD + Math.max(0, entityCashOf(ctx.v2, fund));
    return navUSD / shares;
  };

  REGION_IDS.forEach((region) => {
    const reg = ctx.updatedRegions[region];
    const hs = reg?.householdState;
    if (!hs) return;

    // ---- 2. Index-fund shares bought this week settle onto the household register. ----
    const etfShares = [...(hs.etfShares ?? [])];
    ctx.updatedInstitutionalEntities.forEach((fund) => {
      if (fund.entityType !== 'ETF' || fund.region !== region) return;
      // DIST — SIGNED. A negative figure is a REDEMPTION: the household sold shares to raise cash
      // it could not find in its deposits (§7.166). Both directions settle here, on the same
      // arithmetic, because they are the same transaction with the sign flipped — and a
      // redemption that credited no deposits and retired no shares would be money from nowhere.
      const executed = ctx.householdEtfPurchasesUSD.get(fund.id);
      const spentUSD = executed?.spentUSD ?? 0;
      if (spentUSD === 0) return;
      const idx = etfShares.findIndex((x) => x.fundId === fund.id);
      const heldShares = idx >= 0 ? etfShares[idx].shares : 0;
      // §7.248: the price the transaction EXECUTED at (etf-flows), not a NAV re-derived from a
      // book whose cash leg has not applied yet — one transaction, one price (rule 3).
      const navPerShare = executed?.navPerShare ?? fundNavPerShare(fund);
      if (!(navPerShare > 0)) return;
      // A household cannot sell more than it holds; the executed leg is trimmed, not the books.
      const shares = Math.max(-heldShares, spentUSD / navPerShare);
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
    const etfHoldingsUSD = householdEtfHoldingsUSD(ctx.v2, { etfShares }, ctx.updatedInstitutionalEntities);
    const directEquityUSD = householdDirectEquityUSD(ctx.v2,
      region, ctx.updatedCompanies, ctx.updatedInstitutionalEntities
    );
    const privateBusinessEquityUSD = householdPrivateBusinessEquityUSD(region, ctx.updatedCompanies, evMultiple);

    // ---- 5. §5-CLOSE C5: household financial wealth is the claims that EXIST — fund shares,
    // the public float, private business equity, claims on institutions. The placeholder that
    // used to fill the gap to "1.5x income" (assets nobody issued, earning nothing) is deleted.
    const realClaimsUSD = etfHoldingsUSD + directEquityUSD + privateBusinessEquityUSD + institutionalClaimsUSD;

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

    // §7.248: the cash side of the fund-share purchase is a PAYMENT now (etf-flows pays it, the
    // settlement close moves the deposit and the pending bank leg), so this view no longer
    // debits it — doing both moved the same dollar twice, and the max(0,…) that guarded the
    // debit died with it (§7.46 L7). Only the SHARE register settles here.
    const depositsUSD = householdDepositsOf(ctx.v2, region);
    const mmfSharesUSD = Math.max(0, hs.mmfSharesUSD ?? 0);
    const equityHoldingsUSD = realClaimsUSD;

    // ---- 7. HH4c: the tier balance sheets are DERIVED SPLITS of the same marked components —
    // tier net worth is a sum over real lines, not a drifted stock. The split weights are
    // stated primitives (SCF-shaped); what they split is real, so when home prices move it is
    // the middle tiers' net worth that moves, and when equities rally it is the top's — the
    // difference the tier wealth-effect MPCs exist to price.
    if (reg.wealthDistribution) {
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
      // COH1 — DEPOSITS FOLLOW THE LIQUID STOCK, not the whole accumulation. One number used to
      // drive this split and the three below it, so a tier's saving backed every asset class at
      // once and a house-rich, pension-rich tier looked as cash-rich as one holding deposits.
      const accumulatedByTier = WEALTH_TIERS.map((t: WealthTier) =>
        Math.max(0, reg.wealthDistribution?.[t]?.accumulatedSavingsUSD ?? 0));
      const liquidByTier = WEALTH_TIERS.map((t: WealthTier, i: number) =>
        Math.max(0, reg.wealthDistribution?.[t]?.liquidSavingsUSD ?? accumulatedByTier[i]));
      const liquidTotal = liquidByTier.reduce((a, b) => a + b, 0);
      const depositShareOf = (_t: WealthTier, i: number) =>
        liquidTotal > 0 ? liquidByTier[i] / liquidTotal : 0;

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
      // ...and the INVESTED stock is what backs them. It is the saving that was actually put
      // away, split by the same appetite that decided to put it there — so the two halves of the
      // balance sheet are now two stocks rather than one wearing two hats.
      const investedByTier = WEALTH_TIERS.map((t: WealthTier, i: number) =>
        Math.max(0, reg.wealthDistribution?.[t]?.investedSavingsUSD ?? accumulatedByTier[i]));
      const riskyByTier = WEALTH_TIERS.map((t: WealthTier, i: number) =>
        investedByTier[i] * Math.max(0, reg.wealthDistribution?.[t]?.equityExposureShare ?? 0));
      const cautiousByTier = WEALTH_TIERS.map((t: WealthTier, i: number) =>
        investedByTier[i] * Math.max(0, 1 - Math.max(0, reg.wealthDistribution?.[t]?.equityExposureShare ?? 0)));
      const riskyTotal = riskyByTier.reduce((a, b) => a + b, 0);
      const cautiousTotal = cautiousByTier.reduce((a, b) => a + b, 0);
      const riskyShareOf = (t: WealthTier, i: number) =>
        riskyTotal > 0 ? riskyByTier[i] / riskyTotal : 0;
      const cautiousShareOf = (t: WealthTier, i: number) =>
        cautiousTotal > 0 ? cautiousByTier[i] / cautiousTotal : 0;

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
      const incomeShareOf = (t: WealthTier, i: number) =>
        incomeTotal > 0 ? incomeByTier[i] / incomeTotal : 0;
      const borrowByTier = WEALTH_TIERS.map((t: WealthTier, i: number) =>
        incomeByTier[i] * Math.max(0, 1 - Math.max(0, Math.min(1, reg.wealthDistribution?.[t]?.savingsRate ?? 0))));
      const borrowTotal = borrowByTier.reduce((a, b) => a + b, 0);
      const borrowShareOf = (t: WealthTier, i: number) =>
        borrowTotal > 0 ? borrowByTier[i] / borrowTotal : 0;

      WEALTH_TIERS.forEach((t: WealthTier, i: number) => {
        const tierAssetsUSD =
          (depositsUSD + mmfSharesUSD) * depositShareOf(t, i)
          + (etfHoldingsUSD + directEquityUSD) * riskyShareOf(t, i)
          + privateBusinessEquityUSD * riskyShareOf(t, i)
          + institutionalClaimsUSD * cautiousShareOf(t, i)
          + housingStockUSD * incomeShareOf(t, i);
        const tierDebtUSD = mortgageUSD * incomeShareOf(t, i)
          + consumerDebtUSD * borrowShareOf(t, i);
        const tierClaimsUSD = institutionalClaimsUSD * cautiousShareOf(t, i);
        const prev = reg.wealthDistribution[t];
        reg.wealthDistribution[t] = {
          ...prev,
          priorNetWorthUSD: prev.shareOfNetWorthUSD,
          // RULE 19 — published so the cohort build can weight by MEASURED debt and MEASURED
          // claims rather than by `TIER_DEBT_SERVICE_WEIGHT` and `TIER_RESIDUAL_RECEIPT_WEIGHT`.
          // Both were computed here already and thrown away.
          debtUSD: Math.round(tierDebtUSD),
          institutionalClaimsUSD: Math.round(tierClaimsUSD),
          shareOfNetWorthUSD: Math.round((tierAssetsUSD - tierDebtUSD)),
          homeEquityUSD: Math.round((housingStockUSD * incomeShareOf(t, i)
            - mortgageUSD * incomeShareOf(t, i))),
        };
      });
    }

    reg.householdState = {
      ...hs,
      // Last week's marked net worth, so next week's wealth effect can read a CHANGE.
      priorNetWorthUSD: hs.netWorthUSD ?? 0,
      housingStockUSD,
      homeEquityUSD,
      mmfSharesUSD,
      etfShares,
      etfHoldingsUSD,
      directEquityUSD,
      privateBusinessEquityUSD,
      institutionalClaims,
      institutionalClaimsUSD,
      equityHoldingsUSD,
      // The house is an ASSET at full value and the mortgage a liability, as in any set of
      // national accounts. Omitting the asset while carrying the debt understated net worth by
      // the entire housing stock.
      netWorthUSD: depositsUSD + mmfSharesUSD + equityHoldingsUSD + housingStockUSD
        - (mortgageUSD + (hs.creditCardDebtUSD ?? 0) + (hs.otherConsumerLoanDebtUSD ?? 0)),
    };
  });
}
