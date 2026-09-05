// §3.26-f-i: the plant's useful life lives with the one depreciation schedule that runs it —
// `domain/company-week/capital-programme.ts:SECTOR_PPE_USEFUL_LIFE_YEARS`, read through
// `usefulLifeYearsOf`.

// PP&E-to-revenue capital intensity — what a company in this sector's asset base actually looks
// like relative to its own production scale, used to seed the initial PP&E stock. Deliberately
// tied to what the company produces (revenue), not to an unrelated financing decision (debt).
export const SECTOR_PPE_INTENSITY: Record<string, number> = {
  Tech: 0.35,
  Financials: 0.20,
  Industrials: 1.10,
  Energy: 2.20,
  Consumer: 0.55,
  Banks: 0.12,
};
