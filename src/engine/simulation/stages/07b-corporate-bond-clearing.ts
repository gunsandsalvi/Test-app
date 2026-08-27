/**
 * Stage 7b: Corporate Bond Real Clearing
 *
 * Foundational correction (Wall Street): a bond's price/spread must be the actual result of
 * real supply and demand, not a formula that outputs a spread directly. OAS/discount margin is
 * a STATISTIC computed from the cleared price, never the primitive that sets it.
 *
 * This is the corporate-bond adapter over the generalized, asset-agnostic clearing engine (see
 * financial-clearing-engine.ts) — it owns only what's specific to corporate bonds: who the real
 * participants are (named institutional entities, banks as dealer), what "cheap versus fair
 * value" means for a bond (oasSpreadBps versus computeExpectedLossSpreadBps, a participant's own
 * fundamental credit view — an INPUT to its bid decision, never the price itself), and how the
 * cleared price maps onto this asset class's quoted statistic (OAS moves opposite price, real
 * bounds 10-5000bps). The actual auction — target-vs-actual gaps, tilted index weighting, dealer
 * inventory absorption and pressure, price-impact-to-statistic conversion — lives once in the
 * shared engine; sovereign bonds, loans, and equity plug into the same engine as their own
 * adapters rather than re-implementing it.
 *
 * Foreign and household participation in corporate bonds, and hedge funds bidding for
 * distressed issuers specifically, are follow-on slices (see PROJECT_WALL_STREET.md) — this
 * slice's real participants are named institutional entities and the bank dealer desk.
 *
 * Must run after stage 2b (bank diversification, so named banks and their dealer inventory
 * carry-forward already reflect this week) and before stage 8 (company fundamentals), which
 * reads comp.oasSpreadBps as an already-real, already-cleared value rather than computing one
 * itself.
 */

import { GameState, RegionId, ItemizedHolding, InstitutionalEntity, Company } from '../../../types';
import { isActiveCompany } from '../../../domain/company';
import { computeExpectedLossSpreadBps } from './shared-helpers';
import { WeeklyStepContext } from './context';
import { clearFinancialAsset, ClearingInstrument, ClearingParticipant } from './financial-clearing-engine';

// An institutional entity closes this share of its real target-vs-actual gap every week —
// real funds rebalance gradually, not instantaneously, mirroring the pace already used for
// region-level ownership-share drift elsewhere in this codebase (0.05-0.35).
const WEEKLY_REBALANCE_RATE = 0.20;
// How far an issuer's own oasSpreadBps can currently sit from the fundamental fair-value
// estimate before that "rich/cheap" signal is fully saturated (avoids one deeply distressed
// name dominating an entity's entire corporate-bond order flow).
const MAX_RICH_CHEAP_TILT = 0.5;
// Net weekly order flow equal to this many multiples of an issuer's own total debt outstanding
// is needed to move its bond price 100% — corporate bonds are less liquid than the equivalent
// large-cap equity float, hence a shallower depth than EQUITY_LIQUIDITY_DEPTH (6).
const BOND_LIQUIDITY_DEPTH = 3;
// The dealer's own standing inventory creates its own convergence pressure each week (a dealer
// sitting long leans its quotes to sell it back down, and vice versa) — real market-making
// inventory-risk behavior, not client flow.
const DEALER_INVENTORY_PRESSURE_RATE = 0.15;
// Bid/ask spread the dealer desk earns on the gross flow it facilitates, credited as real
// trading revenue to the named banks' own equity (split by bankMarketShare).
const DEALER_SPREAD_BPS = 15;
// Named institutional entities' combined target corp-bond allocation can claim at most this
// share of the total corporate debt actually outstanding in the region — real bank, foreign,
// and household holders exist too (see maxParticipantShareOfOutstanding in the shared engine).
// Exported so the initial cold-start seed (simulation/initialization.ts) can seed entities'
// starting holdings at this same real, achievable target rather than the raw (structurally
// oversized) one — otherwise week 1 starts artificially overweight and spends many weeks
// selling back down before reaching the level this stage would consider each entity's own
// real target, which shows up as a persistent, systemic one-directional spread move.
export const MAX_INSTITUTIONAL_SHARE_OF_OUTSTANDING = 0.85;

