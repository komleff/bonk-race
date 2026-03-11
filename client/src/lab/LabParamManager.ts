/**
 * LabParamManager — extracted parameter management logic from BonkLab.
 *
 * Handles flat param updates, nested config patching, auto-sync of orb density,
 * and building the initial flat params map from resolved balance configs.
 *
 * One-way dependency: BonkLab → LabParamManager (never the reverse).
 */

import type { SlimeConfig, WorldPhysicsConfig, SurfaceConfig } from "@bonk-race/shared";
import { clampSurfaceConfig } from "@bonk-race/shared";
import type { SandboxOrb } from "./labTypes";

// ─── UpdateEffect ────────────────────────────────────────────────────────────

export interface UpdateEffect {
    regenerateArena?: boolean;
    massChanged?: boolean;
}

// ─── setNestedValue ──────────────────────────────────────────────────────────

/**
 * Set a deep property on a nested object using a dotted key path.
 * e.g. setNestedValue(obj, "propulsion.thrustForwardN", 5000)
 */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
    const keys = path.split(".");
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (UNSAFE_KEYS.has(key)) return;
        if (current[key] === undefined || typeof current[key] !== "object") {
            current[key] = {};
        }
        current = current[key] as Record<string, unknown>;
    }
    const finalKey = keys[keys.length - 1];
    if (UNSAFE_KEYS.has(finalKey)) return;
    current[finalKey] = value;
}

// ─── LabParamManager ─────────────────────────────────────────────────────────

export class LabParamManager {
    params: Record<string, number | boolean | string>;
    mass: number;
    orbDensityManual = false;

    /** External orbs array — set by BonkLab so autoSyncOrbDensity can update masses */
    orbs: SandboxOrb[] = [];

    /** Last arena density (updated when "arena.objectDensity" is set) */
    lastDensity: number;

    constructor(
        private slimeConfig: SlimeConfig,
        private worldPhysics: WorldPhysicsConfig,
        private zoneSurfaces: Record<string, SurfaceConfig>,
        initialMass: number,
        lastDensity: number,
    ) {
        this.lastDensity = lastDensity;
        this.mass = initialMass;
        this.params = {};
    }

    update(key: string, value: number | boolean | string): UpdateEffect {
        this.params[key] = value;

        // Handle special keys
        if (key === "mass") {
            this.mass = value as number;
            // Auto-sync orb density (unless user manually overrode it)
            if (!this.orbDensityManual) {
                this.autoSyncOrbDensity();
            }
            return { massChanged: true };
        }

        if (key === "geometry.baseRadiusM") {
            setNestedValue(this.slimeConfig as unknown as Record<string, unknown>, key, value);
            // Auto-sync orb density
            if (!this.orbDensityManual) {
                this.autoSyncOrbDensity();
            }
            return {};
        }

        if (key === "arena.objectDensity") {
            this.lastDensity = value as number;
            return { regenerateArena: true };
        }

        // Arena geometry params → regenerate arena
        if (key.startsWith("arena.")) {
            return { regenerateArena: true };
        }

        // Orb params → regenerate arena (orbs are generated from seed)
        if (key.startsWith("orbs.")) {
            if (key === "orbs.density") {
                this.orbDensityManual = true;
            }
            if (key !== "orbs.spikeKill") {
                return { regenerateArena: true };
            }
            return {};
        }

        // Zone surface params (e.g. "zone.ice.forwardDragMultiplier")
        if (key.startsWith("zone.")) {
            const parts = key.split(".");
            if (parts.length === 3) {
                const zoneName = parts[1];
                const field = parts[2] as keyof SurfaceConfig;
                const surface = this.zoneSurfaces[zoneName];
                if (surface && field in surface) {
                    (surface as unknown as Record<string, number>)[field] = value as number;
                    // Валидация диапазонов
                    const clamped = clampSurfaceConfig(surface);
                    Object.assign(surface, clamped);
                }
            }
            return {};
        }

        // Map worldPhysics params
        if (key.startsWith("worldPhysics.")) {
            const wpKey = key.replace("worldPhysics.", "");
            setNestedValue(this.worldPhysics as unknown as Record<string, unknown>, wpKey, value);
            // Re-generate arena when map dimensions change
            if (wpKey === "widthM" || wpKey === "heightM") {
                return { regenerateArena: true };
            }
            return {};
        }

        // All other keys map to slimeConfig
        setNestedValue(this.slimeConfig as unknown as Record<string, unknown>, key, value);
        return {};
    }

