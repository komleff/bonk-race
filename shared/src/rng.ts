/**
 * Deterministic LCG (Linear Congruential Generator) RNG.
 * Used for seed-based track generation (GDD §4.1): seed = hash(date).
 * Must live in shared/ so both client and server use the same implementation.
 */
export class Rng {
    private state: number;

    constructor(seed: number) {
        this.state = seed >>> 0;
    }

    next(): number {
        // LCG parameters from Numerical Recipes
        this.state = (this.state * 1664525 + 1013904223) >>> 0;
        return this.state / 0x100000000;
    }

    range(min: number, max: number): number {
        return min + (max - min) * this.next();
    }

    int(min: number, max: number): number {
        return Math.floor(this.range(min, max));
    }
}
