/**
 * FOREIGN DIRECT INVESTMENT: a firm builds abroad when exporting there has stopped
 * working, and a SUBSIDIARY IS A COMPANY (rule 2's fewest primitives: the model already has
 * production, labour, books, births, contracts, invoices and FX — MNC adds a LINK and a
 * DECISION, never a second production machinery).
 *
 * THE DECISION (rule 1 — how it actually works): a firm serves market B from home while its
 * landed cost wins the merit order there; when B's own producers deliver cheaper than A's
 * exports land — sustained for the same measured year established for a position to be
 * structural — the real choice is to produce IN B. The signal is read off the sourcing
 * intent's own merit order (`expectedLandedCostByOrigin`), which is the exact number B's
 * buyers decide with; nothing here re-derives a cost.
 *
 * THE BIRTH: through the one birth machinery every firm uses. The subsidiary opens at the
 * export flow it exists to replace — the parent's measured share of A→B trade in the goods it
 * sells — with the parent's own margin, no leverage (FDI is equity), and the parent's money:
 * the opening balance is PAID cross-border from the parent's deployable cash (the
 * financing discipline: the money must exist first), through the same FX path every
 * cross-border payment takes. The parent's stake is `parentId` + `founderPct: 0`, so the
 * household private-business residual excludes it by construction (OWN4).
 *
 * WHAT IS DELIBERATELY ABSENT: an export-substitution rule. Once the subsidiary produces in B,
 * the sourcing merit order hands it B's demand on landed cost alone — the mechanism that
 * triggered the FDI is the mechanism that completes it.
 */

import { bornPlant, writePlantRows, seedPlantOf } from '../../ledger/plant-ledger';
import { plantGrossLocal } from '../../../domain/plant';
import { riskAversionOf } from '../../../domain/preferences';
import { registerCompanyEquity } from '../../ledger/instrument-ledger';
import { companyParty } from '../../../domain/party';
import { admitParty } from '../../ledger/wire';
import { Company, Region, RegionId } from '../../../types';
import { WeeklyStepContext } from './context';
import { pay } from './settlement';
import { isActiveCompany, ANTITRUST_SUSTAINED_WEEKS } from '../../../domain/company';
import { REGION_IDS, currencyOf } from '../../../domain/geography';
import { convertLocal } from '../../../domain/currency';
import { TREASURY_OPERATING_BUFFER_SHARE_OF_REVENUE } from '../../../domain/company';
import { PrivateFirmSeed } from '../../bootstrap/private-firms';
import { cashOf, openingCashOf } from '../../ledger/accounts';
import type { Ticker } from '../../../domain/ids';

/** A year of losing the merit order is structural — the same measured hold as */
const FDI_SUSTAINED_WEEKS = ANTITRUST_SUSTAINED_WEEKS;

/** The parent's measured annual export flow into `target`, by sub-unit: the target's own
 *  intended units from the parent's region, at the landed cost its buyers decide with, times
 *  the parent's share of its category — all numbers the week already produced. */
function exportFlowUSDBySubUnit(
  comp: Company, target: RegionId, ctx: WeeklyStepContext
): Record<string, number> {
  const out: Record<string, number> = {};
  (comp.productLines ?? []).forEach((line) => {
    const split = ctx.sourcingSplitByRegionSubUnit.get(`${target}|${line.subUnitId}`);
    if (!split) return;
    const units = split.unitsByOrigin[comp.region] ?? 0;
    const landed = split.expectedLandedCostByOrigin[comp.region] ?? 0;
    if (!(units > 0) || !(landed > 0)) return;
    const flowLocal = units * landed * 52 * Math.max(0, line.categoryMarketShare);
    if (flowLocal > 0) out[line.subUnitId] = flowLocal;
  });
  return out;
}

/** Does B's merit order now beat this firm's exports on its PRIMARY good? */
function landedDisadvantage(comp: Company, target: RegionId, ctx: WeeklyStepContext): boolean {
  const u = comp.primarySubUnitId ?? comp.productLines?.[0]?.subUnitId;
  if (!u) return false;
  const split = ctx.sourcingSplitByRegionSubUnit.get(`${target}|${u}`);
  if (!split) return false;
  const fromHome = split.expectedLandedCostByOrigin[comp.region];
  const local = split.expectedLandedCostByOrigin[target];
  if (!(fromHome > 0) || !(local > 0)) return false;
  return fromHome > local;
}

