import fs from "fs";
import path from "path";
import { resolveBalanceConfig, ResolvedBalanceConfig } from "@bonk-race/shared";

// Candidates for balance.json location (works for both src and dist)
const CANDIDATES = [
    // dev: server/src/config → 3 levels up to project root
    path.resolve(__dirname, "..", "..", "..", "config", "balance.json"),
    // prod: server/dist/server/src/config → 5 levels up to project root
    path.resolve(__dirname, "..", "..", "..", "..", "..", "config", "balance.json"),
    // fallback: cwd-based (custom launches)
    path.resolve(process.cwd(), "config", "balance.json"),
    path.resolve(process.cwd(), "..", "config", "balance.json"),
];

function findConfigPath(): string {
    for (const candidate of CANDIDATES) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }
    throw new Error(
        `balance.json not found. Searched:\n${CANDIDATES.join("\n")}`
    );
}

const DEFAULT_CONFIG_PATH = findConfigPath();

export function loadBalanceConfig(configPath = DEFAULT_CONFIG_PATH): ResolvedBalanceConfig {
    const raw = fs.readFileSync(configPath, "utf-8");
    const data = JSON.parse(raw) as unknown;
    return resolveBalanceConfig(data);
}
