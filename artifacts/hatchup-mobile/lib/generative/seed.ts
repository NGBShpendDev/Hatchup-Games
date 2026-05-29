/** Mulberry32 — fast, high-quality, seeded PRNG. Always produces the same sequence for the same seed. */
export function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function rng(): number {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

export interface Rng {
  next(): number;
  pick<T>(arr: readonly T[]): T;
  range(min: number, max: number): number;
  int(min: number, max: number): number;
  bool(p?: number): boolean;
}

export function seededRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    pick: <T>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)]!,
    range: (min, max) => min + next() * (max - min),
    int:   (min, max) => Math.floor(min + next() * (max - min + 1)),
    bool:  (p = 0.5)  => next() < p,
  };
}
