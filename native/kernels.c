/**
 * THE NATIVE CORES (§5-SCALE, the native-cores campaign; §7.308 opened it).
 *
 * C ports of engine kernels that already exist in columnar form, each verified bit-equal
 * against its JS original on captured real inputs before integration, and each replaceable by
 * the JS path at any time (NATIVE_KERNELS=0, or simply not building this addon). The JS path
 * remains canonical; this file must NEVER diverge from it — a change to a JS kernel means
 * re-porting the change here and re-running the §5-SCALE oracle gate (STATE_DUMP differ,
 * 4 + 13 weeks, IDENTICAL).
 *
 * JS float semantics are replicated deliberately (the §7.308 fidelity traps):
 *  - jmin/jmax PROPAGATE NaN like Math.min/max (a ternary silently clears a book that a NaN
 *    reservation freezes — load-bearing economics, not a detail);
 *  - jround is floor(x+0.5), JS Math.round's tie-toward-+inf, not C round()'s away-from-zero;
 *  - tofixed4 replicates Number(x.toFixed(4)) via the decimal round-trip;
 *  - the RNG is rng.ts's mulberry32 in uint32 arithmetic, bit for bit.
 *
 * Build: npm run build:native (artifact native/build/kernels.node, never committed).
 */
#include <node_api.h>
#include <stdlib.h>
#include <string.h>
#include <math.h>
#include <stdint.h>
#include <stdio.h>

static inline double jmax(double a, double b){ if (isnan(a) || isnan(b)) return NAN; return a > b ? a : b; }
static inline double jmin(double a, double b){ if (isnan(a) || isnan(b)) return NAN; return a < b ? a : b; }
static inline double jround(double x){ return floor(x + 0.5); }
/* Number(x.toFixed(4)), V8-exact. printf's %.4f rounds decimal ties HALF-EVEN while V8's
 * toFixed rounds them AWAY FROM ZERO (measured: (-0.15625).toFixed(4) === "-0.1563", glibc
 * prints -0.1562) — and one cleared stat differing in its 4th decimal walks the whole cash
 * chain (§7.307's ULP lesson). So: take the double's EXACT decimal expansion (%.100f is exact
 * in glibc; our stats are ≥1e-6, well within 100 fractional digits), cut at 4 decimals, and
 * round the remainder with tie→away-from-zero; strtod of the result is correctly rounded,
 * matching JS Number(string). */
static double tofixed4(double x){
  if (!isfinite(x) || x == 0) return x;
  char buf[512];
  snprintf(buf, sizeof buf, "%.100f", x);
  int neg = buf[0] == '-';
  char *p = buf + neg;
  char *dot = strchr(p, '.');
  unsigned long long n0 = 0;
  for (char *q = p; q < dot; q++) n0 = n0 * 10 + (unsigned long long)(*q - '0');
  for (int i = 1; i <= 4; i++) n0 = n0 * 10 + (unsigned long long)(dot[i] - '0');
  char *r = dot + 5;
  int cmp = 0; /* remainder vs one half of the last kept decimal */
  if (*r < '5') cmp = -1;
  else if (*r > '5') cmp = 1;
  else { for (char *q = r + 1; *q; q++) if (*q != '0') { cmp = 1; break; } }
  if (cmp >= 0) n0 += 1; /* above half, or exactly half: away from zero, V8's rule */
  char out[64];
  snprintf(out, sizeof out, "%s%llu.%04llu", neg ? "-" : "", n0 / 10000ULL, n0 % 10000ULL);
  return strtod(out, NULL);
}

/* ---- typed-array plumbing: positional marshaling, zero-copy ---- */
static void *taPtr(napi_env env, napi_value v, size_t *len){
  napi_typedarray_type t; size_t n; void *data; napi_value ab; size_t off;
  if (napi_get_typedarray_info(env, v, &t, &n, &data, &ab, &off) != napi_ok) return NULL;
  if (len) *len = n;
  return data;
}
static napi_value arrAt(napi_env env, napi_value arr, uint32_t i){
  napi_value v; napi_get_element(env, arr, i, &v); return v;
}

/* ================= THE CLEARING KERNEL (financial-clearing-engine.ts runClearingKernel) ===== */

#define YIELD_LIKE_MIN_WEEKLY_MOVE_BPS 25.0

static double *colRes, *colRange, *colMaxH, *colAfford, *colCore;
static double *kernWanted, *kernCore, *kernFilled;
static double *evU, *evD; static int *ordA, *ordB;
static int scratchCap = 0;
static void growScratch(int pCount){
  if (pCount <= scratchCap) return;
  int cap = scratchCap ? scratchCap : 64;
  while (cap < pCount) cap *= 2;
  colRes = realloc(colRes, cap * 8); colRange = realloc(colRange, cap * 8);
  colMaxH = realloc(colMaxH, cap * 8); colAfford = realloc(colAfford, cap * 8); colCore = realloc(colCore, cap * 8);
  kernWanted = realloc(kernWanted, cap * 8); kernCore = realloc(kernCore, cap * 8); kernFilled = realloc(kernFilled, cap * 8);
  evU = realloc(evU, 2L * cap * 8); evD = realloc(evD, 2L * cap * 8);
  ordA = realloc(ordA, 2L * cap * 4); ordB = realloc(ordB, 2L * cap * 4);
  scratchCap = cap;
}
static int colCount;

/* sortIndexByKey: merge sort ascending by (key, index) — a total order, so any correct sort
   returns the identical permutation. */
