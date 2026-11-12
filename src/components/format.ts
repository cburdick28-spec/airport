export function money(n: number): string {
  const r = Math.round(n);
  return (r < 0 ? "-$" : "$") + Math.abs(r).toLocaleString("en-US");
}

export function clock(minutes: number): string {
  const day = Math.floor(minutes / 1440) + 1;
  const m = Math.floor(minutes % 1440);
  const hh = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `Day ${day} · ${hh}:${mm}`;
}
