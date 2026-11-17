"use client";

import { useState } from "react";
import {
  BUILD,
  DRIVER_HIRE_COST,
  DRIVER_WAGE,
  FEES,
  LOAN_RATE,
  LOAN_STEP,
  MARKETING_COST,
  SNOW_CREW_HIRE,
  SNOW_CREW_WAGE,
  type Category,
} from "@/game/constants";
import { maxLoan } from "@/game/simulation";
import type { GameState, TileType } from "@/game/types";
import { money } from "./format";
import { store } from "./store";

const TABS: { id: Category; label: string }[] = [
  { id: "landside", label: "Landside" },
  { id: "terminal", label: "Terminal / TSA" },
  { id: "airside", label: "Airside / Gates" },
  { id: "staff", label: "Staff / Upgrades" },
];

const SWATCH: Record<string, string> = {
  parking: "bg-slate-500",
  shuttle: "bg-yellow-400",
  sidewalk: "bg-stone-300",
  floor: "bg-amber-50",
  checkin: "bg-blue-600",
  tsa: "bg-violet-600",
  customs: "bg-teal-600",
  gate: "bg-green-600",
  runway: "bg-slate-700",
  taxiway: "bg-slate-400",
  tower: "bg-sky-300",
};

function Item(props: {
  active?: boolean;
  swatch?: string;
  title: string;
  sub: string;
  hint: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={props.onClick}
      title={props.hint}
      className={`flex min-w-[9.5rem] shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-left transition ${
        props.active
          ? "border-sky-400 bg-sky-500/20"
          : "border-slate-700 bg-slate-800 hover:border-slate-500 hover:bg-slate-700"
      } ${props.disabled ? "opacity-50" : ""}`}
    >
      {props.swatch && <span className={`h-6 w-6 shrink-0 rounded ${props.swatch}`} />}
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold">{props.title}</span>
        <span className="text-xs text-slate-400">{props.sub}</span>
      </span>
    </button>
  );
}

