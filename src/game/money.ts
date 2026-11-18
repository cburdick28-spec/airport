/** "$4M", "$12.5M", "$1.25B", "$450K", "-$3.1M" */
export function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  const a = Math.abs(n);
  const trim = (v: number, d: number) => String(parseFloat(v.toFixed(d)));
  let body: string;
  if (a >= 1e9) body = trim(a / 1e9, a >= 1e10 ? 1 : 2) + "B";
  else if (a >= 1e6) body = trim(a / 1e6, a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2) + "M";
  else if (a >= 1e3) body = Math.round(a / 1e3) + "K";
  else body = String(Math.round(a));
  return sign + "$" + body;
}

/** "12h", "3h 20m", "45m" */
export function duration(minutes: number): string {
  const m = Math.max(0, Math.ceil(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r}m`;
  return r === 0 ? `${h}h` : `${h}h ${r}m`;
}