static void sortIndex(const double *keys, int n, int *out){
  for (int i = 0; i < n; i++) out[i] = i;
  if (n < 2) return;
  int *src = out, *dst = ordB;
  for (int width = 1; width < n; width *= 2){
    for (int lo = 0; lo < n; lo += width * 2){
      int mid = lo + width < n ? lo + width : n;
      int hi = lo + width * 2 < n ? lo + width * 2 : n;
      int i = lo, j = mid, k = lo;
      while (i < mid && j < hi){
        int ii = src[i], jj = src[j];
        double ki = keys[ii], kj = keys[jj];
        if (ki < kj || (ki == kj && ii < jj)) dst[k++] = src[i++]; else dst[k++] = src[j++];
      }
      while (i < mid) dst[k++] = src[i++];
      while (j < hi) dst[k++] = src[j++];
    }
    int *t = src; src = dst; dst = t;
  }
  if (src != out) memcpy(out, src, n * sizeof(int));
}

static double demandAtU(double u, int isYieldLike, int n){
  double sum = 0;
  for (int i = 0; i < n; i++){
    double dist = u - (isYieldLike ? colRes[i] : -colRes[i]);
    double frac = jmax(0, jmin(1, dist / colRange[i]));
    double wanted = colMaxH[i] * frac;
    sum += jmax(colCore[i], jmin(wanted, colAfford[i]));
  }
  return sum;
}

static double solveClearingStat(int isYieldLike, double floatUSD, double bLow, double bHigh){
  int n = colCount;
  double uLo = isYieldLike ? bLow : -bHigh;
  double uHi = isYieldLike ? bHigh : -bLow;
  double wide = demandAtU(uHi, isYieldLike, n);
  double target = jmin(floatUSD, wide * 0.999999);
  if (demandAtU(uLo, isYieldLike, n) > target) return isYieldLike ? uLo : -uLo;
  int evCount = 0; double slopeAtLo = 0;
  for (int i = 0; i < n; i++){
    double maxH = colMaxH[i];
    if (!(maxH > 0)) continue;
    double range = colRange[i], slope = maxH / range;
    if (!isfinite(slope) || !(slope > 0)) continue;
    double uRes = isYieldLike ? colRes[i] : -colRes[i];
    double fCore = jmin(1, colCore[i] / maxH);
    double fCap = jmin(1, colAfford[i] / maxH);
    if (!(fCap > fCore)) continue;
    double uStart = uRes + range * fCore, uEnd = uRes + range * fCap;
    if (uEnd <= uLo || uStart >= uHi) continue;
    if (uStart <= uLo) slopeAtLo += slope;
    else { evU[evCount] = uStart; evD[evCount] = slope; evCount++; }
    if (uEnd < uHi){ evU[evCount] = uEnd; evD[evCount] = -slope; evCount++; }
  }
  sortIndex(evU, evCount, ordA);
  double uCur = uLo, dCur = demandAtU(uLo, isYieldLike, n), slope = slopeAtLo;
  for (int k = 0; k <= evCount; k++){
    double uNext = k < evCount ? evU[ordA[k]] : uHi;
    if (uNext > uCur){
      double dNext = dCur + slope * (uNext - uCur);
      if (dNext >= target && slope > 0){
        double u = uCur + (target - dCur) / slope;
        u = jmax(uLo, jmin(uHi, u));
        return isYieldLike ? u : -u;
      }
      dCur = dNext; uCur = uNext;
    }
    if (k < evCount) slope += evD[ordA[k]];
  }
  return isYieldLike ? uHi : -uHi;
}

/* clearingKernel(inArrs, scalars, outArrs) -> fillCount
   inArrs order:  float, offering, withdrawStat, currentStat, yieldLike, skip, present,
                  dRes, dRange, dMaxH, dMaxNet, dMinH, prevHolding
   scalars (f64): n, pCount, dealerSpreadBps, maxWeeklyStatMovePct (NaN = none), unsold (0/1)
   outArrs order: clearedStat, damper, dealerInventory, primaryWithdrawn, primaryMarketTake,
                  hasPrimary, fillInst, fillPart, fillFilled, fillTraded, fillFee */
