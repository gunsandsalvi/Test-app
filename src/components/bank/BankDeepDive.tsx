import React, { useState } from 'react';
import { GameState, RegionId } from '../../types';
import { formatCurrency } from '../../engine/formatters';

interface BankDeepDiveProps {
  regionId: RegionId;
  state: GameState;
}

export const BankDeepDive: React.FC<BankDeepDiveProps> = ({ regionId, state }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'loans' | 'sovereign'>('overview');
  const region = state.regions[regionId];
  if (!region) return <div className="p-4 text-xs text-[var(--text-tertiary)]">Region not found</div>;

  const bank = region.bankingSector;
  const itemized = bank.itemizedHoldings || [];

  const corpHoldings = itemized.filter(h => h.instrumentType === 'CORP_BOND' || h.instrumentType === 'LEVERAGED_LOAN');
  const sovHoldings = itemized.filter(h => h.instrumentType === 'GOV_BOND');

  const eqOwnership = region.equityOwnership;
  const corpOwnership = region.corpBondOwnership;
  const sovOwnership = region.sovBondOwnership;

  const getHouseholdShare = (shares: typeof eqOwnership) => {
    const foreignSum = Object.values(shares.foreignShare).reduce((a, b) => a + b, 0);
    return Math.max(0, 1 - shares.bankShare - shares.institutionalShare - foreignSum - shares.centralBankShare);
  };

  return (
    <div className="p-4 space-y-4 pb-20 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-[var(--text-primary)]">{region.centralBank} Systemic Banking Sector</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
              {region.currency} ({region.symbol})
            </span>
          </div>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Region: {regionId} | Credit Conditions Index: {bank.creditConditionsIndex > 0 ? `+${bank.creditConditionsIndex.toFixed(2)}` : bank.creditConditionsIndex.toFixed(2)}
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-[var(--text-tertiary)]">Bank Tier 1 Capital</div>
          <div className="text-base font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">
            {formatCurrency(bank.bankEquityUSD, { compact: true })}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] pb-2">
        <button
          id="tab-bank-overview"
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            activeTab === 'overview'
              ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Overview & Capital
        </button>
        <button
          id="tab-bank-loans"
          onClick={() => setActiveTab('loans')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            activeTab === 'loans'
              ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Loan Book ({corpHoldings.length})
        </button>
        <button
          id="tab-bank-sovereign"
          onClick={() => setActiveTab('sovereign')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            activeTab === 'sovereign'
              ? 'bg-[var(--text-primary)] text-[var(--bg-primary)]'
              : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
          }`}
        >
          Sovereign Holdings ({sovHoldings.length})
        </button>
      </div>

      {/* Tab 1: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Capital Ratio</div>
              <div className="text-sm font-bold font-[var(--font-numeric)] text-[var(--text-primary)] mt-1">
                {(bank.bankCapitalRatio * 100).toFixed(1)}%
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Net Interest Margin</div>
              <div className="text-sm font-bold font-[var(--font-numeric)] text-[var(--text-primary)] mt-1">
                {(bank.netInterestMarginPct * 100).toFixed(2)}%
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Loan Loss Provision Rate</div>
              <div className="text-sm font-bold font-[var(--font-numeric)] text-[var(--text-primary)] mt-1">
                {(bank.loanLossProvisionRateAnnualPct * 100).toFixed(2)}% / yr
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Money Supply (M2)</div>
              <div className="text-sm font-bold font-[var(--font-numeric)] text-[var(--text-primary)] mt-1">
                {formatCurrency(bank.moneySupplyM2USD, { compact: true })}
              </div>
            </div>
          </div>

          {/* Balance Sheet Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-3">
              <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Assets & Reserves</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-[var(--border-hairline)]">
                  <span className="text-[var(--text-secondary)]">Cash Reserves</span>
                  <span className="font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">{formatCurrency(bank.cashReservesUSD, { compact: true })}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--border-hairline)]">
                  <span className="text-[var(--text-secondary)]">Central Bank Reserves</span>
                  <span className="font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">{formatCurrency(bank.centralBankReservesUSD, { compact: true })}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--border-hairline)]">
                  <span className="text-[var(--text-secondary)]">Business Loan Book</span>
                  <span className="font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">{formatCurrency(bank.businessLoanBookUSD, { compact: true })}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[var(--border-hairline)]">
                  <span className="text-[var(--text-secondary)]">Consumer Loan Book</span>
                  <span className="font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">{formatCurrency(bank.consumerLoanBookUSD, { compact: true })}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[var(--text-secondary)]">Sovereign Bond Holdings</span>
                  <span className="font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">{formatCurrency(bank.sovereignBondHoldingsUSD, { compact: true })}</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-3">
              <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Liabilities & Capital</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-[var(--border-hairline)]">
                  <span className="text-[var(--text-secondary)]">Deposits</span>
                  <span className="font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">{formatCurrency(bank.depositsUSD, { compact: true })}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-[var(--text-secondary)]">Bank Tier 1 Equity</span>
                  <span className="font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">{formatCurrency(bank.bankEquityUSD, { compact: true })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Regional Asset Ownership Shares */}
          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-3">
            <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Macro Asset Ownership Distribution ({regionId})</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-hairline)] space-y-1">
                <div className="font-bold text-[var(--text-primary)] border-b border-[var(--border-hairline)] pb-1">Equities</div>
                <div className="flex justify-between text-[11px]"><span className="text-[var(--text-tertiary)]">Bank Share:</span> <span className="font-bold">{(eqOwnership.bankShare * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-[var(--text-tertiary)]">Institutional:</span> <span className="font-bold">{(eqOwnership.institutionalShare * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-[var(--text-tertiary)]">Household (Residual):</span> <span className="font-bold">{(getHouseholdShare(eqOwnership) * 100).toFixed(1)}%</span></div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-hairline)] space-y-1">
                <div className="font-bold text-[var(--text-primary)] border-b border-[var(--border-hairline)] pb-1">Corporate Bonds</div>
                <div className="flex justify-between text-[11px]"><span className="text-[var(--text-tertiary)]">Bank Share:</span> <span className="font-bold">{(corpOwnership.bankShare * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-[var(--text-tertiary)]">Institutional:</span> <span className="font-bold">{(corpOwnership.institutionalShare * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-[var(--text-tertiary)]">Household (Residual):</span> <span className="font-bold">{(getHouseholdShare(corpOwnership) * 100).toFixed(1)}%</span></div>
              </div>
              <div className="p-3 rounded-lg bg-[var(--bg-primary)] border border-[var(--border-hairline)] space-y-1">
                <div className="font-bold text-[var(--text-primary)] border-b border-[var(--border-hairline)] pb-1">Sovereign Bonds</div>
                <div className="flex justify-between text-[11px]"><span className="text-[var(--text-tertiary)]">Bank Share:</span> <span className="font-bold">{(sovOwnership.bankShare * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-[var(--text-tertiary)]">Institutional:</span> <span className="font-bold">{(sovOwnership.institutionalShare * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-[var(--text-tertiary)]">Central Bank:</span> <span className="font-bold">{(sovOwnership.centralBankShare * 100).toFixed(1)}%</span></div>
                <div className="flex justify-between text-[11px]"><span className="text-[var(--text-tertiary)]">Household (Residual):</span> <span className="font-bold">{(getHouseholdShare(sovOwnership) * 100).toFixed(1)}%</span></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Loan Book & Credit */}
      {activeTab === 'loans' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Business Loan Book</div>
              <div className="text-base font-bold font-[var(--font-numeric)] text-[var(--text-primary)] mt-1">
                {formatCurrency(bank.businessLoanBookUSD, { compact: true })}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
              <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Consumer Loan Book</div>
              <div className="text-base font-bold font-[var(--font-numeric)] text-[var(--text-primary)] mt-1">
                {formatCurrency(bank.consumerLoanBookUSD, { compact: true })}
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-3">
            <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Itemized Corporate Debt & Loan Holdings</h3>
            {corpHoldings.length === 0 ? (
              <div className="text-xs text-[var(--text-tertiary)] py-4 text-center">No itemized corporate holdings currently recorded.</div>
            ) : (
              <div className="divide-y divide-[var(--border-hairline)]">
                {corpHoldings.map((h, i) => {
                  const company = state.companies.find(c => c.id === h.instrumentId || c.debtTranches?.some(t => t.id === h.instrumentId));
                  return (
                    <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-[var(--text-primary)]">
                          {company ? `${company.name} (${company.ticker})` : `Instrument ID: ${h.instrumentId}`}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-2 mt-0.5">
                          <span>Type: {h.instrumentType}</span>
                          <span>Issuer Region: {h.issuerRegion}</span>
                          {company && <span>Rating: {company.creditRating}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">
                          {formatCurrency(h.quantityOrNotionalUSD, { compact: true })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Sovereign Holdings */}
      {activeTab === 'sovereign' && (
        <div className="space-y-4">
          <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)]">
            <div className="text-[10px] text-[var(--text-tertiary)] uppercase font-bold">Total Sovereign Bond Holdings</div>
            <div className="text-base font-bold font-[var(--font-numeric)] text-[var(--text-primary)] mt-1">
              {formatCurrency(bank.sovereignBondHoldingsUSD, { compact: true })}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-hairline)] space-y-3">
            <h3 className="text-xs font-bold text-[var(--text-primary)] uppercase tracking-wider">Itemized Sovereign Debt Holdings</h3>
            {sovHoldings.length === 0 ? (
              <div className="text-xs text-[var(--text-tertiary)] py-4 text-center">No itemized sovereign holdings currently recorded.</div>
            ) : (
              <div className="divide-y divide-[var(--border-hairline)]">
                {sovHoldings.map((h, i) => {
                  const tranche = (region.govDebtTranches || []).find(gt => gt.id === h.instrumentId);
                  return (
                    <div key={i} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-[var(--text-primary)]">
                          Sovereign Bond ({h.issuerRegion})
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] flex items-center gap-2 mt-0.5">
                          <span>Tranche ID: {h.instrumentId}</span>
                          {tranche && <span>Coupon: {(tranche.couponRate * 100).toFixed(2)}%</span>}
                          {tranche && <span>Maturity Wk: {tranche.maturityWeek}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold font-[var(--font-numeric)] text-[var(--text-primary)]">
                          {formatCurrency(h.quantityOrNotionalUSD, { compact: true })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
