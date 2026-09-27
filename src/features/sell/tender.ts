/** Notes a customer is likely to hand over: the exact amount, then the next ₹100, ₹500 and ₹2,000. */
export function quickCash(net: number) {
  const exact = Math.ceil(net);
  const options = new Set<number>([exact]);
  for (const step of [100, 500, 2000]) {
    let next = Math.ceil(net / step) * step;
    if (next <= exact) next += step;
    options.add(next);
  }
  return [...options].sort((a, b) => a - b).slice(0, 4);
}