function creditDurationYears(comp: Company): number {
  if (!comp.debtTranches || comp.debtTranches.length === 0 || comp.totalDebt <= 0) return 3.5;
  const weightedTenor = comp.debtTranches.reduce((s, t) => {
    const tenorYears = Math.max(0.5, (t.maturityWeek - t.originationWeek) / 52);
    return s + tenorYears * t.principalUSD;
  }, 0) / comp.totalDebt;
  return Math.max(1.0, Math.min(8.0, weightedTenor * 0.75));
}

export function runCorporateBondClearingStage(state: GameState, ctx: WeeklyStepContext): void {
  const regionIds: RegionId[] = ['USA', 'EUR', 'UK', 'JPN'];

  regionIds.forEach((regionId) => {
    const reg = ctx.updatedRegions[regionId];
    const regionCompanies = ctx.prevActiveFirms.filter(
      (c) => c.region === regionId && isActiveCompany(c) && c.debtTranches && c.debtTranches.length > 0
    );
    if (regionCompanies.length === 0) return;

    const fairSpreadByCompany = new Map<string, number>();
    regionCompanies.forEach((c) => fairSpreadByCompany.set(c.id, computeExpectedLossSpreadBps(c)));

    const instruments: ClearingInstrument[] = regionCompanies.map((c) => {
      const richCheapSignal = Math.max(
        -MAX_RICH_CHEAP_TILT,
        Math.min(MAX_RICH_CHEAP_TILT, (c.oasSpreadBps - (fairSpreadByCompany.get(c.id) ?? c.oasSpreadBps)) / 1000)
      );
      return {
        id: c.id,
        outstandingUSD: c.totalDebt,
        currentStat: c.oasSpreadBps,
        richCheapTiltSignal: richCheapSignal,
        durationYears: creditDurationYears(c),
        statDirection: -1, // OAS falls when net buying pushes the bond's price up
        // Real floor: no real corporate credit trades at a zero or near-zero spread over its
        // sovereign benchmark, however deep the bid — even the tightest AAA paper still carries
        // some spread. 5000bps ceiling matches the existing CCC/distressed pricing bound.
        minStat: 25,
        maxStat: 5000,
      };
    });

    const regionEntities = ctx.updatedInstitutionalEntities.filter((e) => e.region === regionId);
    const otherHoldingsByEntity = new Map<string, ItemizedHolding[]>();

    const participants: ClearingParticipant[] = regionEntities.map((entity) => {
      const currentHoldingByCompany = new Map<string, number>();
      const otherHoldings: ItemizedHolding[] = [];
      entity.itemizedHoldings.forEach((h) => {
        if (h.instrumentType === 'CORP_BOND' || h.instrumentType === 'LEVERAGED_LOAN') {
          currentHoldingByCompany.set(h.instrumentId, (currentHoldingByCompany.get(h.instrumentId) ?? 0) + h.quantityOrNotionalUSD);
        } else {
          otherHoldings.push(h);
        }
      });
      otherHoldingsByEntity.set(entity.id, otherHoldings);
      return {
        id: entity.id,
        targetTotalUSD: entity.assetAllocationTarget.corpBondPct * entity.totalAssetsUSD,
        currentHoldingsByInstrumentId: currentHoldingByCompany,
      };
    });

    const priorDealerInventoryById = new Map<string, number>();
    (reg.bankingSector.corpBondDealerInventory || []).forEach((p) => priorDealerInventoryById.set(p.companyId, p.inventoryUSD));

    const result = clearFinancialAsset(instruments, participants, priorDealerInventoryById, {
      weeklyRebalanceRate: WEEKLY_REBALANCE_RATE,
      liquidityDepth: BOND_LIQUIDITY_DEPTH,
      dealerInventoryPressureRate: DEALER_INVENTORY_PRESSURE_RATE,
      dealerSpreadBps: DEALER_SPREAD_BPS,
      maxParticipantShareOfOutstanding: MAX_INSTITUTIONAL_SHARE_OF_OUTSTANDING,
    });

    // Apply: real cleared OAS, mutated in place so stage 8 (which runs next) reads it as this
    // week's already-real value rather than recomputing one.
    const companyById = new Map(regionCompanies.map((c) => [c.id, c]));
    result.newStatById.forEach((newOasBps, companyId) => {
      const comp = companyById.get(companyId);
      if (comp) comp.oasSpreadBps = newOasBps;
    });

    // Apply: each entity's real new holdings, split back into CORP_BOND/LEVERAGED_LOAN per the
    // issuer's own fixed/floating tranche mix (matches how itemized holdings are classified
    // elsewhere, e.g. stage 11).
    if (regionEntities.length > 0) {
      const updatedEntitiesById = new Map<string, InstitutionalEntity>();
      regionEntities.forEach((entity) => {
        const newHoldings = result.newParticipantHoldings.get(entity.id) ?? new Map<string, number>();
        const newCorpHoldings: ItemizedHolding[] = [];
        newHoldings.forEach((newHoldingUSD, companyId) => {
          const comp = companyById.get(companyId);
          if (!comp) return;
          const fixedShare = comp.debtTranches.filter((t) => t.rateType === 'FIXED').reduce((s, t) => s + t.principalUSD, 0) / comp.totalDebt;
          if (fixedShare > 0) {
            newCorpHoldings.push({ instrumentId: companyId, instrumentType: 'CORP_BOND', issuerRegion: regionId, quantityOrNotionalUSD: newHoldingUSD * fixedShare });
          }
          if (fixedShare < 1) {
            newCorpHoldings.push({ instrumentId: companyId, instrumentType: 'LEVERAGED_LOAN', issuerRegion: regionId, quantityOrNotionalUSD: newHoldingUSD * (1 - fixedShare) });
          }
        });
        updatedEntitiesById.set(entity.id, {
          ...entity,
          itemizedHoldings: [...(otherHoldingsByEntity.get(entity.id) ?? []), ...newCorpHoldings],
        });
      });
      ctx.updatedInstitutionalEntities = ctx.updatedInstitutionalEntities.map((e) => updatedEntitiesById.get(e.id) ?? e);
    }

    // Apply: real dealer inventory, and real trading revenue credited to each named bank's own
    // equity by market share — the same per-bank crediting pattern as the SRF/ON RRP facility
    // interest in 02b-bank-diversification.ts.
    const newDealerInventory: { companyId: string; inventoryUSD: number }[] = [];
    result.newDealerInventoryById.forEach((inventoryUSD, companyId) => {
      if (Math.abs(inventoryUSD) > 1) newDealerInventory.push({ companyId, inventoryUSD });
    });
    reg.bankingSector = { ...reg.bankingSector, corpBondDealerInventory: newDealerInventory };

    if (result.totalDealerRevenueUSD > 0) {
      const regionBanks = ctx.prevActiveFirms.filter((c) => c.region === regionId && c.isBankEntity);
      regionBanks.forEach((bank) => {
        const share = bank.bankMarketShare ?? 1 / Math.max(1, regionBanks.length);
        const existingSheet = ctx.companyUpdates[bank.ticker]?.bankBalanceSheet ?? bank.bankBalanceSheet;
        if (!existingSheet) return;
        if (!ctx.companyUpdates[bank.ticker]) ctx.companyUpdates[bank.ticker] = {};
        ctx.companyUpdates[bank.ticker].bankBalanceSheet = {
          ...existingSheet,
          bankEquityUSD: existingSheet.bankEquityUSD + result.totalDealerRevenueUSD * share,
        };
      });
    }
  });
}
