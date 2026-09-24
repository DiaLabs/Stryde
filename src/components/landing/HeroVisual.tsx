/** Illustrative (not real data) broadcast-style frame: perspective pitch with tracked players. */
export function HeroVisual() {
  const players: [number, number, "a" | "b"][] = [
    [150, 250, "a"],
    [230, 205, "b"],
    [300, 290, "a"],
    [355, 225, "b"],
    [420, 260, "a"],
    [470, 200, "b"],
    [520, 305, "b"],
    [585, 240, "a"],
    [260, 330, "b"],
    [640, 290, "a"],
  ];
  const colors = { a: "#2F80ED", b: "#F2F2F2" };
  return (
    <figure className="relative" aria-label="Illustration of an annotated match frame">
      <div className="overflow-hidden rounded-2xl border border-white/10 shadow-2xl shadow-black/50">
        <svg viewBox="0 0 760 430" className="block w-full">
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#0d1d2a" />
              <stop offset="1" stopColor="#12324a" />
            </linearGradient>
            <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#1a7a47" />
              <stop offset="1" stopColor="#1f9455" />
            </linearGradient>
          </defs>
          <rect width="760" height="430" fill="url(#sky)" />
          {Array.from({ length: 40 }).map((_, i) => (
            <circle key={i} cx={(i * 97) % 760} cy={20 + ((i * 37) % 70)} r={1.5 + (i % 3)} fill="rgba(255,255,255,0.12)" />
          ))}
          <polygon points="60,110 700,110 760,430 0,430" fill="url(#grass)" />
          {Array.from({ length: 8 }).map((_, i) => (
            <polygon
              key={i}
              points={`${60 + i * 80},110 ${140 + i * 80},110 ${95 + (i + 1) * 95},430 ${i * 95},430`}
              fill={i % 2 ? "rgba(255,255,255,0.04)" : "transparent"}
            />
          ))}
          <g fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth="2">
            <polygon points="60,110 700,110 760,430 0,430" />
            <line x1="380" y1="110" x2="380" y2="430" />
            <ellipse cx="380" cy="245" rx="85" ry="38" />
            <polygon points="60,165 150,165 140,375 20,375" />
          </g>
          {/* trajectory */}
          <path d="M300 300 Q 200 150 95 250" fill="none" stroke="#fff" strokeWidth="3" strokeDasharray="8 6" />
          <circle cx="300" cy="300" r="7" fill="none" stroke="#FFD400" strokeWidth="3" />
          <text x="312" y="304" fill="#FFD400" fontSize="12" fontWeight="700" fontFamily="Inter, sans-serif">
            BALL
          </text>
          {players.map(([x, y, t], i) => {
            const s = 0.7 + (y - 110) / 400;
            const w = 16 * s;
            const h = 38 * s;
            const c = colors[t];
            return (
              <g key={i}>
                <ellipse cx={x} cy={y} rx={w * 0.9} ry={w * 0.3} fill="none" stroke={c} strokeWidth={t === "a" && i === 2 ? 3 : 2} />
                <rect x={x - w / 2} y={y - h} width={w} height={h} fill="none" stroke={c} strokeWidth="1.3" />
                <rect x={x - w / 2 + 3} y={y - h + 6} width={w - 6} height={h * 0.4} rx="2" fill={c} opacity="0.85" />
                <rect x={x - 24} y={y - h - 18} width="48" height="14" rx="3" fill={c} opacity="0.92" />
                <text x={x} y={y - h - 8} textAnchor="middle" fontSize="9" fontWeight="700" fill={t === "a" ? "#fff" : "#0B1620"} fontFamily="Inter, sans-serif">
                  {t === "a" ? "BLUE" : "WHITE"} · {i + 3}
                </text>
              </g>
            );
          })}
          <polygon points="294,236 306,236 300,245" fill="#FFD400" stroke="#0B1620" />
          {/* scorebug */}
          <g fontFamily="Inter, sans-serif" fontWeight="800" fontSize="12">
            <rect x="18" y="16" width="62" height="24" fill="rgba(7,19,29,0.92)" />
            <text x="26" y="32" fill="#20C785">STRYDE</text>
            <rect x="80" y="16" width="62" height="24" fill="#2F80ED" />
            <text x="90" y="32" fill="#fff">BLUE</text>
            <rect x="142" y="16" width="66" height="24" fill="#F2F2F2" />
            <text x="152" y="32" fill="#0B1620">WHITE</text>
            <rect x="208" y="16" width="44" height="24" fill="rgba(7,19,29,0.92)" />
            <text x="216" y="32" fill="#fff">0:34</text>
          </g>
          {/* possession panel */}
          <g fontFamily="Inter, sans-serif">
            <rect x="540" y="330" width="200" height="82" rx="8" fill="rgba(7,19,29,0.88)" stroke="rgba(255,255,255,0.15)" />
            <text x="554" y="352" fill="#fff" fontSize="12" fontWeight="800">POSSESSION</text>
            <text x="712" y="352" fill="#fff" fontSize="9" fontWeight="700" opacity="0.8">EST.</text>
            <text x="554" y="374" fill="#fff" fontSize="11">Blue</text>
            <rect x="600" y="366" width="100" height="9" rx="2" fill="rgba(255,255,255,0.12)" />
            <rect x="600" y="366" width="56" height="9" rx="2" fill="#2F80ED" />
            <text x="728" y="375" fill="#fff" fontSize="11" fontWeight="700" textAnchor="end">
              56%
            </text>
            <text x="554" y="396" fill="#fff" fontSize="11">White</text>
            <rect x="600" y="388" width="100" height="9" rx="2" fill="rgba(255,255,255,0.12)" />
            <rect x="600" y="388" width="44" height="9" rx="2" fill="#F2F2F2" />
            <text x="728" y="397" fill="#fff" fontSize="11" fontWeight="700" textAnchor="end">
              44%
            </text>
          </g>
        </svg>
      </div>
      <figcaption className="mt-3 text-center text-xs text-white/50">Illustration — not real match data</figcaption>
    </figure>
  );
}
