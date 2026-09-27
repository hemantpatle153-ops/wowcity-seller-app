/** Notes a customer is likely to hand over for this amount: exact, then the next 50/100/500/2000. */
export function quickCash(net: number) {
  const options = new Set<number>([Math.ceil(net)]);
  for (const step of [50, 100, 500, 2000]) {
    const next = Math.ceil(net / step) * step;
    if (next > net) options.add(next);
  }
  return [...options].sort((a, b) => a - b).slice(0, 4);
}