static napi_value ClearingKernel(napi_env env, napi_callback_info info){
  size_t argc = 3; napi_value argv[3];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  double *sc = taPtr(env, argv[1], NULL);
  int n = (int)sc[0], pCount = (int)sc[1];
  double dealerSpreadBps = sc[2], maxWeeklyStatMovePct = sc[3];
  int unsold = sc[4] != 0;
  napi_value in = argv[0], out = argv[2];
  double *flt = taPtr(env, arrAt(env, in, 0), NULL), *offering = taPtr(env, arrAt(env, in, 1), NULL);
  double *withdrawStat = taPtr(env, arrAt(env, in, 2), NULL), *currentStatA = taPtr(env, arrAt(env, in, 3), NULL);
  uint8_t *yieldLike = taPtr(env, arrAt(env, in, 4), NULL), *skip = taPtr(env, arrAt(env, in, 5), NULL);
  uint8_t *present = taPtr(env, arrAt(env, in, 6), NULL);
  double *dRes = taPtr(env, arrAt(env, in, 7), NULL), *dRange = taPtr(env, arrAt(env, in, 8), NULL);
  double *dMaxH = taPtr(env, arrAt(env, in, 9), NULL), *dMaxNet = taPtr(env, arrAt(env, in, 10), NULL);
  double *dMinH = taPtr(env, arrAt(env, in, 11), NULL), *prevHolding = taPtr(env, arrAt(env, in, 12), NULL);
  double *clearedStatA = taPtr(env, arrAt(env, out, 0), NULL);
  uint8_t *damper = taPtr(env, arrAt(env, out, 1), NULL);
  double *dealerInventory = taPtr(env, arrAt(env, out, 2), NULL);
  uint8_t *primaryWithdrawn = taPtr(env, arrAt(env, out, 3), NULL);
  double *primaryMarketTake = taPtr(env, arrAt(env, out, 4), NULL);
  uint8_t *hasPrimary = taPtr(env, arrAt(env, out, 5), NULL);
  int32_t *fillInst = taPtr(env, arrAt(env, out, 6), NULL), *fillPart = taPtr(env, arrAt(env, out, 7), NULL);
  double *fillFilled = taPtr(env, arrAt(env, out, 8), NULL), *fillTraded = taPtr(env, arrAt(env, out, 9), NULL);
  double *fillFee = taPtr(env, arrAt(env, out, 10), NULL);
  growScratch(pCount);
  long fillCount = 0;
  for (int i = 0; i < n; i++){
    double currentStat = currentStatA[i];
    if (skip[i]){ clearedStatA[i] = currentStat; dealerInventory[i] = NAN; continue; }
    int isYL = yieldLike[i] == 1;
    double offeringUSD = offering[i];
    double bLow = isYL ? -2000 : jmax(1e-6, currentStat * 0.01);
    double bHigh = isYL ? 100000 : currentStat * 100;
    colCount = 0;
    for (int pi = 0; pi < pCount; pi++){
      long k = (long)pi * n + i;
      if (!present[k]) continue;
      double range = jmax(1e-6, dRange[k]);
      double maxNet = dMaxNet[k];
      double afford = isnan(maxNet) ? INFINITY : prevHolding[k] + jmax(0, maxNet);
      colRes[colCount] = dRes[k]; colRange[colCount] = range;
      colMaxH[colCount] = dMaxH[k]; colAfford[colCount] = afford;
      colCore[colCount] = jmin(dMinH[k], afford);
      colCount++;
    }
    double liveFloat = flt[i] + offeringUSD;
    double solved = solveClearingStat(isYL, liveFloat, bLow, bHigh);
    int withdrawn = 0;
    double wStat = withdrawStat[i];
    if (offeringUSD > 0 && !isnan(wStat)){
      int beyond = isYL ? solved > wStat : solved < wStat;
      if (beyond){ withdrawn = 1; liveFloat = flt[i]; solved = solveClearingStat(isYL, liveFloat, bLow, bHigh); }
    }
    double maxMove = isnan(maxWeeklyStatMovePct) ? INFINITY
      : fabs(currentStat) * maxWeeklyStatMovePct + (isYL ? YIELD_LIKE_MIN_WEEKLY_MOVE_BPS : 0);
    double cleared = tofixed4(jmax(currentStat - maxMove, jmin(currentStat + maxMove, solved)));
    damper[i] = fabs(solved - cleared) > jmax(1e-6, fabs(solved) * 1e-6) ? 1 : 0;
    clearedStatA[i] = isfinite(cleared) ? cleared : currentStat;
    double clearedStat = clearedStatA[i];
    double wantedTotal = 0, coreTotal = 0;
    for (int pi = 0; pi < pCount; pi++){
      long k = (long)pi * n + i;
      double prev = prevHolding[k];
      double filled = 0, core = 0;
      if (present[k]){
        double range = jmax(1e-6, dRange[k]);
        double dist = isYL ? clearedStat - dRes[k] : dRes[k] - clearedStat;
        double frac = jmax(0, jmin(1, dist / range));
        double wanted = dMaxH[k] * frac;
        double maxNet = dMaxNet[k];
        double afford = isnan(maxNet) ? INFINITY : prev + jmax(0, maxNet);
        double mandated = jmin(dMinH[k], afford);
        filled = jmax(mandated, jmin(wanted, afford));
        core = jmin(jmin(dMinH[k], afford), filled);
      }
      kernWanted[pi] = filled; kernCore[pi] = core;
      wantedTotal += filled; coreTotal += core;
    }
    double coreScale = coreTotal > liveFloat ? liveFloat / coreTotal : 1;
    double discFloat = jmax(0, liveFloat - coreTotal * coreScale);
    double discWanted = wantedTotal - coreTotal;
    double discScale = discWanted > discFloat ? discFloat / jmax(1e-9, discWanted) : 1;
    double priorTotal = 0, grossBuys = 0, grossSells = 0;
    for (int pi = 0; pi < pCount; pi++){
      long k = (long)pi * n + i;
      double prev = prevHolding[k];
      priorTotal += prev;
      double core = kernCore[pi] * coreScale;
      double disc = jmax(0, kernWanted[pi] - kernCore[pi]);
      double filled = core + disc * discScale;
      kernFilled[pi] = filled;
      double traded = filled - prev;
      if (traded > 0) grossBuys += traded; else grossSells -= traded;
    }
    double buyScale = 1, sellScale = 1;
    if (unsold){
      double take = jmax(0, jmin(offeringUSD, grossBuys - grossSells));
      double absorbable = grossSells + take;
      if (grossBuys > absorbable) buyScale = grossBuys > 0 ? absorbable / grossBuys : 1;
      else if (grossSells > grossBuys - take) sellScale = grossSells > 0 ? jmax(0, grossBuys - take) / grossSells : 1;
    }
    double allocated = 0;
    for (int pi = 0; pi < pCount; pi++){
      long k = (long)pi * n + i;
      double prev = prevHolding[k];
      double wantedTrade = kernFilled[pi] - prev;
      double traded = wantedTrade > 0 ? wantedTrade * buyScale : wantedTrade * sellScale;
      double filled = prev + traded;
      double fee = fabs(traded) * (dealerSpreadBps / 10000);
      allocated += filled;
      if (present[k] || prev != 0){
        fillInst[fillCount] = i; fillPart[fillCount] = pi;
        fillFilled[fillCount] = filled; fillTraded[fillCount] = traded; fillFee[fillCount] = fee;
        fillCount++;
      }
    }
    dealerInventory[i] = unsold ? 0 : jround(liveFloat - allocated);
    if (offeringUSD > 0){
      hasPrimary[i] = 1;
      primaryWithdrawn[i] = withdrawn ? 1 : 0;
      double take = withdrawn ? 0 : jmax(0, jmin(offeringUSD, allocated - priorTotal));
      primaryMarketTake[i] = jround(take);
    }
  }
  napi_value ret; napi_create_double(env, (double)fillCount, &ret); return ret;
}



