import sys

with open('src/components/MacroTab.tsx', 'r') as f:
    text = f.read()

# Replace the Yield Curve Chart usage
old_svg_block = """        {/* Yield Curve & Benchmark Rates */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp className="w-4 h-4 text-purple-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">Sovereign Yield Curve</h3>
          </div>

          <div className="relative w-full h-[110px] bg-slate-950 rounded-xl border border-slate-800 overflow-hidden group">
            {/* ... grid lines ... */}
            <svg className="absolute inset-0 w-full h-full">
              <defs>
                <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#c084fc" stopOpacity="0.4" />
                  <stop offset="100%" stopColor="#c084fc" stopOpacity="0.0" />
                </linearGradient>
              </defs>
              <path
                d={`${svgPathData} L ${curvePoints[curvePoints.length - 1].x} ${svgHeight - padding} L ${curvePoints[0].x} ${svgHeight - padding} Z`}
                fill="url(#curveGrad)"
              />
              <path
                d={svgPathData}
                fill="none"
                stroke="#c084fc"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]"
              />
              {/* Plot dots for key tenors */}
              {[0, 1, 3, 5, 10, 30].map(t => {
                const pt = curvePoints.find(p => Math.abs(p.t - t) < 0.1);
                if (!pt) return null;
                return (
                  <circle
                    key={t}
                    cx={pt.x}
                    cy={pt.y}
                    r="4"
                    fill="#1e293b"
                    stroke="#c084fc"
                    strokeWidth="2"
                    className="transition-transform group-hover:scale-150 group-hover:fill-slate-900"
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex justify-between items-end px-4 pb-1 text-[9px] text-slate-500 font-bold uppercase pointer-events-none">
              <span>3M</span>
              <span>1Y</span>
              <span>3Y</span>
              <span>5Y</span>
              <span>10Y</span>
              <span>30Y</span>
            </div>
          </div>"""

new_svg_block = """        {/* Yield Curve & Benchmark Rates */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Sovereign Yield Curve</h3>
            </div>
          </div>
          
          <div className="flex justify-center bg-slate-950 p-2 rounded-xl border border-slate-800">
            <YieldCurveChart params={region.yieldCurveParams} width={300} height={100} />
          </div>"""

if old_svg_block in text:
    text = text.replace(old_svg_block, new_svg_block)

old_header = """      {/* Sovereign Hub Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-black text-white">{region.name}</h2>
            <p className="text-sm text-slate-400">{region.centralBank} • {region.currency}</p>
          </div>
          <div className="text-right">
            <div className={`text-sm font-bold uppercase tracking-wider ${
              region.cycleRegime === 'Expansion' || region.cycleRegime === 'Recovery'
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}>
              {region.cycleRegime}
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">Macro Regime</p>
          </div>
        </div>"""

new_header = """      {/* Sovereign Hub Header Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-black text-white">{region.name}</h2>
            <p className="text-sm text-slate-400">{region.centralBank} • {region.currency}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className={`text-sm font-bold uppercase tracking-wider ${
                region.cycleRegime === 'Expansion' || region.cycleRegime === 'Recovery'
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}>
                {region.cycleRegime}
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">Macro Regime</p>
            </div>
            <RegimeCompass regime={region.cycleRegime} size={48} />
          </div>
        </div>"""

if old_header in text:
    text = text.replace(old_header, new_header)

with open('src/components/MacroTab.tsx', 'w') as f:
    f.write(text)

