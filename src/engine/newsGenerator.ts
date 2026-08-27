import { Company, CreditRating, NewsItem, Region, RegionId, TradeableInstrument } from '../types';
import { random } from './rng';

export interface EarningsReportEvent {
  ticker: string;
  name: string;
  actualEps: number;
  consensusEps: number;
  surprisePct: number;
  guidanceSnippet: string;
  sector: string;
  region: RegionId;
}

export function generateWeeklyNews(
  week: number,
  regions: Record<RegionId, Region>,
  companies: Company[],
  rateChanges: { region: RegionId; deltaBps: number }[],
  ratingChanges: { ticker: string; from: CreditRating; to: CreditRating; name: string }[],
  defaults: string[],
  earningsReports: EarningsReportEvent[] = []
): { newsItems: NewsItem[]; sectorSentimentShocks: Record<string, number> } {
  const news: NewsItem[] = [];
  const sectorSentimentShocks: Record<string, number> = {
    Tech: 0,
    Energy: 0,
    Financials: 0,
    Industrials: 0,
    Consumer: 0,
  };

  // 1. Corporate Earnings Reports Pipeline
  earningsReports.forEach((er) => {
    const comp = companies.find((c) => c.ticker === er.ticker);
    const surprisePctVal = er.surprisePct;
    const isBeat = surprisePctVal > 0.05;
    const isMiss = surprisePctVal < -0.05;
    const surpriseSign = surprisePctVal > 0 ? '+' : '';
    const surpriseStr = `${surpriseSign}${(surprisePctVal * 100).toFixed(1)}%`;

    // Headline format explicitly requested:
    // [EARNINGS] {Ticker} reports EPS of ${ActualEPS} vs. ${ConsensusEPS} est. ({Surprise > 0 ? '+' : ''}{SurprisePercent}%) - {GuidanceSnippet}
    const headline = `[EARNINGS] ${er.ticker} reports EPS of $${er.actualEps.toFixed(2)} vs. $${er.consensusEps.toFixed(2)} est. (${surpriseStr}) - ${er.guidanceSnippet}`;

    const tradeShortcut: TradeableInstrument | undefined = comp
      ? {
          assetType: 'EQUITY',
          id: comp.id,
          symbol: comp.ticker,
          name: comp.name,
          region: comp.region,
          price: comp.stockPrice,
          quoteUnit: 'USD',
          details: {
            sector: comp.sector,
            rating: comp.creditRating,
          },
        }
      : undefined;

    news.push({
      id: `earn_${week}_${er.ticker}`,
      week,
      title: headline,
      description: `${er.name} (${er.sector}, ${er.region}) reported quarterly results. ${er.guidanceSnippet}`,
      category: 'EARNINGS',
      impactBadge: isBeat ? '[EARNINGS BEAT]' : isMiss ? '[EARNINGS MISS]' : '[EARNINGS IN-LINE]',
      impactRegion: er.region,
      impactSector: er.sector as any,
      affectedTicker: er.ticker,
      sentimentDelta: isBeat ? 0.18 : isMiss ? -0.20 : 0.0,
      urgent: Math.abs(surprisePctVal) > 0.10,
      tradeShortcut,
    });

    if (er.sector && sectorSentimentShocks[er.sector] !== undefined) {
      sectorSentimentShocks[er.sector] += isBeat ? 0.04 : isMiss ? -0.04 : 0;
    }
  });

  // 1. Central Bank Rate Decisions
  rateChanges.forEach((rc) => {
    const reg = regions[rc.region];
    const isHike = rc.deltaBps > 0;
    const isCut = rc.deltaBps < 0;
    const isHold = rc.deltaBps === 0;
    
    let title = '';
    let desc = '';
    let impactBadge = '';
    
    if (isHold) {
      title = `[CENTRAL BANK] ${reg.centralBank} holds policy rate unchanged at ${(reg.policyRate * 100).toFixed(2)}%`;
      desc = `Policymakers opted to hold rates steady, citing balanced risks between inflation (${(reg.inflation * 100).toFixed(1)}%) and output growth (${(reg.gdpGrowth * 100).toFixed(1)}%).`;
      impactBadge = '[RATES UNCHANGED]';
    } else {
      title = `[CENTRAL BANK] ${reg.centralBank} ${isHike ? 'hikes' : 'cuts'} policy rate by ${Math.abs(rc.deltaBps)} bps to ${(reg.policyRate * 100).toFixed(2)}%`;
      desc = isHike
        ? `Addressing persistent inflation (${(reg.inflation * 100).toFixed(1)}%), policymakers tighten financial conditions. Sovereign curve yields adjust upwards.`
        : `Responding to slowing GDP growth (${(reg.gdpGrowth * 100).toFixed(1)}%), central bank eases benchmark borrowing costs to stimulate credit creation.`;
      impactBadge = isHike ? `[RATES +${rc.deltaBps}bps]` : `[RATES ${rc.deltaBps}bps]`;
    }

    const tradeShortcut: TradeableInstrument = {
      assetType: 'IRS',
      id: `${rc.region}_IRS_5Y`,
      symbol: `${rc.region} 5Y IRS`,
      name: `${reg.name} 5Y Fixed-for-Floating Swap`,
      region: rc.region,
      price: reg.zeroRates.tenor5Y,
      quoteUnit: '% Par',
      details: {
        tenorYears: 5,
        couponRate: reg.zeroRates.tenor5Y,
      },
    };

    news.push({
      id: `cb_${week}_${rc.region}`,
      week,
      title,
      description: desc,
      category: 'CENTRAL_BANK',
      impactBadge,
      impactRegion: rc.region,
      sentimentDelta: isHike ? -0.10 : isCut ? 0.12 : 0.0,
      urgent: true,
      tradeShortcut,
    });

    if (isHike) {
      sectorSentimentShocks.Financials += 0.05;
      sectorSentimentShocks.Tech -= 0.08;
    } else if (isCut) {
      sectorSentimentShocks.Tech += 0.10;
      sectorSentimentShocks.Financials -= 0.04;
    }
  });

  // 2. Default News
  defaults.forEach((ticker) => {
    const comp = companies.find((c) => c.ticker === ticker);
    const name = comp?.name || ticker;
    news.push({
      id: `def_${week}_${ticker}`,
      week,
      title: `CHAPTER 11: ${name} (${ticker}) Files for Bankruptcy Liquidation`,
      description: `Following depleted liquidity and interest coverage below 0.8x, ${ticker} has defaulted on senior debt obligations. Senior bond recovery established at 40%, equity shares cancelled.`,
      category: 'CREDIT',
      impactBadge: '[DEFAULT - CH.11]',
      impactRegion: comp?.region,
      impactSector: comp?.sector,
      affectedTicker: ticker,
      sentimentDelta: -0.45,
      urgent: true,
    });
    if (comp?.sector) {
      sectorSentimentShocks[comp.sector] -= 0.15;
    }
  });

  // 3. Rating Migrations
  ratingChanges.slice(0, 3).forEach((rc) => {
    const isUpgrade = ['AAA', 'AA', 'A', 'BBB'].indexOf(rc.to) < ['AAA', 'AA', 'A', 'BBB'].indexOf(rc.from);
    const title = `CREDIT RATING: ${rc.ticker} ${isUpgrade ? 'Upgraded' : 'Downgraded'} from ${rc.from} to ${rc.to}`;
    const desc = isUpgrade
      ? `Agency cites balance sheet deleveraging, robust cash flow expansion, and improving debt service coverage ratios.`
      : `Downgrade triggered by rising leverage metrics, higher debt refinancing costs, and weakening operational EBITDA margins.`;

    const comp = companies.find((c) => c.ticker === rc.ticker);
    const tradeShortcut: TradeableInstrument | undefined = comp ? {
      assetType: 'CDS',
      id: `${comp.id}_CDS`,
      symbol: comp.ticker,
      name: `${comp.name} 5Y CDS`,
      region: comp.region,
      price: comp.cdsSpreadBps,
      quoteUnit: 'bps',
      details: {
        tenorYears: 5,
        cdsSpreadBps: comp.cdsSpreadBps,
        rating: rc.to,
      },
    } : undefined;

    news.push({
      id: `rating_${week}_${rc.ticker}`,
      week,
      title,
      description: desc,
      category: 'CREDIT',
      impactBadge: isUpgrade ? '[CREDIT UPGRADE]' : '[CREDIT DOWNGRADE]',
      affectedTicker: rc.ticker,
      sentimentDelta: isUpgrade ? 0.20 : -0.25,
      urgent: !isUpgrade,
      tradeShortcut,
    });
  });

  // 4. Regional Weather Alerts
  Object.values(regions).forEach((r) => {
    if (r.weather && r.weather.severity !== 'Normal' && random() < 0.4) {
      const w = r.weather;
      let tradeShortcut: TradeableInstrument | undefined;
      if (w.affectedCommodityId === 'NATURAL_GAS') {
        tradeShortcut = {
          assetType: 'COMMODITY',
          id: 'NATURAL_GAS',
          symbol: 'NATURAL_GAS',
          name: 'Natural Gas',
          region: 'USA',
          price: 2.85,
          quoteUnit: '$/mmbtu',
          details: {},
        };
      } else if (w.affectedCommodityId === 'HEAVY_CRUDE_OIL') {
        tradeShortcut = {
          assetType: 'COMMODITY',
          id: 'HEAVY_CRUDE_OIL',
          symbol: 'HEAVY_CRUDE_OIL',
          name: 'Heavy Crude Oil',
          region: 'USA',
          price: 78.50,
          quoteUnit: '$/bbl',
          details: {},
        };
      }

      news.push({
        id: `weather_${week}_${r.id}`,
        week,
        title: `CLIMATE MONITOR: ${w.title} (${r.id})`,
        description: `${w.economicImpact} Temperature anomaly: ${w.tempDeltaC > 0 ? '+' : ''}${w.tempDeltaC}°C.`,
        category: 'WEATHER',
        impactBadge: '[WEATHER ALERT]',
        impactRegion: r.id,
        sentimentDelta: -0.05,
        urgent: w.severity === 'Severe',
        tradeShortcut,
      });
    }
  });

  // 5. Macro & Earnings Procedural Shocks
  if (news.length < 3) {
    const macroEvents = [
      {
        title: 'Global Semiconductor Consortium Announces Next-Gen 1nm Node Architecture',
        desc: 'Advanced packaging breakthroughs drive massive capex revisions across US and European chip fabricators.',
        cat: 'MACRO' as const,
        badge: '[HIGH IMPACT]',
        sector: 'Tech' as const,
        delta: 0.15,
        symbol: 'NVST',
      },
      {
        title: 'OPEC+ Surprise Quota Adjustments Tighten Global Crude Supplies',
        desc: 'Crude oil forward curves slip into deep backwardation as spot inventories in Cushing drop to multi-year lows.',
        cat: 'COMMODITY' as const,
        badge: '[COMMODITY SPIKE]',
        sector: 'Energy' as const,
        delta: 0.18,
        symbol: 'TXEN',
      },
      {
        title: 'Eurozone Industrial Output Data Surpasses Forecasts on Renewable Infrastructure Surge',
        desc: 'Strong German and French manufacturing orders signal unexpected resilience in heavy equipment and power grid exports.',
        cat: 'MACRO' as const,
        badge: '[MACRO SURPRISE]',
        sector: 'Industrials' as const,
        delta: 0.12,
        symbol: 'CHEM',
      },
      {
        title: 'Consumer Confidence Survey Highlights Rising Caution Over High Financing Costs',
        desc: 'Big-ticket durable goods retail foot traffic slows, while discount grocery chains maintain defensive margins.',
        cat: 'EARNINGS' as const,
        badge: '[EARNINGS WARNING]',
        sector: 'Consumer' as const,
        delta: -0.10,
        symbol: 'WMRT',
      },
      {
        title: 'Cross-Currency Basis Swap Demand Surges as Japanese Insurers Hedge Portfolios',
        desc: 'USD/JPY 3-month basis spreads widen as institutional players lock in FX forward hedges amid Bank of Japan shifts.',
        cat: 'MACRO' as const,
        badge: '[BASIS SHOCK]',
        sector: 'Financials' as const,
        delta: 0.08,
        symbol: 'JPMC',
      },
    ];

    const pick = macroEvents[(week + Math.floor(random() * macroEvents.length)) % macroEvents.length];
    const comp = companies.find((c) => c.ticker === pick.symbol);
    const tradeShortcut: TradeableInstrument | undefined = comp ? {
      assetType: 'EQUITY',
      id: comp.id,
      symbol: comp.ticker,
      name: comp.name,
      region: comp.region,
      price: comp.stockPrice,
      quoteUnit: 'USD',
      details: {
        sector: comp.sector,
        rating: comp.creditRating,
      },
    } : undefined;

    news.push({
      id: `macro_${week}_${pick.sector}`,
      week,
      title: pick.title,
      description: pick.desc,
      category: pick.cat,
      impactBadge: pick.badge,
      impactSector: pick.sector,
      sentimentDelta: pick.delta,
      urgent: false,
      tradeShortcut,
    });
    sectorSentimentShocks[pick.sector] += pick.delta;
  }

  return { newsItems: news, sectorSentimentShocks };
}
