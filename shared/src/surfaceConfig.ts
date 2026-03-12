/**
 * SurfaceConfig — unified surface zone configuration.
 *
 * Combines ISurfaceParams (integrator) and ISurfaceAssistParams (flightAssist)
 * into a single per-zone config with named presets and zone-type mapping.
 */

import type { ISurfaceParams } from "./physics/integrator";
import type { ISurfaceAssistParams } from "./physics/flightAssist";
import { DEFAULT_SURFACE_PARAMS } from "./physics/integrator";
import { DEFAULT_SURFACE_ASSIST_PARAMS } from "./physics/flightAssist";
import {
    ZONE_TYPE_ICE,
    ZONE_TYPE_MUD,
    ZONE_TYPE_TURBO,
    ZONE_TYPE_SAND,
} from "./constants";

// ─── Combined type ──────────────────────────────────────────────────────────

export type SurfaceConfig = ISurfaceParams & ISurfaceAssistParams;

export const DEFAULT_SURFACE_CONFIG: SurfaceConfig = {
    ...DEFAULT_SURFACE_PARAMS,
    ...DEFAULT_SURFACE_ASSIST_PARAMS,
};

// ─── Utility extractors ─────────────────────────────────────────────────────

export function toSurfaceParams(config: SurfaceConfig): ISurfaceParams {
    return {
        forwardDragMultiplier: config.forwardDragMultiplier,
        lateralGripMultiplier: config.lateralGripMultiplier,
        angularDragMultiplier: config.angularDragMultiplier,
        zoneThrustN: config.zoneThrustN,
    };
}

export function toSurfaceAssistParams(config: SurfaceConfig): ISurfaceAssistParams {
    return {
        thrustMultiplier: config.thrustMultiplier,
        turnTorqueMultiplier: config.turnTorqueMultiplier,
        speedLimitMultiplier: config.speedLimitMultiplier,
    };
}

// ─── Named presets ──────────────────────────────────────────────────────────

export const SURFACE_PRESETS: Record<string, SurfaceConfig> = {
    default: { ...DEFAULT_SURFACE_CONFIG },

    ice: {
        forwardDragMultiplier: 0.05,
        lateralGripMultiplier: 0.1,
        angularDragMultiplier: 0.15,
        zoneThrustN: 0,
        thrustMultiplier: 0.6,
        turnTorqueMultiplier: 0.3,
        speedLimitMultiplier: 1.3,
    },

    mud: {
        forwardDragMultiplier: 6.0,
        lateralGripMultiplier: 5.0,
        angularDragMultiplier: 4.0,
        zoneThrustN: 0,
        thrustMultiplier: 0.4,
        turnTorqueMultiplier: 0.7,
        speedLimitMultiplier: 0.4,
    },

    turbo: {
        forwardDragMultiplier: 0.3,
        lateralGripMultiplier: 1.0,
        angularDragMultiplier: 1.0,
        zoneThrustN: 40000,
        thrustMultiplier: 1.0,
        turnTorqueMultiplier: 1.0,
        speedLimitMultiplier: 2.0,
    },

    sand: {
        forwardDragMultiplier: 2.0,
        lateralGripMultiplier: 0.5,
        angularDragMultiplier: 0.5,
        zoneThrustN: 0,
        thrustMultiplier: 0.7,
        turnTorqueMultiplier: 0.4,
        speedLimitMultiplier: 0.7,
    },
};

// ─── Zone type → SurfaceConfig mapping ──────────────────────────────────────

const ZONE_TYPE_TO_SURFACE: Record<number, SurfaceConfig> = {
    [ZONE_TYPE_ICE]: SURFACE_PRESETS.ice,
    [ZONE_TYPE_MUD]: SURFACE_PRESETS.mud,
    [ZONE_TYPE_TURBO]: SURFACE_PRESETS.turbo,
    [ZONE_TYPE_SAND]: SURFACE_PRESETS.sand,
};

export function getSurfaceConfigForZone(zoneType: number): SurfaceConfig {
    return ZONE_TYPE_TO_SURFACE[zoneType] ?? DEFAULT_SURFACE_CONFIG;
}

// ─── Runtime validation ─────────────────────────────────────────────────────

function clampField(value: number, min: number, max: number, name: string): number {
    if (!Number.isFinite(value)) {
        console.warn(`[SurfaceConfig] invalid ${name}: ${value} → using ${min}`);
        return min;
    }
    if (value < min || value > max) {
        console.warn(`[SurfaceConfig] clamping ${name}: ${value} → [${min}, ${max}]`);
        return Math.max(min, Math.min(max, value));
    }
    return value;
}

export function clampSurfaceConfig(config: SurfaceConfig): SurfaceConfig {
    return {
        forwardDragMultiplier: clampField(config.forwardDragMultiplier, 0.01, 10.0, "forwardDragMultiplier"),
        lateralGripMultiplier: clampField(config.lateralGripMultiplier, 0.01, 10.0, "lateralGripMultiplier"),
        angularDragMultiplier: clampField(config.angularDragMultiplier, 0.01, 10.0, "angularDragMultiplier"),
        zoneThrustN: clampField(config.zoneThrustN, 0, 100000, "zoneThrustN"),
        thrustMultiplier: clampField(config.thrustMultiplier, 0.0, 5.0, "thrustMultiplier"),
        turnTorqueMultiplier: clampField(config.turnTorqueMultiplier, 0.0, 5.0, "turnTorqueMultiplier"),
        speedLimitMultiplier: clampField(config.speedLimitMultiplier, 0.1, 3.0, "speedLimitMultiplier"),
    };
}