export function runForeignDirectInvestment(
  ctx: WeeklyStepContext,
  nextWeek: number,
  generate: (regionId: RegionId, seeds: PrivateFirmSeed[],
             policyRate: number, tickers: Set<Ticker>, names: Set<string>, openingWeek: number) => Company[]
): Company[] {
  const born: Company[] = [];
  const subsidiaryExists = (parent: Company, region: RegionId): boolean =>
    ctx.updatedCompanies.some((c) => c.parentId === parent.id && c.region === region);

  let armedFirms = 0;
  let maxCounter = 0;
  ctx.updatedCompanies.forEach((comp) => {
    if (comp.isBankEntity || comp.isInstitutionalEntity || comp.parentId) return;
    if (!isActiveCompany(comp) || !(comp.productLines?.length)) return;

    // ---- Weekly: the disadvantage counter per foreign market, shape — reset on any
    // week the merit order goes the firm's way again, because a position is only structural
    // when it HOLDS. ----
    const counters: Partial<Record<RegionId, number>> = { ...(comp.fdiDisadvantageWeeksByRegion ?? {}) };
    REGION_IDS.forEach((target) => {
      if (target === comp.region) return;
      counters[target] = landedDisadvantage(comp, target, ctx) ? (counters[target] ?? 0) + 1 : 0;
    });
    comp.fdiDisadvantageWeeksByRegion = counters;
    const peak = Math.max(0, ...Object.values(counters).map((v) => v));
    if (peak > 0) armedFirms += 1;
    if (peak > maxCounter) maxCounter = peak;

    // ---- Quarterly, like every structural event: build where the year says exporting lost. ----
    if (nextWeek % 13 !== 0) return;
    for (const target of REGION_IDS) {
      if (target === comp.region) continue;
      if ((counters[target] ?? 0) < FDI_SUSTAINED_WEEKS) continue;
      if (subsidiaryExists(comp, target)) continue;

      const flows = exportFlowUSDBySubUnit(comp, target, ctx);
      const revenueLocal = Object.values(flows).reduce((a, v) => a + v, 0);
      if (!(revenueLocal > 1e6)) continue;

      const revenuePerHead = comp.employeeCount > 0 ? comp.annualRevenue / comp.employeeCount : 0;
      const employees = revenuePerHead > 0 ? Math.max(10, Math.round(revenueLocal / revenuePerHead)) : 10;
      const industry = comp.productLines![0].industry;

      const tickers = new Set(ctx.updatedCompanies.map((c) => c.ticker));
      const names = new Set(ctx.updatedCompanies.map((c) => c.name));
      const reg = ctx.updatedRegions[target] as Region | undefined;
      if (!reg) continue;
      const seeds: PrivateFirmSeed[] = [{
        industry,
        annualRevenueLocal: revenueLocal,
        ebitdaMargin: comp.annualRevenue > 0 ? Math.max(0.02, comp.ebitda / comp.annualRevenue) : 0.1,
        leverage: 0, // FDI is equity: the parent raises or holds the money first (§7.288).
        sponsorStyle: false,
        employeeCount: employees,
        productMixBySubUnit: flows,
      }];
      const babies = generate(target, seeds, reg.policyRateAnnual, tickers, names, nextWeek);
      if (babies.length === 0) continue;
      const sub = babies[0];

      // The parent PAYS the opening balance, or the deal does not happen — the same discipline
      // as a capital call that comes up short and the financing cap: FDI spends
      // the cash pile above the treasurer's own operating buffer, never money that isn't there.
      const deployableLocal = Math.max(0,
        cashOf(ctx.v2, comp) - comp.annualRevenue * TREASURY_OPERATING_BUFFER_SHARE_OF_REVENUE * riskAversionOf(comp.management));
      // THE TWO SIDES ARE IN DIFFERENT MONEY. The subsidiary's opening balance is denominated in
      // ITS region's money and the parent's deployable cash in the parent's; compared raw, the
      // affordability test and the amount paid were both wrong by the exchange rate — and the
      // file's own header says this goes through the same FX path every cross-border payment
      // takes. It does now: converted into the payer's money, which is the convention every
      // cross-border leg in the model uses.
      const needParentMoneyLocal = convertLocal(
        Math.max(0, openingCashOf(sub)), sub.region as RegionId, comp.region as RegionId, ctx.getFxToUsd);
      const openingCashLocal = Math.min(needParentMoneyLocal, deployableLocal);
      if (!(openingCashLocal > 0)) continue;
      sub.parentId = comp.id;
      // The stake is the PARENT's, not a founder household's: the private-business residual
      // (OWN4) excludes it by the same founderPct subtraction that defines it.
      sub.ownership = { ...(sub.ownership ?? {}), founderPct: 0 };
      // §3.13-BOOK d2/dI: the subsidiary is admitted to the wire world, and its equity declared on
      // the instrument index, before its first wire.
      admitParty(companyParty(sub));
      registerCompanyEquity(ctx.v2, sub);
      // §3.26-f-iii — the subsidiary's opening plant is MINTED: no party held it before, and the
      // parent's money only funds the balance. Recorded as born, so W6 closes and the minting
      // stays visible; a greenfield build should buy its plant (§3 20d-iv's shape).
      bornPlant(sub.id, plantGrossLocal(seedPlantOf(sub), nextWeek));
      writePlantRows(ctx.v2, sub.id, sub.region, seedPlantOf(sub)); // §3.13-BOOK g-ii: the subsidiary's rows, from the generator's stash
      pay(ctx, {
        payer: companyParty(comp),
        payee: companyParty(sub),
        amount: openingCashLocal,
        currency: currencyOf(sub.region as RegionId),
        reason: 'FDI: subsidiary capitalized from the parent',
      });
      born.push(sub);
      break; // one build per parent per quarter — real FDI is chunky.
    }
  });
  if (process.env.FDI_TRACE === '1' && nextWeek % 13 === 0) {
    console.log(`  [fdi] w${nextWeek} firms with a live disadvantage counter: ${armedFirms}, longest ${maxCounter}wk`
      + ` (fires at ${FDI_SUSTAINED_WEEKS}); born this quarter: ${born.length}`);
  }
  return born;
}