export default function BuildMenu({ s }: { s: GameState }) {
  const [tab, setTab] = useState<Category>("landside");
  const tool = store.tool;
  const types = (Object.keys(BUILD) as Exclude<TileType, "empty">[]).filter((t) => BUILD[t].category === tab);
  const marketingOn = s.time < s.marketingUntil;

  return (
    <footer className="border-t border-slate-700 bg-slate-900 px-3 pb-3 pt-2">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-md px-3 py-1 text-sm font-semibold ${
              tab === t.id ? "bg-slate-100 text-slate-900" : "text-slate-300 hover:bg-slate-800"
            }`}
          >
            {t.label}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => store.setTool(tool?.kind === "upgrade" ? null : { kind: "upgrade" })}
            title="Click a building to upgrade it (U)"
            className={`rounded-md border px-3 py-1 text-sm font-semibold ${
              tool?.kind === "upgrade" ? "border-violet-400 bg-violet-500/30" : "border-slate-600 hover:bg-slate-800"
            }`}
          >
            Upgrade
          </button>
          <button
            onClick={() => store.setTool(tool?.kind === "bulldoze" ? null : { kind: "bulldoze" })}
            title="Demolish for a 50% refund (B). Drag to clear several tiles."
            className={`rounded-md border px-3 py-1 text-sm font-semibold ${
              tool?.kind === "bulldoze" ? "border-rose-400 bg-rose-500/30" : "border-slate-600 hover:bg-slate-800"
            }`}
          >
            Bulldoze
          </button>
          <button
            onClick={() => store.setTool(null)}
            title="Stop building and inspect tiles (Esc)"
            className={`rounded-md border px-3 py-1 text-sm font-semibold ${
              tool === null ? "border-sky-400 bg-sky-500/20" : "border-slate-600 hover:bg-slate-800"
            }`}
          >
            Inspect
          </button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {tab !== "staff" &&
          types.map((t) => {
            const def = BUILD[t];
            return (
              <Item
                key={t}
                active={tool?.kind === "build" && tool.type === t}
                swatch={SWATCH[t]}
                title={t === "gate" ? "Gate (Small)" : def.name}
                sub={`${money(def.cost[0])} · ${money(def.upkeep[0])}/hr`}
                hint={def.desc}
                disabled={s.money < def.cost[0]}
                onClick={() => store.setTool({ kind: "build", type: t })}
              />
            );
          })}
        {tab === "airside" && (
          <Item
            swatch="bg-amber-600"
            title="Medium / Large / Jumbo"
            sub="Upgrade a Small gate"
            hint="Pick the Upgrade tool, then click a gate. Medium +$8,000, Large +$16,000, Jumbo +$30,000 (for Super Jumbos)."
            active={tool?.kind === "upgrade"}
            onClick={() => store.setTool({ kind: "upgrade" })}
          />
        )}
        {tab === "staff" && (
          <>
            <Item
              swatch="bg-yellow-400"
              title="Hire Shuttle Driver"
              sub={`${money(DRIVER_HIRE_COST)} · ${money(DRIVER_WAGE)}/hr`}
              hint="Adds one bus to the shuttle loop."
              onClick={() => store.staff("hire")}
            />
            <Item
              swatch="bg-slate-500"
              title="Dismiss Driver"
              sub={`${s.drivers} on payroll`}
              hint="Removes one bus and its hourly wage."
              disabled={s.drivers === 0}
              onClick={() => store.staff("fire")}
            />
            <Item
              swatch="bg-cyan-200"
              title="Hire Snow Crew"
              sub={`${money(SNOW_CREW_HIRE)} · ${money(SNOW_CREW_WAGE)}/hr`}
              hint="Each crew keeps one runway plowed during snow (longest runways first)."
              onClick={() => store.staff("snowHire")}
            />
            <Item
              swatch="bg-slate-500"
              title="Dismiss Snow Crew"
              sub={`${s.snowCrews} on payroll`}
              hint="Saves the wage, but one fewer runway stays open in snow."
              disabled={s.snowCrews === 0}
              onClick={() => store.staff("snowFire")}
            />
            <Item
              swatch="bg-emerald-500"
              title={`Borrow ${money(LOAN_STEP)}`}
              sub={`${money(s.loan)} of ${money(maxLoan(s))} used`}
              hint={`Bank loan at ${LOAN_RATE * 100}% interest a day, charged hourly. Repay any time.`}
              disabled={s.loan + LOAN_STEP > maxLoan(s)}
              onClick={() => store.staff("loan")}
            />
            <Item
              swatch="bg-emerald-800"
              title="Repay Loan"
              sub={s.loan > 0 ? `${money(Math.min(LOAN_STEP, s.loan))} now` : "No loan"}
              hint="Pays back part of the loan to stop the interest."
              disabled={s.loan === 0}
              onClick={() => store.staff("repay")}
            />
            <div className="flex shrink-0 flex-col justify-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5">
              <span className="text-xs text-slate-400">Airport fees</span>
              <div className="flex overflow-hidden rounded border border-slate-600 text-xs">
                {FEES.map((f, i) => (
                  <button
                    key={f.name}
                    onClick={() => store.setFees(i)}
                    title={`${Math.round(f.revenue * 100)}% landing fees and commissions, ${Math.round(f.demand * 100)}% passenger demand`}
                    className={`px-2 py-0.5 font-semibold ${s.fees === i ? "bg-sky-500 text-white" : "hover:bg-slate-700"}`}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
            <Item
              swatch="bg-pink-500"
              title="Marketing Campaign"
              sub={marketingOn ? "Running: +35% demand" : `${money(MARKETING_COST)} · 12h`}
              hint="Boosts passenger demand by 35% for 12 hours."
              disabled={marketingOn}
              onClick={() => store.staff("marketing")}
            />
            <Item
              swatch="bg-violet-500"
              title="Upgrade Tool"
              sub="Faster desks, bigger gates"
              hint="Click a parking lot, check-in, TSA, customs, gate or control tower to level it up. More TSA agents = faster screening."
              active={tool?.kind === "upgrade"}
              onClick={() => store.setTool({ kind: "upgrade" })}
            />
          </>
        )}
      </div>
    </footer>
  );
}
