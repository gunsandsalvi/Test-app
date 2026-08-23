import sys

with open('src/engine/simulation.ts', 'r') as f:
    text = f.read()

target = """  const { newsItems, sectorSentimentShocks } = generateWeeklyNews("""

replacement = """  (Object.keys(updatedRegions) as RegionId[]).forEach((regionId) => {
    const reg = updatedRegions[regionId];
    const ipo = checkForIPO(regionId, reg, state.companies, nextWeek);
    if (ipo) {
      updatedCompanies.push(ipo);
      diagnosticLogs.push({ 
        week: nextWeek,
        timestamp: new Date().toISOString(),
        category: 'MACRO',
        message: `New IPO: ${ipo.name} enters ${ipo.productLines?.[0]?.category} amid strong demand growth`,
        deltaText: '',
        data: { regionId }
      });
    }
  });

  const { newsItems, sectorSentimentShocks } = generateWeeklyNews("""

if target in text:
    text = text.replace(target, replacement)
    with open('src/engine/simulation.ts', 'w') as f:
        f.write(text)
    print("Patched IPO mechanic")
else:
    print("Could not find target block for IPO mechanic")

