/**
 * Stage 7f: Short-dated debt — Treasury bills and commercial paper (WS5)
 *
 * The front end of the curve below 2Y was an extrapolation: `tenor3M` fell out of the
 * Nelson-Siegel fit through four bond points, so the one part of the curve the policy rate acts
 * on most directly was the one part no market ever set. Bills fix that: the 13/26/52-week
 * buckets of the region's own real bill stock (issued by stage 11, ~18% of the ladder) clear in
 * the same double auction as everything else, and the sub-2Y curve is then refit THROUGH the
 * cleared bill yields.
 *
 * Who anchors bills. Banks, by the same reserve arbitrage that anchors the 2Y in 07c: a bill is
 * the closest substitute for a reserve balance, so a bank's reservation yield is the policy rate
 * plus a few basis points — it will absorb any float at that level and none below it. That is
 * the real mechanism behind "bills trade on the policy corridor", expressed as a price rather
 * than asserted. Institutions bid their cash sleeves above that floor, wanting a small term
 * premium for locking cash away. MMFs take over the marginal role when WS7 lands.
 *
 * Commercial paper. An issuer is a company whose OWN ledger projects a genuine working-capital
 * gap over the next quarter — fixed outflows (interest, maintenance capex, dividends) against
 * cash plus operating inflow — and whose rating still has market access. Size is the gap: CP
 * is not opportunistic funding, it is the bridge a treasurer actually runs. It prices off the
 * cleared 13-week bill plus the issuer's short-horizon expected loss (the annual structural PD
 * scaled to a quarter), and it ROLLS weekly: a roll that finds no bid — rating fallen below
 * access, or distress-level default risk — draws the bank revolver instead, at a real penalty
 * margin. That failure path is the actual mechanism of a funding squeeze (the G2 hook), and it
 * exists here from day one rather than being added after the first crisis needs it.
 *
 * Runs after 07c (bond yields cleared; the NS refit here needs both) and before stage 08 (whose
 * interest arithmetic picks CP up off the ladder like any other tranche).
 */

import { GameState, RegionId, ItemizedHolding, InstitutionalEntity, DebtTranche, NewsItem } from '../../../types';
import { WeeklyStepContext } from './context';
import { computeAnnualDefaultProbability, CREDIT_RECOVERY_RATE, SOV_BILL_BUCKETS, sovBucketKey, WORKING_CAPITAL_SHARE_OF_REVENUE } from './shared-helpers';
import { fitNelsonSiegelParams, calculateNelsonSiegelZeroRate } from '../../nelsonSiegel';
import { isActiveCompany, isPubliclyListed } from '../../../domain/company';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant, ParticipantDemand } from './financial-clearing-engine';
import { computeSovereignRepoHaircuts, unencumberedBorrowingCapacityUSD } from './repo-clearing';
import { MIN_CASH_BUFFER_RATIO, leverageHeadroomUSD, investableSurplusUSD, liquidityDrivenSovereignFloorUSD } from '../../macro/banking';
import { centralBankParticipant, applyCentralBankFills, CENTRAL_BANK_PARTICIPANT_ID } from './central-bank-demand';
import { mandateWeightForIssuer } from '../../../domain/cross-border';

const DEALER_SPREAD_BPS = 2; // the tightest market there is
const MAX_WEEKLY_YIELD_MOVE_PCT = 0.25; // short paper reprices to policy fast; damping is looser here
/** A bank's pickup over reserves for holding a bill instead — the arbitrage band's width. */
const BANK_BILL_PICKUP_BPS = 5;
/** What an institution's cash sleeve wants over policy to lock cash into paper, per year of tenor. */
const INSTITUTIONAL_BILL_TERM_PREMIUM_BPS_PER_YEAR = 20;
const BILL_FULL_SIZE_YIELD_RANGE_BPS = 15;
/** Share of an institution's cash sleeve it will hold as bills rather than overnight cash. */
const CASH_SLEEVE_BILL_SHARE = 0.5;