    /**
     * Builds a flat Record<string, number|boolean|string> from the resolved balance config
     * for use by the UI panel. Keys use dotted paths matching the SlimeConfig structure.
     */
    buildFlatParams(): Record<string, number | boolean | string> {
        const sc = this.slimeConfig;
        const wp = this.worldPhysics;

        return {
            // Mass
            "mass": this.mass,

            // Geometry
            "geometry.baseMassKg": sc.geometry.baseMassKg,
            "geometry.baseRadiusM": sc.geometry.baseRadiusM,
            "geometry.inertiaFactor": sc.geometry.inertiaFactor,

            // Propulsion
            "propulsion.thrustForwardN": sc.propulsion.thrustForwardN,
            "propulsion.thrustReverseN": sc.propulsion.thrustReverseN,
            "propulsion.thrustLateralN": sc.propulsion.thrustLateralN,
            "propulsion.turnTorqueNm": sc.propulsion.turnTorqueNm,

            // Limits
            "limits.speedLimitForwardMps": sc.limits.speedLimitForwardMps,
            "limits.speedLimitReverseMps": sc.limits.speedLimitReverseMps,
            "limits.speedLimitLateralMps": sc.limits.speedLimitLateralMps,
            "limits.angularSpeedLimitRadps": sc.limits.angularSpeedLimitRadps,

            // Assist
            "assist.comfortableBrakingTimeS": sc.assist.comfortableBrakingTimeS,
            "assist.angularStopTimeS": sc.assist.angularStopTimeS,
            "assist.angularBrakeBoostFactor": sc.assist.angularBrakeBoostFactor,
            "assist.autoBrakeMaxThrustFraction": sc.assist.autoBrakeMaxThrustFraction,
            "assist.overspeedDampingRate": sc.assist.overspeedDampingRate,
            "assist.yawFullDeflectionAngleRad": sc.assist.yawFullDeflectionAngleRad,
            "assist.yawOscillationWindowFrames": sc.assist.yawOscillationWindowFrames,
            "assist.yawOscillationSignFlipsThreshold": sc.assist.yawOscillationSignFlipsThreshold,
            "assist.yawDampingBoostFactor": sc.assist.yawDampingBoostFactor,
            "assist.yawCmdEps": sc.assist.yawCmdEps,
            "assist.angularDeadzoneRad": sc.assist.angularDeadzoneRad,
            "assist.yawRateGain": sc.assist.yawRateGain,
            "assist.reactionTimeS": sc.assist.reactionTimeS,
            "assist.accelTimeS": sc.assist.accelTimeS,
            "assist.velocityErrorThreshold": sc.assist.velocityErrorThreshold,
            "assist.inputMagnitudeThreshold": sc.assist.inputMagnitudeThreshold,
            "assist.counterAccelEnabled": sc.assist.counterAccelEnabled,
            "assist.counterAccelDirectionThresholdDeg": sc.assist.counterAccelDirectionThresholdDeg,
            "assist.counterAccelTimeS": sc.assist.counterAccelTimeS,
            "assist.counterAccelMinSpeedMps": sc.assist.counterAccelMinSpeedMps,

            // Reverse zone (locked — not yet implemented)
            "assist.reverseZoneAngleDeg": 0,

            // Mass scaling exponents
            "massScaling.thrustForwardN.exp": sc.massScaling.thrustForwardN.exp ?? 0,
            "massScaling.thrustReverseN.exp": sc.massScaling.thrustReverseN.exp ?? 0,
            "massScaling.thrustLateralN.exp": sc.massScaling.thrustLateralN.exp ?? 0,
            "massScaling.turnTorqueNm.exp": sc.massScaling.turnTorqueNm.exp ?? 0,
            "massScaling.speedLimitForwardMps.exp": sc.massScaling.speedLimitForwardMps.exp ?? 0,
            "massScaling.speedLimitReverseMps.exp": sc.massScaling.speedLimitReverseMps.exp ?? 0,
            "massScaling.speedLimitLateralMps.exp": sc.massScaling.speedLimitLateralMps.exp ?? 0,
            "massScaling.angularSpeedLimitRadps.exp": sc.massScaling.angularSpeedLimitRadps.exp ?? 0,

            // Arena generation
            "arena.objectDensity": this.lastDensity,

            // Arena geometry (TZ v1.2 §A5)
            "arena.pillarRadius": sc.geometry.baseRadiusM,
            "arena.spikeRadius": sc.geometry.baseRadiusM,
            "arena.passageRadius": sc.geometry.baseRadiusM,
            "arena.passageGap": sc.geometry.baseRadiusM * 2 * 1.2,

            // Orbs (TZ v1.2 §A7)
            "orbs.count": 25,
            "orbs.density": this.mass / (Math.PI * sc.geometry.baseRadiusM * sc.geometry.baseRadiusM),
            "orbs.minRadius": 5,
            "orbs.maxRadius": 25,
            "orbs.minSpeed": 0,
            "orbs.maxSpeed": 50,
            "orbs.spikeKill": true,

            // World physics
            "worldPhysics.widthM": wp.widthM ?? 800,
            "worldPhysics.heightM": wp.heightM ?? 10130,
            "worldPhysics.forwardDragK": wp.forwardDragK,
            "worldPhysics.lateralGripMultiplier": wp.lateralGripMultiplier,
            "worldPhysics.angularDragK": wp.angularDragK,
            "worldPhysics.restitution": wp.restitution,
            "worldPhysics.passageRestitution": wp.restitution * 0.5,

            // Spike options
            "spike.killOnHit": false,
            "spike.destroyOnHit": false,
            "spike.knockbackImpulse": 30_000,

            // Trail defaults
            "trail.enabled": true,
            "trail.maxAge": 1.2,
            "trail.baseAlpha": 0.6,
            "trail.pattern": "drift",
            "trail.primaryColor": "#44aaff",
            "trail.driftColor": "#ffff00",
            "trail.rainbowPeriodSec": 2.0,
            // Zone surface overrides (from SURFACE_PRESETS defaults)
            ...this.buildZoneParams(),
        };
    }

    private buildZoneParams(): Record<string, number> {
        const result: Record<string, number> = {};
        for (const [zoneName, surface] of Object.entries(this.zoneSurfaces)) {
            for (const [field, value] of Object.entries(surface)) {
                result[`zone.${zoneName}.${field}`] = value as number;
            }
        }
        return result;
    }

    /** Recalculate orb density from player mass/radius and update existing orb masses */
    private autoSyncOrbDensity(): void {
        const r = this.slimeConfig.geometry.baseRadiusM;
        const density = this.mass / (Math.PI * r * r);
        this.params["orbs.density"] = density;
        // Update masses of existing live orbs to reflect new density
        for (const orb of this.orbs) {
            if (orb.alive) {
                orb.mass = density * Math.PI * orb.radius * orb.radius;
            }
        }
    }
}
