/**
 * §3.13-READ D5 — ONE CREDIT DEMAND BUILD, for the bond book and the loan book.
 *
 * 07b and 07d built their participants with the same ~80 lines: an entity's structural target per
 * piece of paper, the cash it can actually put behind that target this week, and a reservation
 * level per instrument struck off the borrower's expected loss and the capital THAT paper
 * consumes at THIS holder's required return. Two copies of a rule that subtle drift, and one
 * already had: 07d's had lost the sub-investment-grade size factor entirely (fixed first, in §9,
 * so the two were word-for-word equal before this merge — §5's sequencing lesson).
 *
 * The two books differ only in the instrument they hold, and only in ways this file does not care
 * about: it needs a face, an offering, a capital charge, a distressed level and a way to turn a
 * spread into a price. `CreditDemandInstrument` is exactly that, and a bond and a loan both
 * already satisfy it.
 */
import type { InstrumentId } from '../../../domain/ids';
import type { RegionId } from '../../../domain/geography';
import type { InstitutionalEntity } from '../../../types';
import type { WeeklyStepContext } from './context';
import {
  type ClearingParticipant, type DemandStaging, claimDemandRow, setDemand,
} from './financial-clearing-engine';
import {
  computeReservationSpreadBps, fullSizeSpreadRangeBpsOf, subInvestmentGradeSizeFactor,
  maxOverweightMultipleOf, entityRequiredReturn,
} from './asset-allocation';
import { hedgedReservationAdjustmentBps } from '../../../domain/derivatives/classes/fx-forward';
import { hedgeFundStrategyProfile } from '../../../domain/institution-profiles';
import { institutionTotalAssetsLocal, stagePurchaseBudgetLocal } from './institutional-balance-sheet';
import { institutionUnsettledLessCollateralLocal } from './settlement';

/** What this build needs of a piece of paper — a bond and a loan both already are one. */
interface CreditDemandInstrument {
  id: InstrumentId;
  /** Index into `issuerTerms` — which borrower's paper this is. */
  ci: number;
  faceLocal: number;
  offeringLocal: number;
  /** Spread-risk capital against THIS instrument's own duration. */
  capitalChargeRate: number;
  distressedReservationBps: number;
}

/** What it needs of the borrower behind it. */
interface CreditDemandIssuerTerms {
  expectedLossBps: number;
  /** Below investment grade: the holder's mandate sleeve applies. */
  subIG: boolean;
}

const EMPTY_DEMAND_MAP = new Map<InstrumentId, never>();

