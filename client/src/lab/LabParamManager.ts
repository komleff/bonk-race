/**
 * LabParamManager — управление параметрами, извлечённое из BonkLab.
 *
 * Обрабатывает обновления плоских параметров, применение изменений вложенных конфигов,
 * авто-синхронизацию плотности орбов и построение начальной карты параметров.
 *
 * Однонаправленная зависимость: BonkLab → LabParamManager (не наоборот).
 */

import type { SlimeConfig, WorldPhysicsConfig, SurfaceConfig } from "@bonk-race/shared";
import { clampSurfaceConfig } from "@bonk-race/shared";
import type { SandboxOrb } from "./labTypes";

// ─── UpdateEffect ────────────────────────────────────────────────────────────

export interface UpdateEffect {
    regenerateArena?: boolean;
    massChanged?: boolean;
    newDensity?: number;
}

// ─── setNestedValue ──────────────────────────────────────────────────────────

/**
 * Установить глубокое свойство объекта по dotted-пути.
 * Пример: setNestedValue(obj, "propulsion.thrustForwardN", 5000)
 */
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
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

    /** Внешний массив орбов — задаётся BonkLab для обновления масс в autoSyncOrbDensity */
    orbs: SandboxOrb[] = [];

    constructor(
        private slimeConfig: SlimeConfig,
        private worldPhysics: WorldPhysicsConfig,
        private zoneSurfaces: Record<string, SurfaceConfig>,
        initialMass: number,
    ) {
        this.mass = initialMass;
        this.params = {};
    }

    update(key: string, value: number | boolean | string): UpdateEffect {
        this.params[key] = value;

        // Обработка специальных ключей
        if (key === "mass") {
            this.mass = value as number;
            // Авто-синхронизация плотности орбов (если пользователь не задал вручную)
            if (!this.orbDensityManual) {
                this.autoSyncOrbDensity();
            }
            return { massChanged: true };
        }

        if (key === "geometry.baseRadiusM") {
            setNestedValue(this.slimeConfig as unknown as Record<string, unknown>, key, value);
            // Авто-синхронизация плотности орбов
            if (!this.orbDensityManual) {
                this.autoSyncOrbDensity();
            }
            return {};
        }

        if (key === "arena.objectDensity") {
            return { regenerateArena: true, newDensity: value as number };
        }

        // Параметры геометрии арены → перегенерация арены
        if (key.startsWith("arena.")) {
            return { regenerateArena: true };
        }

        // Параметры орбов → перегенерация арены (орбы генерируются из seed)
        if (key.startsWith("orbs.")) {
            if (key === "orbs.density") {
                this.orbDensityManual = true;
            }
            if (key !== "orbs.spikeKill") {
                return { regenerateArena: true };
            }
            return {};
        }

        // Параметры зонных поверхностей (напр. "zone.ice.forwardDragMultiplier")
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

        // Параметры worldPhysics
        if (key.startsWith("worldPhysics.")) {
            const wpKey = key.replace("worldPhysics.", "");
            setNestedValue(this.worldPhysics as unknown as Record<string, unknown>, wpKey, value);
            // Перегенерация арены при изменении размеров карты
            if (wpKey === "widthM" || wpKey === "heightM") {
                return { regenerateArena: true };
            }
            return {};
        }

        // spike.* и trail.* хранятся только в плоских параметрах, не в slimeConfig
        if (key.startsWith("spike.") || key.startsWith("trail.")) {
            return {};
        }

        // Все остальные ключи маппятся на slimeConfig
        setNestedValue(this.slimeConfig as unknown as Record<string, unknown>, key, value);
        return {};
    }

    /**
     * Строит плоский Record<string, number|boolean|string> из разрешённого конфига баланса
     * для UI-панели. Ключи используют пути через точку, соответствующие структуре SlimeConfig.
     */
    buildFlatParams(lastDensity: number): Record<string, number | boolean | string> {
        const sc = this.slimeConfig;
        const wp = this.worldPhysics;

        return {
            // Масса
            "mass": this.mass,

            // Геометрия
            "geometry.baseMassKg": sc.geometry.baseMassKg,
            "geometry.baseRadiusM": sc.geometry.baseRadiusM,
            "geometry.inertiaFactor": sc.geometry.inertiaFactor,

            // Тяга
            "propulsion.thrustForwardN": sc.propulsion.thrustForwardN,
            "propulsion.thrustReverseN": sc.propulsion.thrustReverseN,
            "propulsion.thrustLateralN": sc.propulsion.thrustLateralN,
            "propulsion.turnTorqueNm": sc.propulsion.turnTorqueNm,

            // Лимиты
            "limits.speedLimitForwardMps": sc.limits.speedLimitForwardMps,
            "limits.speedLimitReverseMps": sc.limits.speedLimitReverseMps,
            "limits.speedLimitLateralMps": sc.limits.speedLimitLateralMps,
            "limits.angularSpeedLimitRadps": sc.limits.angularSpeedLimitRadps,

            // Ассист
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

            // Зона реверса (заблокировано — не реализовано)
            "assist.reverseZoneAngleDeg": 0,

            // Экспоненты масштабирования по массе
            "massScaling.thrustForwardN.exp": sc.massScaling.thrustForwardN.exp ?? 0,
            "massScaling.thrustReverseN.exp": sc.massScaling.thrustReverseN.exp ?? 0,
            "massScaling.thrustLateralN.exp": sc.massScaling.thrustLateralN.exp ?? 0,
            "massScaling.turnTorqueNm.exp": sc.massScaling.turnTorqueNm.exp ?? 0,
            "massScaling.speedLimitForwardMps.exp": sc.massScaling.speedLimitForwardMps.exp ?? 0,
            "massScaling.speedLimitReverseMps.exp": sc.massScaling.speedLimitReverseMps.exp ?? 0,
            "massScaling.speedLimitLateralMps.exp": sc.massScaling.speedLimitLateralMps.exp ?? 0,
            "massScaling.angularSpeedLimitRadps.exp": sc.massScaling.angularSpeedLimitRadps.exp ?? 0,

            // Генерация арены
            "arena.objectDensity": lastDensity,

            // Геометрия арены (ТЗ v1.2 §A5)
            "arena.pillarRadius": sc.geometry.baseRadiusM,
            "arena.spikeRadius": sc.geometry.baseRadiusM,
            "arena.passageRadius": sc.geometry.baseRadiusM,
            "arena.passageGap": sc.geometry.baseRadiusM * 2 * 1.2,

            // Орбы (ТЗ v1.2 §A7)
            "orbs.count": 25,
            "orbs.density": this.mass / (Math.PI * sc.geometry.baseRadiusM * sc.geometry.baseRadiusM),
            "orbs.minRadius": 5,
            "orbs.maxRadius": 25,
            "orbs.minSpeed": 0,
            "orbs.maxSpeed": 50,
            "orbs.spikeKill": true,

            // Физика мира
            "worldPhysics.widthM": wp.widthM ?? 800,
            "worldPhysics.heightM": wp.heightM ?? 10130,
            "worldPhysics.forwardDragK": wp.forwardDragK,
            "worldPhysics.lateralGripMultiplier": wp.lateralGripMultiplier,
            "worldPhysics.angularDragK": wp.angularDragK,
            "worldPhysics.restitution": wp.restitution,
            "worldPhysics.passageRestitution": wp.restitution * 0.5,

            // Параметры шипов
            "spike.killOnHit": false,
            "spike.destroyOnHit": false,
            "spike.knockbackImpulse": 30_000,

            // Следы (значения по умолчанию)
            "trail.enabled": true,
            "trail.maxAge": 1.0,
            "trail.baseAlpha": 0.6,
            "trail.pattern": "drift",
            "trail.primaryColor": "#44aaff",
            "trail.driftColor": "#ffff00",
            "trail.rainbowPeriodSec": 2.0,
            // Переопределения зонных поверхностей (из SURFACE_PRESETS по умолчанию)
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

    /** Пересчитать плотность орбов из массы/радиуса игрока и обновить массы существующих орбов */
    private autoSyncOrbDensity(): void {
        const r = this.slimeConfig.geometry.baseRadiusM;
        const density = this.mass / (Math.PI * r * r);
        this.params["orbs.density"] = density;
        // Обновить массы живых орбов согласно новой плотности
        for (const orb of this.orbs) {
            if (orb.alive) {
                orb.mass = density * Math.PI * orb.radius * orb.radius;
            }
        }
    }
}
