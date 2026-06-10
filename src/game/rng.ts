/** Seedable PRNG (mulberry32). All game logic randomness must flow through this —
 * never Math.random() — so simulations and replays are deterministic. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, max). */
  int(max: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** True with probability p. */
  chance(p: number): boolean;
  /** Normal-ish sample (mean 0, sd 1) via sum of uniforms. */
  gauss(): number;
}

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (max) => Math.floor(next() * max),
    range: (min, max) => min + next() * (max - min),
    chance: (p) => next() < p,
    gauss: () => (next() + next() + next() + next() - 2) * Math.sqrt(3),
  };
}
