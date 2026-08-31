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

/**
 * The sentiment plumbing is gone entirely: `sectorSentimentShocks` and `NewsItem.sentimentDelta`
 * went in S10, and `Company.sentiment` itself in L5 — three writers, no readers.
 * WS4 retired sentiment as a price input, which left both as dead plumbing — every producer
 * filled them in and nothing consumed them. News now reaches prices only through the real
 * flows it reports: an earnings surprise through the earnings themselves, a downgrade through
 * the cleared spread, weather through real supply into real commodity and goods prices.
 */
export function generateWeeklyNews(
  week: number,
  regions: Record<RegionId, Region>,
  companies: Company[],
  rateChanges: { region: RegionId; deltaBps: number }[],
  ratingChanges: { ticker: string; from: CreditRating; to: CreditRating; name: string }[],
  defaults: string[],
  earningsReports: EarningsReportEvent[] = [],
  commodities: { id: string; name: string; symbol: string; unit: string; spotPrice: number }[] = []
): { newsItems: NewsItem[] } {
  const news: NewsItem[] = [];

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
      urgent: Math.abs(surprisePctVal) > 0.10,
      tradeShortcut,
    });
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
      urgent: true,
      tradeShortcut,
    });

    // §7.235: an `if (isHike) {} else if (isCut) {}` with two empty bodies stood here. It did
    // nothing and said nothing about what it was meant to do; the linter is what found it.
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
      urgent: true,
    });
  });

  // 3. Rating Migrations
  ratingChanges.slice(0, 3).forEach((rc) => {
    // The FULL rating ladder: the old IG-only array returned -1 for every high-yield notch,
    // so any migration involving BB/B/CCC/D was classified by accident (a BB→BBB upgrade
    // printed as a downgrade).
    const RATING_LADDER = ['AAA', 'AA', 'A', 'BBB', 'BB', 'B', 'CCC', 'D'];
    const isUpgrade = RATING_LADDER.indexOf(rc.to) < RATING_LADDER.indexOf(rc.from);
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
      urgent: !isUpgrade,
      tradeShortcut,
    });
  });

  // 4. Regional Weather Alerts
  Object.values(regions).forEach((r) => {
    if (r.weather && r.weather.severity !== 'Normal' && random() < 0.4) {
      const w = r.weather;
      // The shortcut quotes the REAL affected commodity at its REAL current spot — the old
      // version hardcoded two prices (2.85/78.50) that were fabrications the moment week 1
      // moved the market (rule 4).
      const affected = commodities.find((c) => c.id === w.affectedCommodityId);
      const tradeShortcut: TradeableInstrument | undefined = affected ? {
        assetType: 'COMMODITY',
        id: affected.id,
        symbol: affected.symbol,
        name: affected.name,
        region: r.id,
        price: affected.spotPrice,
        quoteUnit: affected.unit,
        details: {},
      } : undefined;

      news.push({
        id: `weather_${week}_${r.id}`,
        week,
        title: `CLIMATE MONITOR: ${w.title} (${r.id})`,
        description: `${w.economicImpact} Temperature anomaly: ${w.tempDeltaC > 0 ? '+' : ''}${w.tempDeltaC}°C.`,
        category: 'WEATHER',
        impactBadge: '[WEATHER ALERT]',
        impactRegion: r.id,
        urgent: w.severity === 'Severe',
        tradeShortcut,
      });
    }
  });

  // The old block here fabricated filler headlines when the week produced fewer than three
  // real events — canned stories with real-world references (OPEC+, Cushing, Bank of Japan)
  // and five tickers that exist in no run (rule 4). A quiet news week is information; invented
  // news is a lie. Deleted with G8's plumbing.

  return { newsItems: news };
}
