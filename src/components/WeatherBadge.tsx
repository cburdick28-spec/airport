"use client";

import { WEATHER, compass } from "@/game/weather";
import type { WeatherSpell } from "@/game/types";

const TONE: Record<string, string> = {
  clear: "text-sky-300",
  cloudy: "text-slate-300",
  rain: "text-blue-300",
  storm: "text-rose-300",
  fog: "text-amber-200",
  snow: "text-white",
};

/** small compass with an arrow showing which way the wind blows */
export function WindArrow({ dir, size = 26 }: { dir: number; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden>
      <circle r="11" fill="none" stroke="#475569" strokeWidth="1.5" />
      <text y="-6.5" textAnchor="middle" fontSize="5" fill="#94a3b8">
        N
      </text>
      {/* the arrow points downwind: the wind comes FROM dir */}
      <g transform={`rotate(${dir + 180})`}>
        <path d="M0 -8 L3.5 2 L0 0 L-3.5 2 Z" fill="#e2e8f0" />
        <line x1="0" y1="0" x2="0" y2="8" stroke="#e2e8f0" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

export default function WeatherBadge({ w }: { w: WeatherSpell }) {
  return (
    <div className="flex items-center gap-2" title={`Wind from the ${compass(w.windDir)} at ${w.windSpeed} knots`}>
      <WindArrow dir={w.windDir} />
      <div className="flex flex-col leading-tight">
        <span className="text-[10px] uppercase tracking-wider text-slate-400">Weather</span>
        <span className={`text-sm font-semibold ${TONE[w.kind]}`}>
          {WEATHER[w.kind].name} · {w.windSpeed} kt {compass(w.windDir)}
        </span>
      </div>
    </div>
  );
}
