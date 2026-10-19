import { mulberry32 } from './rng';

export function mean(values: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i];
  return values.length === 0 ? 0 : sum / values.length;
}

export function sd(values: ArrayLike<number>): number {
  const n = values.length;
  if (n < 2) return 0;
  const m = mean(values);
  let acc = 0;
  for (let i = 0; i < n; i++) acc += (values[i] - m) ** 2;
  return Math.sqrt(acc / (n - 1));
}

export function sum(values: ArrayLike<number>): number {
  let total = 0;
  for (let i = 0; i < values.length; i++) total += values[i];
  return total;
}

/** q-quantile (0..1) of integer-valued data held as a value -> count map. */
export function histogramQuantile(hist: Map<number, number>, q: number): number {
  const keys = [...hist.keys()].sort((a, b) => a - b);
  let total = 0;
  for (const k of keys) total += hist.get(k)!;
  const target = q * total;
  let run = 0;
  for (const k of keys) {
    run += hist.get(k)!;
    if (run >= target) return k;
  }
  return keys.length ? keys[keys.length - 1] : 0;
}

export function histogramMean(hist: Map<number, number>): number {
  let total = 0;
  let acc = 0;
  for (const [k, c] of hist) {
    total += c;
    acc += k * c;
  }
  return total === 0 ? 0 : acc / total;
}

export function histogramSd(hist: Map<number, number>): number {
  const m = histogramMean(hist);
  let total = 0;
  let acc = 0;
  for (const [k, c] of hist) {
    total += c;
    acc += c * (k - m) ** 2;
  }
  return total < 2 ? 0 : Math.sqrt(acc / (total - 1));
}

/** Normal-approximation 95% confidence interval of a mean (valid: we always average hundreds of independent days). */
export function meanCI95(values: ArrayLike<number>): { mean: number; lo: number; hi: number; se: number } {
  const m = mean(values);
  const se = sd(values) / Math.sqrt(Math.max(values.length, 1));
  return { mean: m, lo: m - 1.96 * se, hi: m + 1.96 * se, se };
}

/**
 * Percentile bootstrap 95% CI of the reduction 1 - sum(other) / sum(base), resampling whole days
 * (days are the independent units, cars within a day are not).
 */
export function bootstrapReductionCI(base: ArrayLike<number>, other: ArrayLike<number>, resamples: number, seed: number): { lo: number; hi: number } {
  const n = base.length;
  const rng = mulberry32(seed);
  const draws = new Float64Array(resamples);
  for (let r = 0; r < resamples; r++) {
    let sb = 0;
    let so = 0;
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rng() * n);
      sb += base[j];
      so += other[j];
    }
    draws[r] = sb === 0 ? 0 : 1 - so / sb;
  }
  const sorted = Array.from(draws).sort((a, b) => a - b);
  return { lo: sorted[Math.floor(0.025 * (resamples - 1))], hi: sorted[Math.ceil(0.975 * (resamples - 1))] };
}
