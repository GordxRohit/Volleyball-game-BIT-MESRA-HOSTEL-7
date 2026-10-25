// Small seeded PRNG (mulberry32) for reproducible environmental detail placement.
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private fn: () => number;
  constructor(seed = 1337) {
    this.fn = mulberry32(seed);
  }
  next() {
    return this.fn();
  }
  range(min: number, max: number) {
    return min + this.fn() * (max - min);
  }
  int(min: number, max: number) {
    return Math.floor(this.range(min, max + 1));
  }
  pick<T>(arr: T[]): T {
    return arr[Math.floor(this.fn() * arr.length) % arr.length];
  }
}
