// Re-export from shared package (canonical source)
// Server imports still use "../utils/rng" — this re-export avoids breaking them.
export { Rng } from "@bonk-race/shared";
