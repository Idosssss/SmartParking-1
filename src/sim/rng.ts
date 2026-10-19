/** Small seeded random-number helpers so every simulation run can be reproduced exactly. */

export type Rng = () => number;

/** mulberry32: a tiny, fast PRNG with good statistical quality for simulation work. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes several integers into one 32-bit seed (so "day 17 of seed 2026" is always the same day). */
export function hashSeed(...parts: number[]): number {
  let h = 0x811c9dc5;
  for (const p of parts) {
    h ^= p >>> 0;
    h = Math.imul(h, 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

export function normalSample(rng: Rng): number {
  let u = 0;
  while (u === 0) u = rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Lognormal with the given arithmetic mean and log-space standard deviation `sigma`. */
export function lognormalSample(rng: Rng, mean: number, sigma: number): number {
  const mu = Math.log(mean) - (sigma * sigma) / 2;
  return Math.exp(mu + sigma * normalSample(rng));
}

/** Poisson sample (Knuth). Fine for the small means (< 60) used here. */
export function poissonSample(rng: Rng, mean: number): number {
  if (mean <= 0) return 0;
  const limit = Math.exp(-mean);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > limit);
  return k - 1;
}