/* ================= THE STAGE-08 FRONT CORE (engine2/front-core.ts runFrontCore) ============ */

/* rng.ts mulberry32, bit-exact in uint32 arithmetic. */
static uint32_t rng_state;
static inline double rng_random(void){
  rng_state = rng_state + 0x6d2b79f5u;
  uint32_t t = rng_state;
  t = (uint32_t)((t ^ (t >> 15)) * (t | 1u));
  t ^= t + (uint32_t)((t ^ (t >> 7)) * (t | 61u));
  return (double)(t ^ (t >> 14)) / 4294967296.0;
}
static inline double jround2(double v){ return jround(v * 100) / 100; }
static inline double jround3(double v){ return jround(v * 1000) / 1000; }

#define DUE_BOND 1
#define DUE_CP 2
#define DUE_LOAN 4

typedef struct { double ebitda, ebit, net, taxPaid, carry, basis, deferred; } PnL;
/* domain/company-week/income-statement.ts industrialIncome + corporateTax, verbatim order. */
static PnL industrialIncome(double revenueUSD, double ebitdaMargin, double annualInterestUSD,
    double taxRate, double taxBasisPpeUSD, double usefulLifeYears, double capexDeliveredAnnualUSD,
    double carryforwardUSD, double bookNetPpeUSD){
  PnL R;
  R.ebitda = revenueUSD * ebitdaMargin;
  double daUSD = revenueUSD * 0.05;
  R.ebit = R.ebitda - daUSD;
  double preTax = R.ebit - annualInterestUSD;
  double decliningRate = 2 / jmax(1, usefulLifeYears);
  double taxDep = jmax(0, taxBasisPpeUSD) * decliningRate;
  double basis = jmax(0, taxBasisPpeUSD + (jmax(0, capexDeliveredAnnualUSD) - taxDep) / 52);
  double taxable = preTax + jmax(0, daUSD) - taxDep;
  double carry = jmax(0, carryforwardUSD);
  double taxPaid = 0;
  if (taxable > 0){
    double used = jmin(taxable / 52, carry);
    carry -= used;
    taxPaid = (taxable / 52 - used) * taxRate * 52;
  } else carry += -taxable / 52;
  R.deferred = jmax(0, bookNetPpeUSD - basis) * taxRate;
  R.net = preTax - taxPaid;
  R.taxPaid = taxPaid; R.carry = carry; R.basis = basis;
  return R;
}

static int *fcRows = NULL; static double *fcCosts = NULL; static int fcCap = 0;
static void growFc(int need){
  if (need <= fcCap) return;
  int cap = fcCap ? fcCap : 4096;
  while (cap < need) cap *= 2;
  fcRows = realloc(fcRows, cap * 4); fcCosts = realloc(fcCosts, cap * 8);
  fcCap = cap;
}

/* frontCore(seamArrs, tablesAndLots, outArrs, scalars) -> freeHeadOut
   seamArrs (65, the order in native-kernels.ts FRONT_SEAM_ORDER)
   tablesAndLots (13): RECIPE_START, RECIPE_INPUT, RECIPE_INTENSITY, HAS_INDUSTRY,
     IS_SUBSCRIPTION, CARRY_RATE_WEEKLY, INDUSTRIAL_SET, L.units, L.priceUSD, L.acquiredWeek,
     L.next, L.head, L.tail
   outArrs (39): F lanes then O lanes, the order in native-kernels.ts FRONT_OUT_ORDER
   scalars (f64): n, week, NSUB, churn, weight, freeHeadIn */
