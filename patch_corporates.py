import re

with open('src/components/screens/CorporatesScreen.tsx', 'r') as f:
    content = f.read()

old_filter = """
  const filtered = useMemo(() => state.companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.ticker.toLowerCase().includes(search.toLowerCase())
  ), [state.companies, search]);
"""

new_filter = """
  const filtered = useMemo(() => {
    if (!search.trim()) return state.companies;
    const q = search.toLowerCase().trim();
    
    return state.companies
      .map(c => {
        const t = c.ticker.toLowerCase();
        const n = c.name.toLowerCase();
        const s = c.sector.toLowerCase();
        let score = -1;
        
        if (t === q) score = 0; // Exact ticker match
        else if (t.startsWith(q)) score = 1; // Ticker prefix match
        else if (n.includes(q)) score = 2; // Name substring
        else if (s.includes(q)) score = 3; // Sector match
        
        return { c, score };
      })
      .filter(item => item.score !== -1)
      .sort((a, b) => a.score - b.score)
      .map(item => item.c);
  }, [state.companies, search]);
"""
content = content.replace(old_filter, new_filter)

with open('src/components/screens/CorporatesScreen.tsx', 'w') as f:
    f.write(content)

