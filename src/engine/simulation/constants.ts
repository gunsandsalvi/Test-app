export const SECTOR_WAGE_SENSITIVITY: Record<string, number> = {
  Tech: 0.6,
  Financials: 0.5,
  Industrials: 1.3,
  Energy: 0.9,
  Consumer: 1.4,
  Banks: 0.5,
};

// Straight-line useful life assumption for the PP&E roll-forward — years until a fully-loaded
// asset base (fabs/servers vs. heavy plant/refineries) is fully depreciated.
export const SECTOR_PPE_USEFUL_LIFE_YEARS: Record<string, number> = {
  Tech: 7,
  Financials: 10,
  Industrials: 18,
  Energy: 22,
  Consumer: 12,
  Banks: 10,
};

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