static napi_value FrontCore(napi_env env, napi_callback_info info){
  size_t argc = 4; napi_value argv[4];
  napi_get_cb_info(env, info, &argc, argv, NULL, NULL);
  napi_value SA = argv[0], TL = argv[1], OA = argv[2];
  double *sc = taPtr(env, argv[3], NULL);
  int n = (int)sc[0], week = (int)sc[1], NSUB = (int)sc[2];
  double CHURN = sc[3], WEIGHT = sc[4];
  int freeHead = (int)sc[5];
  int ai = 0;
  #define NEXT_F64(nm) double *nm = taPtr(env, arrAt(env, SA, ai++), NULL)
  #define NEXT_I32(nm) int32_t *nm = taPtr(env, arrAt(env, SA, ai++), NULL)
  #define NEXT_U32(nm) uint32_t *nm = taPtr(env, arrAt(env, SA, ai++), NULL)
  #define NEXT_U8(nm)  uint8_t *nm = taPtr(env, arrAt(env, SA, ai++), NULL)
  NEXT_I32(regionIdx); NEXT_U8(sIsActive); NEXT_U8(sIsProfile); NEXT_U32(rngSeed); NEXT_I32(lotRowA);
  NEXT_F64(employeeCount); NEXT_F64(offeredWageIndex); NEXT_F64(baselineEmployeeCount); NEXT_F64(totalDebt);
  NEXT_F64(annualRevenueA); NEXT_F64(baseRevA); NEXT_F64(ebitdaA); NEXT_F64(cashA); NEXT_F64(curLiab);
  NEXT_F64(marketCap); NEXT_F64(sharesOut); NEXT_F64(growthCapexA); NEXT_F64(maintStreak);
  NEXT_F64(execQ0); NEXT_F64(inputC0); NEXT_F64(fulfillEMA0); NEXT_F64(recurringBase0);
  NEXT_F64(baseGrowthRatio); NEXT_F64(baseMarginA); NEXT_F64(openNetPpe); NEXT_F64(taxBasisOpen);
  NEXT_F64(carryOpen); NEXT_F64(usefulLife); NEXT_F64(baseInputRateSum); NEXT_F64(perWorker); NEXT_F64(perWorkerBase);
  NEXT_F64(mktUnitPrice); NEXT_F64(mktFulfill); NEXT_F64(mktCrowding); NEXT_U8(mktExists); NEXT_U8(suppliedMask);
  NEXT_F64(policyRate); NEXT_F64(effTaxRate);
  NEXT_I32(trStart); NEXT_F64(trPrincipal); NEXT_F64(trAnnualRate); NEXT_U8(trIsFloating); NEXT_U8(trIsFacility);
  NEXT_U8(trIsCP); NEXT_I32(trMatWeek); NEXT_I32(trPeriodWeeks); NEXT_I32(trAnchorWeek);
  NEXT_I32(plStart); NEXT_I32(plSub); NEXT_F64(plShare); NEXT_F64(plComp); NEXT_F64(plMktShare);
  NEXT_I32(outStart); NEXT_I32(outSub); NEXT_F64(outValue);
  NEXT_I32(ucStart); NEXT_F64(ucValue); NEXT_I32(ucServiceWeek);
  NEXT_I32(shStart); NEXT_F64(shSupplierRevenue); NEXT_F64(shInvUSD); NEXT_F64(shStrength);
  NEXT_F64(updSalesUSD); NEXT_U8(updHasTargetProd); NEXT_F64(updTargetProdUSD);
  ai = 0;
  #define NEXT_TL_F64(nm) double *nm = taPtr(env, arrAt(env, TL, ai++), NULL)
  #define NEXT_TL_I32(nm) int32_t *nm = taPtr(env, arrAt(env, TL, ai++), NULL)
  #define NEXT_TL_U8(nm)  uint8_t *nm = taPtr(env, arrAt(env, TL, ai++), NULL)
  NEXT_TL_I32(RECIPE_START); NEXT_TL_I32(RECIPE_INPUT); NEXT_TL_F64(RECIPE_INTENSITY);
  NEXT_TL_U8(HAS_INDUSTRY); NEXT_TL_U8(IS_SUBSCRIPTION); NEXT_TL_F64(CARRY_RATE_WEEKLY); NEXT_TL_U8(INDUSTRIAL_SET);
  size_t headN = 0;
  NEXT_TL_F64(Lunits); NEXT_TL_F64(Lprice); NEXT_TL_I32(Lweek); NEXT_TL_I32(Lnext);
  int32_t *Lhead = taPtr(env, arrAt(env, TL, ai), &headN); ai++;
  NEXT_TL_I32(Ltail);
  ai = 0;
  #define NEXT_O_F64(nm) double *nm = taPtr(env, arrAt(env, OA, ai++), NULL)
  #define NEXT_O_I32(nm) int32_t *nm = taPtr(env, arrAt(env, OA, ai++), NULL)
  #define NEXT_O_U32(nm) uint32_t *nm = taPtr(env, arrAt(env, OA, ai++), NULL)
  #define NEXT_O_U8(nm)  uint8_t *nm = taPtr(env, arrAt(env, OA, ai++), NULL)
  NEXT_O_U8(FisActive); NEXT_O_U8(FisProfile); NEXT_O_U32(FrngAfter);
  NEXT_O_F64(FweeklyPayroll); NEXT_O_F64(FannualInterest); NEXT_O_F64(FfacilityInterest);
  NEXT_O_F64(FbondAcc); NEXT_O_F64(FcpAcc); NEXT_O_F64(FloanAcc);
  NEXT_O_U8(FcouponDue); NEXT_O_F64(FeffDebtRate); NEXT_O_F64(Fcommissioned); NEXT_O_F64(FexecQ);
  NEXT_O_F64(Fcarrying); NEXT_O_F64(Frevenue); NEXT_O_F64(FinputCons);
  NEXT_O_F64(Febitda); NEXT_O_F64(Febit); NEXT_O_F64(Fnet); NEXT_O_F64(Feps);
  NEXT_O_F64(FtaxPaid); NEXT_O_F64(FinputConstraint); NEXT_O_F64(FfulfillEMA); NEXT_O_F64(FtargetProd);
  NEXT_O_F64(OplNewComp); NEXT_O_F64(OplNewShare); NEXT_O_F64(OoutNewValue); NEXT_O_U8(OucKeep);
  NEXT_O_I32(OindustrialLineAt); NEXT_O_I32(ObadLineAt);
  NEXT_O_F64(OcostWage); NEXT_O_F64(OcostInput); NEXT_O_F64(OcostDecay); NEXT_O_F64(OcostCrowd);
  NEXT_O_F64(OtaxCarry); NEXT_O_F64(OtaxBasis); NEXT_O_F64(Odeferred);
  NEXT_O_U8(OhasRecurring); NEXT_O_F64(OrecurringBase);
  growFc(4096);

  for (int row = 0; row < n; row++){
    if (!sIsActive[row]){ FisActive[row] = 0; FisProfile[row] = 0; FrngAfter[row] = rngSeed[row]; continue; }
    FisActive[row] = 1;
    int ri = regionIdx[row];
    long mktBase = (long)ri * NSUB;
    double weeklyPayrollUSD = employeeCount[row] > 0 ? (employeeCount[row] * perWorker[row] * offeredWageIndex[row]) / 52 : 0;
    double baselineWeeklyPayrollUSD = baselineEmployeeCount[row] > 0 ? (baselineEmployeeCount[row] * perWorkerBase[row] * 1) / 52 : 0;
    FweeklyPayroll[row] = weeklyPayrollUSD;
    double annualInterest = 0, facilityInterestWeeklyUSD = 0, bondAcc = 0, cpAcc = 0, loanAcc = 0;
    int due3 = 0;
    double policy = policyRate[ri];
    for (int t = trStart[row]; t < trStart[row+1]; t++){
      if (trMatWeek[t] == week) continue;
      double annualUSD = trIsFloating[t] ? trPrincipal[t] * (policy + trAnnualRate[t]) : trPrincipal[t] * trAnnualRate[t];
      annualInterest += annualUSD;
      int due;
      if (trIsCP[t]) due = trMatWeek[t] == week;
      else { int since = week - trAnchorWeek[t]; due = since > 0 && since % trPeriodWeeks[t] == 0; }
      double dueUSD = due ? (annualUSD * trPeriodWeeks[t]) / 52 : 0;
      if (trIsFacility[t]){ facilityInterestWeeklyUSD += dueUSD; continue; }
      if (trIsCP[t]){ cpAcc += annualUSD / 52; if (due) due3 |= DUE_CP; }
      else if (!trIsFloating[t]){ bondAcc += annualUSD / 52; if (due) due3 |= DUE_BOND; }
      else { loanAcc += annualUSD / 52; if (due) due3 |= DUE_LOAN; }
    }
    FannualInterest[row] = annualInterest; FfacilityInterest[row] = facilityInterestWeeklyUSD;
    FbondAcc[row] = bondAcc; FcpAcc[row] = cpAcc; FloanAcc[row] = loanAcc; FcouponDue[row] = due3;
    double effectiveDebtRate = annualInterest / jmax(1, totalDebt[row]);
    FeffDebtRate[row] = effectiveDebtRate;
    double commissionedUSD = 0;
    for (int u = ucStart[row]; u < ucStart[row+1]; u++){
      if (ucServiceWeek[u] <= week) commissionedUSD += ucValue[u]; else OucKeep[u] = 1;
    }
    Fcommissioned[row] = commissionedUSD;
    double carryingCostUSD = 0;
    for (int o = outStart[row]; o < outStart[row+1]; o++){
      double costUSD = outValue[o] * (outSub[o] >= 0 ? CARRY_RATE_WEEKLY[outSub[o]] : 0);
      carryingCostUSD += costUSD;
      OoutNewValue[o] = jmax(0, outValue[o] - costUSD);
    }
    Fcarrying[row] = carryingCostUSD;
    rng_state = rngSeed[row] ? rngSeed[row] : 0x9e3779b9u;
    double executionNoise = (rng_random() - 0.5) * 0.3;
    double newExecutionQuality = execQ0[row] * 0.92 + 1.0 * 0.08 + executionNoise * 0.08;
    FexecQ[row] = newExecutionQuality;
    FrngAfter[row] = rng_state;
    if (sIsProfile[row]){
      FisProfile[row] = 1; Frevenue[row] = 0; FinputCons[row] = 0;
      Febitda[row] = 0; Febit[row] = 0; Fnet[row] = 0; Feps[row] = 0; FtaxPaid[row] = 0;
      FinputConstraint[row] = inputC0[row]; FfulfillEMA[row] = fulfillEMA0[row]; FtargetProd[row] = 0;
      continue;
    }
    FisProfile[row] = 0;
    double annualRevenue = annualRevenueA[row];
    double baseRev = baseRevA[row];
    double capacityDecayPenalty = jmin(0.08, maintStreak[row] * 0.003);
    int plLo = plStart[row], plHi = plStart[row+1];
    double avgCrowdingIntensity = 0;
    for (int p = plLo; p < plHi; p++){
      int si = plSub[p];
      avgCrowdingIntensity += (si >= 0 && mktExists[mktBase + si] ? mktCrowding[mktBase + si] : 0) * plShare[p];
    }
    double relevantFulfillment = 1; int sawNeedingLine = 0;
    for (int p = plLo; p < plHi; p++){
      int si = plSub[p];
      if (si < 0 || RECIPE_START[si] == RECIPE_START[si+1]) continue;
      sawNeedingLine = 1;
      double f = mktExists[mktBase + si] ? mktFulfill[mktBase + si] : 1;
      if (f < relevantFulfillment) relevantFulfillment = f;
    }
    if (!sawNeedingLine) relevantFulfillment = 1;
    double physicalFulfillment = 1.0, realInputConsumptionCostUSD = 0;
    int lotRow = lotRowA[row];
    for (int p = plLo; p < plHi; p++){
      int si = plSub[p];
      if (si < 0) continue;
      int rLo = RECIPE_START[si], rHi = RECIPE_START[si+1];
      if (rLo == rHi) continue;
      double lineProductionUSD = (annualRevenue / 52) * plShare[p];
      for (int r = rLo; r < rHi; r++){
        int inputSi = RECIPE_INPUT[r];
        double neededUSD = lineProductionUSD * RECIPE_INTENSITY[r];
        if (neededUSD <= 0) continue;
        int hasRealSupply = suppliedMask[mktBase + inputSi] == 1 || HAS_INDUSTRY[inputSi] == 1;
        if (!hasRealSupply) continue;
        double inputUnitPrice = mktExists[mktBase + inputSi] ? mktUnitPrice[mktBase + inputSi] : 1;
        double neededUnits = neededUSD / jmax(0.01, inputUnitPrice);
        /* consumeFifoOnViews, verbatim */
        double availableUnits = 0; int nCosts = 0;
        {
          long slot = (long)lotRow * NSUB + inputSi;
          int nRows = 0;
          if (lotRow >= 0 && slot < (long)headN){
            for (int rr = Lhead[slot]; rr >= 0; rr = Lnext[rr]){ growFc(nRows + 1); fcRows[nRows++] = rr; }
          }
          if (nRows > 0){
            int isSorted = 1;
            for (int i2 = 1; i2 < nRows; i2++) if (Lweek[fcRows[i2]] < Lweek[fcRows[i2-1]]){ isSorted = 0; break; }
            if (!isSorted){
              for (int a2 = 1; a2 < nRows; a2++){
                int rv = fcRows[a2]; int wv = Lweek[rv]; int b2 = a2 - 1;
                while (b2 >= 0 && Lweek[fcRows[b2]] > wv){ fcRows[b2+1] = fcRows[b2]; b2--; }
                fcRows[b2+1] = rv;
              }
              for (int i2 = 0; i2 < nRows; i2++) Lnext[fcRows[i2]] = i2 + 1 < nRows ? fcRows[i2+1] : -1;
              Lhead[slot] = fcRows[0]; Ltail[slot] = fcRows[nRows-1];
            }
            for (int i2 = 0; i2 < nRows; i2++) availableUnits += Lunits[fcRows[i2]];
            double left = jmin(availableUnits, jmax(0, neededUnits));
            int firstKept = -1;
            for (int i2 = 0; i2 < nRows; i2++){
              int rr = fcRows[i2];
              if (left <= 0.0001){ firstKept = rr; break; }
              double take = jmin(Lunits[rr], left);
              left -= take;
              fcCosts[nCosts++] = take * Lprice[rr];
              double unitsLeftInLot = Lunits[rr] - take;
              if (unitsLeftInLot > 0.0001){ Lunits[rr] = unitsLeftInLot; firstKept = rr; break; }
              Lnext[rr] = freeHead; freeHead = rr;
            }
            if (firstKept < 0){ Lhead[slot] = -1; Ltail[slot] = -1; } else Lhead[slot] = firstKept;
          }
        }
        double fr = neededUnits > 0 ? jmin(1, availableUnits / neededUnits) : 1;
        physicalFulfillment = jmin(physicalFulfillment, fr);
        for (int c2 = 0; c2 < nCosts; c2++) realInputConsumptionCostUSD += fcCosts[c2];
      }
    }
    double combinedFulfillment = jmin(relevantFulfillment, physicalFulfillment);
    FinputCons[row] = realInputConsumptionCostUSD;
    double newInputSupplyConstraintFactor = inputC0[row] * 0.7 + combinedFulfillment * 0.3;
    for (int sh = shStart[row]; sh < shStart[row+1]; sh++){
      double rev = shSupplierRevenue[sh], inv = shInvUSD[sh];
      if (inv > rev * 0.15){
        double distress = (inv / (rev * 0.15)) - 1;
        newInputSupplyConstraintFactor *= (1 - jmin(0.2, distress * shStrength[sh] * 0.1));
      }
    }
    double baseEbitdaMargin = ebitdaA[row] / jmax(1, annualRevenue);
    double baselineMargin = baseMarginA[row];
    double otherOpexRate = 1 - baselineMargin - baseInputRateSum[row] - (baselineWeeklyPayrollUSD * 52) / jmax(1, baseRev);
    double newEbitdaMargin = 1 - (realInputConsumptionCostUSD * 52 + weeklyPayrollUSD * 52 + otherOpexRate * annualRevenue) / jmax(1, annualRevenue);
    double growthCapex0 = growthCapexA[row];
    double estRateDrag = jmax(0, effectiveDebtRate - 0.04) * 2.0;
    double estCashHealth = cashA[row] < 0 ? 0.05 : (cashA[row] < curLiab[row] * 0.25 ? 0.4 : 1.0);
    double estTobinsQ = jmax(0.1, jmin(10.0, marketCap[row] / jmax(1, totalDebt[row] + annualRevenue * 1.5)));
    double estQCapexEffect = (estTobinsQ - 1) * 0.2;
    double estAvgComp = 0;
    for (int p = plLo; p < plHi; p++) estAvgComp += plComp[p];
    estAvgComp /= jmax(1, plHi - plLo);
    double estTargetGrowthCapex = baseRev * baseGrowthRatio[row] * (1 - estRateDrag) * estCashHealth * (1 + estQCapexEffect + estAvgComp * 0.15);
    double estNewGrowthCapex = jmax(0, growthCapex0 * 0.90 + estTargetGrowthCapex * 0.10);
    double growthInvestmentSignal = ((estNewGrowthCapex - growthCapex0) / jmax(1, growthCapex0)) * newExecutionQuality;
    double marginEdge = (newEbitdaMargin - baseEbitdaMargin) * 2;
    for (int p = plLo; p < plHi; p++){
      int si = plSub[p];
      if (si < 0 || !mktExists[mktBase + si]){ ObadLineAt[row] = p; break; }
      double dominanceDrag = plMktShare[p] > 0.30 ? (plMktShare[p] - 0.30) * 0.5 : 0;
      double targetCompetitiveness = 2.0 * tanh((marginEdge * 16 + growthInvestmentSignal * 0.5) / 2.0);
      double newCompetitiveness = jround3(plComp[p] * 0.98 + targetCompetitiveness * 0.02);
      double shareGainRate = newCompetitiveness * 0.035 - dominanceDrag;
      OplNewComp[p] = newCompetitiveness;
      OplNewShare[p] = jmax(0, plMktShare[p] * (1 + shareGainRate / 52));
    }
    for (int p = plLo; p < plHi; p++){
      int si = plSub[p];
      if (si >= 0 && INDUSTRIAL_SET[si] == 1){ OindustrialLineAt[row] = p; break; }
    }
    double salesUSD = updSalesUSD[row];
    double targetProductionUSD = updHasTargetProd[row] ? updTargetProdUSD[row] : annualRevenue / 52;
    FtargetProd[row] = targetProductionUSD;
    FfulfillEMA[row] = fulfillEMA0[row] * 0.85 + (salesUSD > 0 ? 1.0 : 0.0) * 0.15;
    double recurring = 0, totalShare = 0;
    for (int p = plLo; p < plHi; p++){
      double share = jmax(0, plShare[p]);
      totalShare += share;
      if (plSub[p] >= 0 && IS_SUBSCRIPTION[plSub[p]] == 1) recurring += share;
    }
    double recurringShare = totalShare > 0 ? recurring / totalShare : 0;
    double unitShare = 1 - recurringShare;
    double base0 = recurringBase0[row];
    double priorRecurringUSD = recurringShare > 0 ? (isnan(base0) ? annualRevenue * recurringShare : base0) : 0;
    double priorUnitAnnualUSD = jmax(0, annualRevenue - priorRecurringUSD);
    double unitRevenueUSD = priorUnitAnnualUSD * (1 - WEIGHT) + (salesUSD * unitShare * 52) * WEIGHT;
    double newRecurringBaseUSD;
    if (recurringShare > 0){
      newRecurringBaseUSD = priorRecurringUSD * (1 - CHURN) + salesUSD * recurringShare * 52 * CHURN;
      OhasRecurring[row] = 1;
    } else { OhasRecurring[row] = isnan(base0) ? 0 : 1; newRecurringBaseUSD = base0; }
    double newRevenue = jmax(10, (recurringShare > 0 ? newRecurringBaseUSD : 0) + unitRevenueUSD);
    Frevenue[row] = newRevenue;
    PnL pnl = industrialIncome(newRevenue, newEbitdaMargin, annualInterest, effTaxRate[ri],
      taxBasisOpen[row], usefulLife[row], commissionedUSD * 52, carryOpen[row], openNetPpe[row]);
    Febitda[row] = pnl.ebitda; Febit[row] = pnl.ebit; Fnet[row] = pnl.net;
    Feps[row] = sharesOut[row] > 0 ? jround2(pnl.net / sharesOut[row]) : 0;
    FtaxPaid[row] = pnl.taxPaid;
    OtaxCarry[row] = pnl.carry; OtaxBasis[row] = pnl.basis; Odeferred[row] = pnl.deferred;
    FinputConstraint[row] = newInputSupplyConstraintFactor;
    OrecurringBase[row] = newRecurringBaseUSD;
    double revQ = newRevenue / 4;
    OcostWage[row] = 0;
    OcostInput[row] = (realInputConsumptionCostUSD / jmax(1, targetProductionUSD)) * revQ;
    OcostDecay[row] = capacityDecayPenalty * revQ;
    OcostCrowd[row] = avgCrowdingIntensity * 0.08 * revQ;
  }
  napi_value ret; napi_create_double(env, (double)freeHead, &ret); return ret;
}

NAPI_MODULE_INIT(){
  napi_value fn;
  napi_create_function(env, "clearingKernel", NAPI_AUTO_LENGTH, ClearingKernel, NULL, &fn);
  napi_set_named_property(env, exports, "clearingKernel", fn);
  napi_create_function(env, "frontCore", NAPI_AUTO_LENGTH, FrontCore, NULL, &fn);
  napi_set_named_property(env, exports, "frontCore", fn);
  return exports;
}