/** CP access: investment grade only — the real CP market is an A1/P1 club with a BBB fringe. */
const CP_ACCESS_RATINGS = new Set(['AAA', 'AA', 'A', 'BBB']);
/** Above this annual default probability nobody rolls your paper, whatever the rating label. */
const CP_MAX_ANNUAL_PD = 0.08;
const CP_TENOR_WEEKS = 13;
/** Liquidity premium over bills + expected loss — CP is not a bill even for a AAA name. */
const CP_LIQUIDITY_PREMIUM_BPS = 15;
/** The revolver a failed roll draws: policy + this margin. Committed lines price ~300bp drawn. */
export const REVOLVER_MARGIN_BPS = 350;
/** CP outstanding is capped at this share of revenue — a treasurer bridges with CP, never term-funds with it. */
const CP_MAX_SHARE_OF_REVENUE = 0.10;
/** Gaps smaller than this share of revenue are cash-managed, not papered. */
const CP_MIN_GAP_SHARE_OF_REVENUE = 0.01;

const billInstrumentId = (regionId: RegionId, key: string) => `${regionId}-GOV-${key}`;

export function runShortDebtClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

  regionIds.forEach((regionId) => {
    ctx.holdingsStore!.nextEpoch();
    const reg = ctx.updatedRegions[regionId];

    // ---- Bills ----
    const liveBillTranches = (reg.govDebtTranches || []).filter(
      (t) => t.maturityWeek > ctx.nextWeek && sovBucketKey(t.tenorAtIssuanceYears).startsWith('b')
    );
    const outstandingByBucket = new Map<string, number>();
    liveBillTranches.forEach((t) => {
      const key = sovBucketKey(t.tenorAtIssuanceYears);
      outstandingByBucket.set(key, (outstandingByBucket.get(key) ?? 0) + t.principalUSD);
    });

    const activeBuckets = SOV_BILL_BUCKETS.filter((b) => (outstandingByBucket.get(b.key) ?? 0) > 0);
    if (activeBuckets.length > 0) {
      // The whole bill stock is tradable — every holder is real (banks, institutions at home
      // and abroad, the central bank since PUB2b) and every one of them bids here.
      const instruments: ClearingInstrument[] = activeBuckets.map((b) => ({
        id: billInstrumentId(regionId, b.key),
        outstandingUSD: outstandingByBucket.get(b.key) ?? 0,
        tradableFloatUSD: outstandingByBucket.get(b.key) ?? 0,
        currentStat: Math.max(1, calculateNelsonSiegelZeroRate(b.years, reg.yieldCurveParams) * 10000),
        statKind: 'YIELD_LIKE',
        durationYears: b.years,
      }));

      const regionBanks = ctx.updatedCompanies.filter((c) => c.region === regionId && c.isBankEntity && c.bankBalanceSheet && isActiveCompany(c));
      // XB1: bills are the one book a money fund belongs in, and foreign cash sleeves reach for
      // them too — a mandate bound, not an assigned share.
      const billStockByRegion: Record<string, number> = {};
      (Object.keys(ctx.updatedRegions) as RegionId[]).forEach((r) => {
        billStockByRegion[r] = (ctx.updatedRegions[r]?.govDebtTranches || [])
          .filter((t) => sovBucketKey(t.tenorAtIssuanceYears).startsWith('b'))
          .reduce((a, t) => a + t.principalUSD, 0);
      });
      const regionEntities = ctx.updatedInstitutionalEntities.filter(
        (e) => mandateWeightForIssuer(e.entityType, e.region, regionId, billStockByRegion) > 0
      );
      const totalBillStockUSD = activeBuckets.reduce((s, b) => s + (outstandingByBucket.get(b.key) ?? 0), 0) || 1;
      // OWN3: bills and bonds are one HQLA pool, so both books apportion a bank's single
      // appetite over the whole sovereign stock rather than each over its own half.
      const wholeSovStockUSD = (reg.govDebtTranches || [])
        .filter((t) => t.maturityWeek > ctx.nextWeek)
        .reduce((s, t) => s + Math.max(0, t.principalUSD), 0) || 1;

      const participants: ClearingParticipant[] = [];

      // Banks: the arbitrage anchor. Unbounded size at policy + a few bp — their real constraint
      // is the reserve position S2 built, not a cash budget, exactly as in 07c.
      const repoHaircuts = computeSovereignRepoHaircuts(reg);
      regionBanks.forEach((bank) => {
        const holdings = new Map<string, number>();
        const demand = new Map<string, ParticipantDemand>();
        const sheet = bank.bankBalanceSheet!;
        // WS6: same funding budget and encumbrance floor as 07c — a bill bid is a claim on
        // real money, and pledged collateral cannot simultaneously be sold. (Bills cleared
        // here share the collateral pool with the bonds.)
        // Bounded by BOTH real constraints a treasury faces: what its money and collateral can
        // fund, AND what its equity supports under the leverage floor — the only capital
        // constraint that sees a zero-risk-weight sovereign book (see BASEL_MIN_LEVERAGE_RATIO's
        // doc for the 260-week runaway that made this necessary).
        const fundableUSD = Math.min(
          Math.max(0, sheet.cashReservesUSD - sheet.depositsUSD * MIN_CASH_BUFFER_RATIO)
            + unencumberedBorrowingCapacityUSD(sheet, repoHaircuts),
          leverageHeadroomUSD(sheet)
        );
        const totalBookUSD = Object.values(sheet.sovereignBondHoldingsByTenor || {}).reduce((a, v) => a + (Number(v) || 0), 0);
        const encumberedShare = totalBookUSD > 0
          ? Math.min(1, (sheet.repoEncumberedCollateralUSD ?? 0) / totalBookUSD)
          : 0;
        const appetiteUSD = investableSurplusUSD(sheet);
        const liquidityFloorUSD = liquidityDrivenSovereignFloorUSD(sheet);
        activeBuckets.forEach((b) => {
          const heldUSD = sheet.sovereignBondHoldingsByTenor?.[b.key] ?? 0;
          holdings.set(billInstrumentId(regionId, b.key), heldUSD);
          const bucketShare = (outstandingByBucket.get(b.key) ?? 0) / totalBillStockUSD;
          const bucketShareOfSovStock = (outstandingByBucket.get(b.key) ?? 0) / wholeSovStockUSD;
          demand.set(billInstrumentId(regionId, b.key), {
            reservationStat: reg.policyRate * 10000 + BANK_BILL_PICKUP_BPS,
            maxHoldingUSD: appetiteUSD * bucketShareOfSovStock,
            fullSizeStatRange: BILL_FULL_SIZE_YIELD_RANGE_BPS,
            maxNetPurchaseUSD: fundableUSD * bucketShare,
            minHoldingUSD: Math.max(heldUSD * encumberedShare, liquidityFloorUSD * bucketShareOfSovStock),
          });
        });
        participants.push({ id: `BANK-${bank.ticker}`, currentHoldingsByInstrumentId: holdings, demandByInstrumentId: demand });
      });

      // Institutions: the cash sleeve. Half the sleeve wants to be in paper, wanting a small
      // term premium over policy for giving up the overnight option.
      regionEntities.forEach((entity) => {
        const holdings = new Map<string, number>();
        const demand = new Map<string, ParticipantDemand>();
        const sleeveUSD = entity.totalAssetsUSD * entity.assetAllocationTarget.cashPct * CASH_SLEEVE_BILL_SHARE;
        // SCALE C1: read-only scan of the store's GOV_BOND rows — nothing is claimed here.
        // Which rows this auction actually rewrites is decided at apply time, where the
        // auctioned-bucket predicate lives (a bucket whose last tranche matured is NOT
        // auctioned this week and its rows must survive).
        ctx.holdingsStore!.scan(entity.id, 'GOV_BOND', (h) => {
          if (h.issuerRegion === regionId) {
            const key = h.instrumentId.replace(`${regionId}-GOV-`, '');
            if (key.startsWith('b')) holdings.set(h.instrumentId, (holdings.get(h.instrumentId) ?? 0) + h.quantityOrNotionalUSD);
          }
          return false;
        });
        activeBuckets.forEach((b) => {
          const bucketShare = (outstandingByBucket.get(b.key) ?? 0) / totalBillStockUSD;
          demand.set(billInstrumentId(regionId, b.key), {
            reservationStat: reg.policyRate * 10000 + INSTITUTIONAL_BILL_TERM_PREMIUM_BPS_PER_YEAR * b.years,
            maxHoldingUSD: sleeveUSD * bucketShare,
            fullSizeStatRange: BILL_FULL_SIZE_YIELD_RANGE_BPS,
            maxNetPurchaseUSD: Math.max(0, entity.cashUSD ?? 0) * CASH_SLEEVE_BILL_SHARE * bucketShare,
          });
        });
        participants.push({ id: entity.id, currentHoldingsByInstrumentId: holdings, demandByInstrumentId: demand });
      });

      const priorDealerInventory = new Map<string, number>();
      (reg.bankingSector.sovBondDealerInventory || []).forEach((p) => {
        if (p.tenorKey.startsWith('b')) priorDealerInventory.set(billInstrumentId(regionId, p.tenorKey), p.inventoryUSD);
      });

      // PUB2b: a maturing bill rolls back into bills, so the CB's book keeps its shape rather
      // than drifting up the curve. Same size-with-no-reservation order as in 07c.
      const billBucketKeys = activeBuckets.map((b) => b.key);
      const cbOrder = reg.centralBankSheet
        ? centralBankParticipant(reg.centralBankSheet, billBucketKeys, (k) => billInstrumentId(regionId, k))
        : null;
      if (cbOrder) participants.push(cbOrder.participant);
      if (reg.centralBankSheet) {
        reg.centralBankSheet.lastOrderPlacedUSD =
          (reg.centralBankSheet.lastOrderPlacedUSD ?? 0) + (cbOrder?.orderedUSD ?? 0);
      }

      const result = clearFinancialAsset(instruments, participants, priorDealerInventory, {
        dealerSpreadBps: DEALER_SPREAD_BPS,
        maxWeeklyStatMovePct: MAX_WEEKLY_YIELD_MOVE_PCT,
      });
      if (cbOrder && reg.centralBankSheet) {
        // Asset side only — the reserves that paid for it were created. See central-bank-demand.
        const filled = applyCentralBankFills(
          reg.centralBankSheet, billBucketKeys, (k) => billInstrumentId(regionId, k),
          result.newParticipantHoldings.get(CENTRAL_BANK_PARTICIPANT_ID) ?? new Map<string, number>()
        );
        reg.centralBankSheet.lastOpenMarketPurchasesUSD =
          Number(((reg.centralBankSheet.lastOpenMarketPurchasesUSD ?? 0) + filled).toFixed(0));
      }
    ctx.damperBoundInstrumentIds.push(...result.damperBoundInstrumentIds);

      // Refit the curve through BOTH the cleared bills and 07c's cleared bonds, so the sub-2Y
      // segment every short-rate consumer reads comes from a market, not an extrapolation.
      const billPoints = activeBuckets.map((b) => ({
        tenorYears: b.years,
        yield: (result.newStatById.get(billInstrumentId(regionId, b.key)) ?? reg.zeroRates.tenor3M * 10000) / 10000,
      }));
      const bondPoints = [
        { tenorYears: 2, yield: reg.zeroRates.tenor2Y },
        { tenorYears: 5, yield: reg.zeroRates.tenor5Y },
        { tenorYears: 10, yield: reg.zeroRates.tenor10Y },
        { tenorYears: 30, yield: reg.zeroRates.tenor30Y },
      ];
      reg.yieldCurveParams = fitNelsonSiegelParams([...billPoints, ...bondPoints], reg.yieldCurveParams.lambda);
      const cleared13w = billPoints.find((p) => p.tenorYears === 0.25);
      reg.zeroRates = { ...reg.zeroRates, tenor3M: cleared13w ? cleared13w.yield : calculateNelsonSiegelZeroRate(0.25, reg.yieldCurveParams) };

      // Apply bank books (their bill buckets live beside the bond buckets in byTenor) with cash.
      const bankFillById = new Map(regionBanks.map((bank) => [bank.ticker, result.newParticipantHoldings.get(`BANK-${bank.ticker}`)]));
      ctx.updatedCompanies = ctx.updatedCompanies.map((c) => {
        if (c.region !== regionId || !c.isBankEntity || !c.bankBalanceSheet) return c;
        const fills = bankFillById.get(c.ticker);
        if (!fills) return c;
        // Only the buckets this auction actually priced are rewritten; a bucket whose last
        // tranche matures this week is left standing for stage 11 to redeem for cash.
        const byTenor = { ...(c.bankBalanceSheet.sovereignBondHoldingsByTenor || {}) };
        let faceDeltaUSD = 0;
        activeBuckets.forEach((b) => {
          const newUSD = fills.get(billInstrumentId(regionId, b.key)) ?? 0;
          faceDeltaUSD += newUSD - (byTenor[b.key] ?? 0);
          if (newUSD > 1) byTenor[b.key] = newUSD; else delete byTenor[b.key];
        });
        // The engine's cash leg (face plus the dealer fee); the fee part is P&L — an expense the
        // identity invariant would otherwise report as a missing leg.
        const cashDeltaUSD = result.netCashDeltaByParticipantId.get(`BANK-${c.ticker}`) ?? -faceDeltaUSD;
        const feeUSD = Math.max(0, -(cashDeltaUSD + faceDeltaUSD));
        return {
          ...c,
          bankBalanceSheet: {
            ...c.bankBalanceSheet,
            sovereignBondHoldingsByTenor: byTenor,
            sovereignBondHoldingsUSD: Number(Object.values(byTenor).reduce((s, v) => s + v, 0).toFixed(0)),
            cashReservesUSD: c.bankBalanceSheet.cashReservesUSD + cashDeltaUSD,
            bankEquityUSD: c.bankBalanceSheet.bankEquityUSD - feeUSD,
          },
        };
      });

      // Apply institutional books with the engine's cash leg.
      // SCALE C1: claim only what this auction priced — other regions, bonds, and (the subtle
      // one) bill buckets not in THIS week's auction all stay unclaimed. A bucket leaves the
      // auction the week its last tranche matures (`maturityWeek > nextWeek` excludes it), and
      // rebuilding the book from the auction alone therefore deleted the holder's position in it
      // with no cash leg, leaving stage 11's redemption nothing to pay out on. Measured as the
      // institutional book dropping 5-11% on exactly the weeks the seeded 13/26/52-week
      // programs matured. An entity with no fills is not touched at all.
      const auctionedIds = new Set(activeBuckets.map((b) => billInstrumentId(regionId, b.key)));
      regionEntities.forEach((entity) => {
        const fills = result.newParticipantHoldings.get(entity.id);
        if (!fills) return;
        ctx.holdingsStore!.scan(entity.id, 'GOV_BOND', (h) => auctionedIds.has(h.instrumentId));
        const billHoldings: ItemizedHolding[] = [];
        fills.forEach((usd, instrumentId) => {
          if (usd > 1) billHoldings.push({ instrumentId, instrumentType: 'GOV_BOND', issuerRegion: regionId, quantityOrNotionalUSD: usd });
        });
        entity.cashUSD = (entity.cashUSD ?? 0) + (result.netCashDeltaByParticipantId.get(entity.id) ?? 0);
        ctx.holdingsStore!.append(entity.id, billHoldings);
      });

      // The desk's bill-market earnings: the clients' cash legs already paid these fees, so
      // dropping the revenue destroyed the money. Credited as cash AND equity to the named
      // banks, same as the other clearing desks (the identity invariant catches either leg
      // missing).
      if (result.totalDealerRevenueUSD > 0) {
        ctx.updatedCompanies = ctx.updatedCompanies.map((c) => {
          if (c.region !== regionId || !c.isBankEntity || !c.bankBalanceSheet || !isActiveCompany(c)) return c;
          const share = c.bankMarketShare ?? 1 / Math.max(1, regionBanks.length);
          return {
            ...c,
            bankBalanceSheet: {
              ...c.bankBalanceSheet,
              bankEquityUSD: c.bankBalanceSheet.bankEquityUSD + result.totalDealerRevenueUSD * share,
              cashReservesUSD: c.bankBalanceSheet.cashReservesUSD + result.totalDealerRevenueUSD * share,
            },
          };
        });
      }

      // Dealer residual: bills live in the same dealer book as bonds, under their own keys.
      const bondDealerRows = (reg.bankingSector.sovBondDealerInventory || []).filter((p) => !p.tenorKey.startsWith('b'));
      const billDealerRows = activeBuckets.map((b) => ({
        tenorKey: b.key,
        inventoryUSD: result.newDealerInventoryById.get(billInstrumentId(regionId, b.key)) ?? 0,
      })).filter((r) => Math.abs(r.inventoryUSD) > 1);
      reg.bankingSector = { ...reg.bankingSector, sovBondDealerInventory: [...bondDealerRows, ...billDealerRows] };
    }

    // ---- Commercial paper ----
    const billYield13wBps = reg.zeroRates.tenor3M * 10000;
    ctx.prevActiveFirms.forEach((comp) => {
      if (comp.region !== regionId || !isActiveCompany(comp) || !isPubliclyListed(comp)) return;
      if (comp.isBankEntity || comp.isInstitutionalEntity) return;

      const existingCP = (comp.debtTranches || []).filter((t) => t.isCommercialPaper);
      const cpMaturingNow = existingCP.filter((t) => t.maturityWeek <= ctx.nextWeek);
      const cpOutstandingUSD = existingCP.reduce((s, t) => s + t.principalUSD, 0);

      // What CP actually funds: the WORKING-CAPITAL STOCK — the receivables and inventory the
      // balance sheet permanently carries (the same 8%-of-revenue the statements themselves
      // book) — to the extent the company's own projected quarter-end cash does not cover it. A
      // company holding ample cash runs no program; one running lean runs a standing program,
      // permanently rolled, that grows when cash drains and shrinks when it rebuilds. The first
      // version of this looked only for a projected cash DEFICIT and found no issuer in sixty
      // weeks: almost nobody projects negative cash, but plenty of real issuers paper their
      // working capital, which is who the CP market is.
      const annualInterest = (comp.debtTranches || []).reduce((sum, t) => {
        if (t.rateType === 'FIXED') return sum + t.principalUSD * (t.couponRate ?? 0.05);
        return sum + t.principalUSD * (reg.policyRate + (t.floatingMarginBps ?? 200) / 10000);
      }, 0);
      const latestSnap = comp.historicalFundamentals?.[comp.historicalFundamentals.length - 1];
      const dividendsQuarterUSD = Math.abs(latestSnap?.cashFlowStatement?.dividendsPaid ?? 0);
      const quarterOutflowsUSD = annualInterest / 4 + (comp.maintenanceCapex ?? 0) / 4 + dividendsQuarterUSD;
      const quarterInflowUSD = Math.max(0, comp.ebitda) / 4;
      // Quarter-end cash before any CP: what the company itself will have on hand.
      const projectedCashUSD = comp.cash - cpOutstandingUSD + quarterInflowUSD - quarterOutflowsUSD;
      const workingCapitalStockUSD = comp.annualRevenue * WORKING_CAPITAL_SHARE_OF_REVENUE;
      const rawGapUSD = Math.max(0, workingCapitalStockUSD - Math.max(0, projectedCashUSD));
      const targetCPUSD = rawGapUSD > comp.annualRevenue * CP_MIN_GAP_SHARE_OF_REVENUE
        ? Math.min(rawGapUSD, comp.annualRevenue * CP_MAX_SHARE_OF_REVENUE)
        : 0;

      const needsRoll = cpMaturingNow.length > 0;
      const wantsNewPaper = targetCPUSD > cpOutstandingUSD + 1;
      if (!needsRoll && !wantsNewPaper) return;

      const annualPD = computeAnnualDefaultProbability(comp);
      const hasAccess = CP_ACCESS_RATINGS.has(comp.creditRating) && annualPD < CP_MAX_ANNUAL_PD && !comp.isDefaulted;

      if (!hasAccess) {
        // The failed roll: the market said no, the committed bank line says yes at a price.
        // This is the real mechanism of a funding squeeze, alive before G2 makes the line itself
        // a modeled asset on some bank's book.
        const failedUSD = cpMaturingNow.reduce((s, t) => s + t.principalUSD, 0);
        if (failedUSD > 1) {
          comp.debtTranches = (comp.debtTranches || []).filter((t) => !(t.isCommercialPaper && t.maturityWeek <= ctx.nextWeek));
          comp.debtTranches.push({
            id: `${comp.ticker}-REVOLVER-${ctx.nextWeek}`,
            principalUSD: failedUSD,
            rateType: 'FLOATING',
            floatingMarginBps: REVOLVER_MARGIN_BPS,
            originationWeek: ctx.nextWeek,
            maturityWeek: ctx.nextWeek + 52,
            seniority: 'SENIOR',
            // G2: a committed bank line is BANK debt, exactly like the revolver stage 08 draws
            // for a withdrawn refinancing. Unmarked, the identical instrument sat in the
            // syndicated loan market's float on one path and on the house bank's itemized book
            // on the other — one real thing represented two ways (rule 3), and the same
            // double-count class G2 slice 1 was built to close. It also picked up a six-month
            // soft call from the call-protection rules, which a revolver must never carry.
            isBankFacility: true,
            facilityBankTicker: comp.homeBankTicker,
          });
          ctx.newsItems.push({
            id: `cp-fail-${comp.ticker}-${ctx.nextWeek}`,
            week: ctx.nextWeek,
            title: `${comp.ticker} CP Roll Fails — Revolver Drawn`,
            description: `${comp.name} could not roll ${(failedUSD / 1e6).toFixed(0)}M of commercial paper (rating ${comp.creditRating}) and drew its bank revolver at policy+${REVOLVER_MARGIN_BPS}bps.`,
            category: 'CREDIT',
            impactBadge: '[FUNDING SQUEEZE]',
            impactRegion: comp.region,
            impactSector: comp.sector,
            affectedTicker: comp.ticker,
            urgent: true,
          } as NewsItem);
        }
        return;
      }

      // Priced as bills plus this issuer's own short-horizon expected loss — the annual
      // structural PD scaled to the paper's actual quarter of life.
      const shortHorizonELbps = annualPD * (CP_TENOR_WEEKS / 52) * (1 - CREDIT_RECOVERY_RATE) * 10000;
      const cpRate = (billYield13wBps + shortHorizonELbps + CP_LIQUIDITY_PREMIUM_BPS) / 10000;

      const survivingCP = existingCP.filter((t) => t.maturityWeek > ctx.nextWeek);
      const survivingUSD = survivingCP.reduce((s, t) => s + t.principalUSD, 0);
      const newPaperUSD = Math.max(0, targetCPUSD - survivingUSD);
      const maturedUSD = cpMaturingNow.reduce((s, t) => s + t.principalUSD, 0);

      comp.debtTranches = (comp.debtTranches || []).filter((t) => !(t.isCommercialPaper && t.maturityWeek <= ctx.nextWeek));
      if (newPaperUSD > 1) {
        comp.debtTranches.push({
          id: `${comp.ticker}-CP-${ctx.nextWeek}`,
          principalUSD: newPaperUSD,
          rateType: 'FIXED',
          couponRate: Number(cpRate.toFixed(4)),
          originationWeek: ctx.nextWeek,
          maturityWeek: ctx.nextWeek + CP_TENOR_WEEKS,
          seniority: 'SENIOR',
          isCommercialPaper: true,
        } as DebtTranche);
      }
      // The cash legs are real: new paper is proceeds in, matured paper is principal out.
      comp.cash = comp.cash + newPaperUSD - maturedUSD;
      comp.totalDebt = Math.max(0, comp.totalDebt + newPaperUSD - maturedUSD);
    });
  });
}