export function buildCreditDemandParticipants<I extends CreditDemandInstrument>(args: {
  ctx: WeeklyStepContext;
  regionId: RegionId;
  /** This book's own region's policy rate — the domestic leg of the hedge adjustment. */
  policyRate: number;
  entities: readonly InstitutionalEntity[];
  instruments: readonly I[];
  issuerTerms: readonly CreditDemandIssuerTerms[];
  claimedByEntity: ReadonlyMap<string, Map<InstrumentId, number>>;
  /** Each entity's raw target for this asset class, before normalising by the sector total. */
  rawEntityTargets: ReadonlyMap<string, number>;
  sectorTotal: number;
  assetClass: 'CORP_BOND' | 'LEVERAGED_LOAN';
  creditConditionsIndex: number;
  /** The level this book opened at, per instrument, in the same order as `instruments`. */
  openingPrice: ArrayLike<number>;
  /** A reservation stated in spread, restated as the price it implies on THIS instrument. */
  priceAtSpread: (instrument: I, spreadBps: number) => number;
  demandStaging: DemandStaging;
}): ClearingParticipant[] {
  const {
    ctx, regionId, policyRate, entities, instruments, issuerTerms, claimedByEntity,
    rawEntityTargets, sectorTotal, assetClass, creditConditionsIndex, openingPrice,
    priceAtSpread, demandStaging: DS,
  } = args;

  // §4.C Stage I — the pair loops on dense columns (§7.327 (1)): the per-(entity, name) holding
  // probe becomes an array read, and iteration order is `instruments` order in both passes, so
  // every float accumulates exactly as the Map walk it replaces did.
  const n = instruments.length;
  const indexById = new Map(instruments.map((inst, i) => [inst.id, i]));
  const heldArr = new Float64Array(n);
  const heldTouched: number[] = [];

  return entities.map((entity) => {
    const claimed = claimedByEntity.get(entity.id)!;
    heldTouched.length = 0;
    claimed.forEach((faceLocal, id) => {
      const i = indexById.get(id);
      if (i !== undefined) { heldArr[i] = faceLocal; heldTouched.push(i); }
    });

    // Per-entity invariants of the per-name loops below.
    const entityShare = (rawEntityTargets.get(entity.id) ?? 0) / sectorTotal;
    const entitySubIGFactor = subInvestmentGradeSizeFactor(entity.entityType);
    const totalAssetsLocal = institutionTotalAssetsLocal(ctx, entity);
    const requiredReturn = entityRequiredReturn(entity, totalAssetsLocal);
    // HF1: the distressed bid is a DISTRESSED fund's, not every hedge fund's. Pricing off
    // discounted expected recovery instead of expected loss, and running the conviction size that
    // goes with it, is one strategy — the credit long-short book beside it is an ordinary
    // relative-value buyer and prices like one.
    const strategy = hedgeFundStrategyProfile(entity);
    const overweightMultiple = strategy?.convictionMultiple ?? maxOverweightMultipleOf(entity);
    // XB2: hedged, so a foreign buyer's requirement carries the CIP cost of the hedge.
    const hedgeAdjBps = entity.region === regionId ? 0 : hedgedReservationAdjustmentBps(
      ctx.updatedRegions[entity.region]?.policyRate ?? policyRate, policyRate);
    const fullSizeRangeBps = fullSizeSpreadRangeBpsOf(entity);
    // The entity's real budget for this auction (S11): available cash plus its type's genuine
    // leverage capacity, sliced to this asset class by its own targets, then directed at the paper
    // that is actually changing hands — a live offering, or the gap between what this holder
    // targets and what it already owns. A name it is already at target in, with nothing on offer,
    // needs none of this week's cash; splitting the class budget across the whole STOCK instead
    // starved the primary market by construction, because a new issue's slice was its issuer's
    // index weight rather than its own size.
    const classBudgetLocal = stagePurchaseBudgetLocal(
      ctx, entity, totalAssetsLocal, assetClass, institutionUnsettledLessCollateralLocal(ctx, entity.id));

    // SCALE: indexed by position, not a Map keyed by id — both loops walk `instruments` in order,
    // so the id was pure overhead.
    const cashDemandWeightByIndex = new Float64Array(n);
    let totalCashDemandWeightLocal = 0;
    for (let i = 0; i < n; i++) {
      const inst = instruments[i];
      const f = issuerTerms[inst.ci].subIG ? entitySubIGFactor : 1;
      const structuralLocal = (inst.faceLocal + inst.offeringLocal) * entityShare * f;
      const weightLocal = inst.offeringLocal + Math.max(0, structuralLocal - heldArr[i]);
      cashDemandWeightByIndex[i] = weightLocal;
      totalCashDemandWeightLocal += weightLocal;
    }

    // This entity's terms, PER PIECE OF PAPER. The reservation spread is the RV economics used as
    // what they always were — a PRICE. Below the level that covers this issuer's own expected loss
    // and the capital THIS paper consumes at this entity's own required return, it does not want
    // the instrument at all; above it, it scales into its policy size. Two tranches of one
    // borrower get two answers, because the capital a position consumes is its own duration's, and
    // that difference IS the issuer's credit term structure.
    const demandRow = claimDemandRow(DS);
    for (let i = 0; i < n; i++) {
      const inst = instruments[i];
      const t = issuerTerms[inst.ci];
      // Two pricing regimes, one issuer hazard: regulated holders price spread vs expected loss +
      // capital cost; the distressed fund prices vs discounted expected recovery.
      const reservationBps = (strategy?.pricesOffRecovery
        ? inst.distressedReservationBps
        : computeReservationSpreadBps({
            entityType: entity.entityType,
            requiredReturn,
            expectedLossBps: t.expectedLossBps,
            capitalChargeRate: inst.capitalChargeRate,
            creditConditionsIndex,
          })) + hedgeAdjBps;
      // A willingness-to-move stated in spread, restated as the price move it implies on THIS
      // instrument at its own level. Duration does the conversion, which is what duration IS.
      const reservationPrice = priceAtSpread(inst, reservationBps);
      const rangePrice = Math.max(1e-9,
        Math.abs(reservationPrice - priceAtSpread(inst, reservationBps + fullSizeRangeBps)));
      const sizeFactor = t.subIG ? entitySubIGFactor : 1;
      const structuralSizeLocal = (inst.faceLocal + inst.offeringLocal) * entityShare * sizeFactor;
      // The bound is posted in FACE, and the money it stands for buys that face at the price this
      // book opened at — the same commitment 07e's index funds make, and for the same reason: the
      // cash constraint has to be expressible in the unit the auction allocates.
      setDemand(DS, demandRow, i,
        reservationPrice,
        rangePrice,
        structuralSizeLocal * overweightMultiple,
        (classBudgetLocal * (totalCashDemandWeightLocal > 0
          ? cashDemandWeightByIndex[i] / totalCashDemandWeightLocal
          : 0)) / Math.max(1e-9, openingPrice[i]),
        0);
    }
    for (const i of heldTouched) heldArr[i] = 0;

    return {
      id: entity.id,
      currentHoldingsByInstrumentId: claimed,
      demandByInstrumentId: EMPTY_DEMAND_MAP,
      demandRow,
    };
  });
}
