import { MatchPhaseId, MATCH_PHASES } from "./types";

export interface FormulaConfig {
    base: number;
    scale: number;
    divisor: number;
}

export interface MatchPhaseConfig {
    id: MatchPhaseId;
    startSec: number;
    endSec: number;
}

export type MassCurveType = "power" | "log";

export interface MassCurveConfig {
    type: MassCurveType;
    exp?: number;
    k?: number;
    minValue?: number;
    maxValue?: number;
}

export type BoostType = "rage" | "haste" | "guard" | "greed";

export interface BoostConfig {
    maxStackTimeSec: number;
    rage: {
        durationSec: number;
        damageMul: number;
    };
    haste: {
        durationSec: number;
        speedMul: number;
    };
    guard: {
        durationSec: number;
        charges: number;
    };
    greed: {
        durationSec: number;
        bubbleMassMul: number;
        charges: number;
    };
    allowedByChestType: {
        rare: BoostType[];
        epic: BoostType[];
        gold: BoostType[];
    };
}

export interface MapSizeConfig {
    small: number;
    medium: number;
    large: number;
}

export interface ObstacleConfig {
    countByMapSize: MapSizeConfig;
    passageCountByMapSize: MapSizeConfig;
    passageGapWidth: number;
    passagePillarRadius: number;
    pillarRadius: number;
    spikeRadius: number;
    spikeDamagePct: number;
    spikeChance: number;
    spacing: number;
    placementRetries: number;
}

export interface SafeZoneConfig {
    finalStartSec: number;
    warningSec: number;
    damagePctPerSec: number;
    minDistance: number;
    placementRetries: number;
    countByMapSize: MapSizeConfig;
    radiusByMapSize: MapSizeConfig;
}

export interface ZoneTypeWeights {
    nectar: number;
    ice: number;
    mud: number;
    lava: number;
    turbo: number;
}

export interface ZonesConfig {
    countByMapSize: MapSizeConfig;
    radiusByMapSize: MapSizeConfig;
    minDistance: number;
    placementRetries: number;
    typeWeights: ZoneTypeWeights;
    lavaMinDistanceFromSpawn: number;
    nectar: {
        massGainPctPerSec: number;
    };
    ice: {
        frictionMultiplier: number;
    };
    mud: {
        speedMultiplier: number;
        frictionMultiplier: number;
    };
    lava: {
        damagePctPerSec: number;
        scatterPct: number;
        scatterOrbCount: number;
        scatterSpeedMps: number;
    };
    turbo: {
        speedMultiplier: number;
    };
}

export interface SlimeConfig {
    id: string;
    name: string;
    geometry: {
        baseMassKg: number;
        baseRadiusM: number;
        inertiaFactor: number;
    };
    propulsion: {
        thrustForwardN: number;
        thrustReverseN: number;
        thrustLateralN: number;
        turnTorqueNm: number;
    };
    limits: {
        speedLimitForwardMps: number;
        speedLimitReverseMps: number;
        speedLimitLateralMps: number;
        angularSpeedLimitRadps: number;
    };
    assist: {
        comfortableBrakingTimeS: number;
        angularStopTimeS: number;
        angularBrakeBoostFactor: number;
        autoBrakeMaxThrustFraction: number;
        overspeedDampingRate: number;
        yawFullDeflectionAngleRad: number;
        yawOscillationWindowFrames: number;
        yawOscillationSignFlipsThreshold: number;
        yawDampingBoostFactor: number;
        yawCmdEps: number;
        // Параметры fly-by-wire управления
        angularDeadzoneRad: number;
        yawRateGain: number;
        reactionTimeS: number;
        accelTimeS: number;
        velocityErrorThreshold: number;
        inputMagnitudeThreshold: number;
        // Параметры контр-ускорения
        counterAccelEnabled: boolean;
        counterAccelDirectionThresholdDeg: number;
        counterAccelTimeS: number;
        counterAccelMinSpeedMps: number;
    };
    combat: {
        biteDamagePctOfMass: number;
        biteVictimMassGainPct: number;
        orbBitePctOfMass: number;
    };
    massScaling: {
        minMassFactor: number;
        thrustForwardN: MassCurveConfig;
        thrustReverseN: MassCurveConfig;
        thrustLateralN: MassCurveConfig;
        turnTorqueNm: MassCurveConfig;
        speedLimitForwardMps: MassCurveConfig;
        speedLimitReverseMps: MassCurveConfig;
        speedLimitLateralMps: MassCurveConfig;
        angularSpeedLimitRadps: MassCurveConfig;
    };
}

export interface WorldPhysicsConfig {
    forwardDragK: number;
    lateralGripMultiplier: number;
    angularDragK: number;
    restitution: number;
    maxPositionCorrectionM: number;
    worldShape: "rectangle" | "circle";
    widthM?: number;
    heightM?: number;
    radiusM?: number;
}

export interface ClientNetSmoothingConfig {
    lookAheadMs: number;
    velocityWeight: number;
    catchUpSpeed: number;
    maxCatchUpSpeed: number;
    teleportThreshold: number;
    angleCatchUpSpeed: number;
}

export interface CameraConfig {
    zoomMin: number;
    zoomMax: number;
    zoomSpeed: number;
    zoomDamageHoldSec: number;
    zoomMassMin: number;
    zoomMassMax: number;
}

export interface BalanceConfig {
    world: {
        mapSize: number;
        mapSizes: number[];
    };
    server: {
        maxPlayers: number;
        tickRate: number;
        simulationIntervalMs: number;
        globalCooldownMs: number;
        abilityQueueSize: number;
    };
    match: {
        durationSec: number;
        resultsDurationSec: number;
        restartDelaySec: number;
        phases: MatchPhaseConfig[];
    };
    physics: {
        environmentDrag: number;
        collisionRestitution: number;
        collisionImpulseCap: number;
        slimeLinearDamping: number;
        orbLinearDamping: number;
        speedDampingRate: number;
        minSlimeMass: number;
        maxSlimeSpeed: number;
        maxOrbSpeed: number;
    };
    controls: {
        joystickMode: "adaptive" | "fixed";
        joystickRadius: number;
        joystickDeadzone: number;
        joystickSensitivity: number;
        joystickFollowSpeed: number;
        inputTimeoutMs: number;
        mouseDeadzone: number;
        mouseMaxDist: number;
    };
    slimeConfigs: {
        base: SlimeConfig;
        hunter: SlimeConfig;
        warrior: SlimeConfig;
        collector: SlimeConfig;
    };
    worldPhysics: WorldPhysicsConfig;
    clientNetSmoothing: ClientNetSmoothingConfig;
    camera: CameraConfig;
    slime: {
        initialMass: number;
        initialLevel: number;
        initialClassId: number;
        levelThresholds: number[];       // [180, 300, 500, 800, 1200, 1800] - пороги для lvl 2, 3, 4...
        slotUnlockLevels: number[];      // [1, 3, 5]
        talentGrantLevels: number[];     // [2, 4, 6] - уровни, дающие карточки талантов
        cardChoiceTimeoutSec: number;    // 12
        abilityPool: string[];           // ["slow", "projectile", "spit", ...]
    };
    combat: {
        mouthArcDeg: number;
        tailArcDeg: number;
        tailDamageMultiplier: number;
        attackCooldownSec: number;
        damageInvulnSec: number;
        biteCooldownSec: number;
        respawnShieldSec: number;
        lastBreathDurationSec: number;
        lastBreathSpeedPenalty: number;
        pvpBiteAttackerGainPct: number;
        pvpBiteScatterPct: number;
        pvpBiteScatterOrbCount: number;
        pvpBiteScatterSpeed: number;
        scatterOrbMinMass: number;
    };
    death: {
        respawnDelaySec: number;
        massLostPercent: number;
        massToOrbsPercent: number;
        orbsCount: number;
        minRespawnMass: number;
    };
    orbs: {
        initialCount: number;
        maxCount: number;
        respawnIntervalSec: number;
        minMass: number;
        minRadius: number;
        pushForce: number;
        // Минимальная масса игрока для укуса орбов.
        orbBiteMinMass: number;
        // Максимальная масса игрока, учитываемая при расчёте силы укуса орба.
        orbBiteMaxMass: number;
        types: Array<{
            id: string;
            weight: number;
            density: number;
            massRange: [number, number];
        }>;
    };
    formulas: {
        damage: FormulaConfig;
        speed: FormulaConfig;
        radius: FormulaConfig;
    };
    classes: {
        hunter: {
            speedMult: number;
            biteResistPct: number;
            swallowLimit: number;
            biteFraction: number;
        };
        warrior: {
            speedMult: number;
            biteResistPct: number;
            damageVsSlimeMult: number;
            swallowLimit: number;
            biteFraction: number;
        };
        collector: {
            radiusMult: number;
            eatingPowerMult: number;
            swallowLimit: number;
            biteFraction: number;
        };
    };
    abilities: {
        dash: {
            massCostPct: number;
            cooldownSec: number;
            distanceM: number;
            durationSec: number;
            collisionDamageMult: number;
            levels?: Array<{
                massCostPct: number;
                cooldownSec: number;
                distanceM: number;
                durationSec: number;
                collisionDamageMult: number;
            }>;
        };
        shield: {
            massCostPct: number;
            cooldownSec: number;
            durationSec: number;
            reflectDamagePct: number;
            burstRadiusM: number;
            levels?: Array<{
                massCostPct: number;
                cooldownSec: number;
                durationSec: number;
                reflectDamagePct: number;
                burstRadiusM: number;
            }>;
        };
        magnet: {
            massCostPct: number;
            cooldownSec: number;
            durationSec: number;
            radiusM: number;
            pullSpeedMps: number;
            levels?: Array<{
                massCostPct: number;
                cooldownSec: number;
                durationSec: number;
                radiusM: number;
                pullSpeedMps: number;
            }>;
        };
        slow: {
            massCostPct: number;
            cooldownSec: number;
            durationSec: number;
            radiusM: number;
            slowPct: number;
            levels?: Array<{
                massCostPct: number;
                cooldownSec: number;
                durationSec: number;
                radiusM: number;
                slowPct: number;
            }>;
        };
        projectile: {
            massCostPct: number;
            cooldownSec: number;
            speedMps: number;
            rangeM: number;
            damagePct: number;
            radiusM: number;
            piercingHits: number;
            piercingDamagePct: number;
            levels?: Array<{
                massCostPct: number;
                cooldownSec: number;
                speedMps: number;
                rangeM: number;
                damagePct: number;
                radiusM: number;
                piercingHits: number;
                piercingDamagePct: number;
            }>;
        };
        spit: {
            massCostPct: number;
            cooldownSec: number;
            speedMps: number;
            rangeM: number;
            damagePct: number;
            radiusM: number;
            projectileCount: number;
            spreadAngleDeg: number;
            levels?: Array<{
                massCostPct: number;
                cooldownSec: number;
                speedMps: number;
                rangeM: number;
                damagePct: number;
                radiusM: number;
                projectileCount: number;
                spreadAngleDeg: number;
            }>;
        };
        bomb: {
            massCostPct: number;
            cooldownSec: number;
            speedMps: number;
            rangeM: number;
            damagePct: number;
            radiusM: number;
            explosionRadiusM: number;
            levels?: Array<{
                massCostPct: number;
                cooldownSec: number;
                speedMps: number;
                rangeM: number;
                damagePct: number;
                radiusM: number;
                explosionRadiusM: number;
            }>;
        };
        push: {
            massCostPct: number;
            cooldownSec: number;
            radiusM: number;
            impulseNs: number;
            minSpeedMps: number;
            maxSpeedMps: number;
            levels?: Array<{
                massCostPct: number;
                cooldownSec: number;
                radiusM: number;
                impulseNs: number;
                minSpeedMps: number;
                maxSpeedMps: number;
            }>;
        };
        mine: {
            massCostPct: number;
            cooldownSec: number;
            damagePct: number;
            radiusM: number;
            durationSec: number;
            maxMines: number;
            levels?: Array<{
                massCostPct: number;
                cooldownSec: number;
                damagePct: number;
                radiusM: number;
                durationSec: number;
                maxMines: number;
            }>;
        };
    };
    chests: {
        maxCount: number;
        spawnIntervalSec: number;
        mass: number;
        radius: number;
        rewards: {
            scatterTotalMassPct: number[];
            scatterBubbleCount: number[];
            scatterInnerFrac: number[];
            scatterInnerSpeedMpsMin: number[];
            scatterInnerSpeedMpsMax: number[];
            scatterOuterSpeedMpsMin: number[];
            scatterOuterSpeedMpsMax: number[];
            scatterSmallBubbleSpeedMul: number;
            talentRarityWeights: {
                rare: { common: number; rare: number; epic: number };
                epic: { common: number; rare: number; epic: number };
                gold: { common: number; rare: number; epic: number };
            };
        };
        types?: {
            rare?: { armorRings: number; mass: number };
            epic?: { armorRings: number; mass: number };
            gold?: { armorRings: number; mass: number };
        };
        phaseWeights?: {
            Growth?: { rare: number; epic: number; gold: number };
            Hunt?: { rare: number; epic: number; gold: number };
            Final?: { rare: number; epic: number; gold: number };
        };
    };
    boosts: BoostConfig;
    obstacles: ObstacleConfig;
    safeZones: SafeZoneConfig;
    zones: ZonesConfig;
    hotZones: {
        chaosCount: number;
        finalCount: number;
        radius: number;
        spawnMultiplierChaos: number;
        spawnMultiplierFinal: number;
    };
    toxicPools: {
        radiusM: number;
        durationSec: number;
        damagePctPerSec: number;
        slowPct: number;
    };
    hunger: {
        baseDrainPerSec: number;
        scalingPerMass: number;
        maxDrainPerSec: number;
        minMass: number;
    };
    rebel: {
        updateIntervalSec: number;
        massThresholdMultiplier: number;
    };
    talents: {
        cardChoiceTimeoutSec: number;
        cardQueueMax: number;
        abilityUpgradeChance: number;
        talentPool: {
            common: string[];
            rare: string[];
            epic: string[];
        };
        talentRarityByLevel: Record<string, { common: number; rare: number; epic: number }>;
        autoPickPriorities: Record<string, Record<string, number>>;
        common: Record<string, TalentConfig>;
        rare: Record<string, TalentConfig>;
        epic: Record<string, TalentConfig>;
        classTalents: Record<string, Record<string, ClassTalentConfig>>;
    };
    visual?: {
        mouthSector?: {
            enabled: boolean;
            radiusMultiplier: number;
            angleRadians: number;
            colors: {
                player: string;
                enemy: string;
                ally: string;
            };
        };
        inputArrow?: {
            enabled: boolean;
            minLength: number;
            maxLength: number;
            widthBase: number;
            tipLength: number;
            tipAngleRatio: number;
            color: string;
            minIntensity: number;
        };
        keyboardMixWeight?: number;
    };
    rewards?: {
        xp: {
            base: number;
            placement: {
                "1": number;
                "2": number;
                "3": number;
                top5: number;
            };
            perKill: number;
        };
        coins: {
            base: number;
            placement: {
                "1": number;
                "2": number;
                "3": number;
                top5: number;
            };
            perKill: number;
        };
        /**
         * P3-2: Рейтинговая система (Glicko-style).
         * Награда за матч = base + placement[место] + kills * perKill.
         * Рейтинг влияет на позицию в лидерборде.
         */
        rating: {
            base: number;
            placement: {
                "1": number;
                "2": number;
                "3": number;
                top5: number;
            };
            perKill: number;
        };
    };
}

// Конфиг отдельного таланта
export interface TalentConfig {
    name: string;
    maxLevel: number;
    values: number[] | number[][] | number;  // Значения по уровням
    effect: string;
    requirement?: string | null;
    category?: string;
}

// Конфиг классового таланта
export interface ClassTalentConfig extends TalentConfig {
    rarity: "rare" | "epic";
}

export interface ResolvedBalanceConfig extends BalanceConfig {
    server: BalanceConfig["server"] & {
        globalCooldownTicks: number;
    };
}

export const DEFAULT_BALANCE_CONFIG: BalanceConfig = {
    world: {
        mapSize: 1000,
        mapSizes: [],
    },
    server: {
        maxPlayers: 20,
        tickRate: 30,
        simulationIntervalMs: 1000 / 30,
        globalCooldownMs: 100,
        abilityQueueSize: 1,
    },
    match: {
        durationSec: 180,
        resultsDurationSec: 12,
        restartDelaySec: 3,
        phases: [
            { id: "Growth", startSec: 0, endSec: 60 },
            { id: "Hunt", startSec: 60, endSec: 120 },
            { id: "Final", startSec: 120, endSec: 180 },
        ],
    },
    physics: {
        environmentDrag: 0.03,
        collisionRestitution: 0.5,
        collisionImpulseCap: 10000,
        slimeLinearDamping: 0.02,
        orbLinearDamping: 0.08,
        speedDampingRate: 0.2,
        minSlimeMass: 50,
        maxSlimeSpeed: 500,
        maxOrbSpeed: 1000,
    },
    controls: {
        joystickMode: "adaptive",
        joystickRadius: 100,
        joystickDeadzone: 0.1,
        joystickSensitivity: 1.0,
        joystickFollowSpeed: 0.8,
        inputTimeoutMs: 200,
        mouseDeadzone: 30,
        mouseMaxDist: 200,
    },
    slimeConfigs: {
        base: {
            id: "base",
            name: "Base Slime",
            geometry: {
                baseMassKg: 100,
                baseRadiusM: 10.0,
                inertiaFactor: 0.5,
            },
            propulsion: {
                thrustForwardN: 9000,
                thrustReverseN: 6750,
                thrustLateralN: 8500,
                turnTorqueNm: 24000,
            },
            limits: {
                speedLimitForwardMps: 260,
                speedLimitReverseMps: 180,
                speedLimitLateralMps: 220,
                angularSpeedLimitRadps: (80 * Math.PI) / 180,
            },
            assist: {
                comfortableBrakingTimeS: 3.5,
                angularStopTimeS: 1.0,
                angularBrakeBoostFactor: 1.0,
                autoBrakeMaxThrustFraction: 0.6,
                overspeedDampingRate: 0.2,
                yawFullDeflectionAngleRad: Math.PI / 2,
                yawOscillationWindowFrames: 12,
                yawOscillationSignFlipsThreshold: 4,
                yawDampingBoostFactor: 2.0,
                yawCmdEps: 0.001,
                angularDeadzoneRad: 0.02,
                yawRateGain: 2.0,
                reactionTimeS: 0.15,
                accelTimeS: 0.5,
                velocityErrorThreshold: 0.1,
                inputMagnitudeThreshold: 0.01,
                counterAccelEnabled: true,
                counterAccelDirectionThresholdDeg: 30,
                counterAccelTimeS: 0.15,
                counterAccelMinSpeedMps: 50,
            },
            combat: {
                biteDamagePctOfMass: 0.15,
                biteVictimMassGainPct: 0.25,
                orbBitePctOfMass: 0.05,
            },
            massScaling: {
                minMassFactor: 0.1,
                thrustForwardN: { type: "power", exp: 0.5 },
                thrustReverseN: { type: "power", exp: 0.5 },
                thrustLateralN: { type: "power", exp: 0.5 },
                turnTorqueNm: { type: "power", exp: 1.5 },
                speedLimitForwardMps: { type: "power", exp: 0 },
                speedLimitReverseMps: { type: "power", exp: 0 },
                speedLimitLateralMps: { type: "power", exp: 0 },
                angularSpeedLimitRadps: { type: "power", exp: 0 },
            },
        },
        hunter: {
            id: "hunter",
            name: "Hunter",
            geometry: {
                baseMassKg: 100,
                baseRadiusM: 10.0,
                inertiaFactor: 0.5,
            },
            propulsion: {
                thrustForwardN: 9000,
                thrustReverseN: 6750,
                thrustLateralN: 8500,
                turnTorqueNm: 24000,
            },
            limits: {
                speedLimitForwardMps: 260,
                speedLimitReverseMps: 180,
                speedLimitLateralMps: 220,
                angularSpeedLimitRadps: (80 * Math.PI) / 180,
            },
            assist: {
                comfortableBrakingTimeS: 3.5,
                angularStopTimeS: 1.0,
                angularBrakeBoostFactor: 1.0,
                autoBrakeMaxThrustFraction: 0.6,
                overspeedDampingRate: 0.2,
                yawFullDeflectionAngleRad: Math.PI / 2,
                yawOscillationWindowFrames: 12,
                yawOscillationSignFlipsThreshold: 4,
                yawDampingBoostFactor: 2.0,
                yawCmdEps: 0.001,
                angularDeadzoneRad: 0.02,
                yawRateGain: 2.0,
                reactionTimeS: 0.15,
                accelTimeS: 0.5,
                velocityErrorThreshold: 0.1,
                inputMagnitudeThreshold: 0.01,
                counterAccelEnabled: true,
                counterAccelDirectionThresholdDeg: 30,
                counterAccelTimeS: 0.15,
                counterAccelMinSpeedMps: 50,
            },
            combat: {
                biteDamagePctOfMass: 0.15,
                biteVictimMassGainPct: 0.25,
                orbBitePctOfMass: 0.05,
            },
            massScaling: {
                minMassFactor: 0.1,
                thrustForwardN: { type: "power", exp: 0.5 },
                thrustReverseN: { type: "power", exp: 0.5 },
                thrustLateralN: { type: "power", exp: 0.5 },
                turnTorqueNm: { type: "power", exp: 1.5 },
                speedLimitForwardMps: { type: "power", exp: 0 },
                speedLimitReverseMps: { type: "power", exp: 0 },
                speedLimitLateralMps: { type: "power", exp: 0 },
                angularSpeedLimitRadps: { type: "power", exp: 0 },
            },
        },
        warrior: {
            id: "warrior",
            name: "Warrior",
            geometry: {
                baseMassKg: 100,
                baseRadiusM: 10.0,
                inertiaFactor: 0.5,
            },
            propulsion: {
                thrustForwardN: 9000,
                thrustReverseN: 6750,
                thrustLateralN: 8500,
                turnTorqueNm: 24000,
            },
            limits: {
                speedLimitForwardMps: 260,
                speedLimitReverseMps: 180,
                speedLimitLateralMps: 220,
                angularSpeedLimitRadps: (80 * Math.PI) / 180,
            },
            assist: {
                comfortableBrakingTimeS: 3.5,
                angularStopTimeS: 1.0,
                angularBrakeBoostFactor: 1.0,
                autoBrakeMaxThrustFraction: 0.6,
                overspeedDampingRate: 0.2,
                yawFullDeflectionAngleRad: Math.PI / 2,
                yawOscillationWindowFrames: 12,
                yawOscillationSignFlipsThreshold: 4,
                yawDampingBoostFactor: 2.0,
                yawCmdEps: 0.001,
                angularDeadzoneRad: 0.02,
                yawRateGain: 2.0,
                reactionTimeS: 0.15,
                accelTimeS: 0.5,
                velocityErrorThreshold: 0.1,
                inputMagnitudeThreshold: 0.01,
                counterAccelEnabled: true,
                counterAccelDirectionThresholdDeg: 30,
                counterAccelTimeS: 0.15,
                counterAccelMinSpeedMps: 50,
            },
            combat: {
                biteDamagePctOfMass: 0.15,
                biteVictimMassGainPct: 0.25,
                orbBitePctOfMass: 0.05,
            },
            massScaling: {
                minMassFactor: 0.1,
                thrustForwardN: { type: "power", exp: 0.5 },
                thrustReverseN: { type: "power", exp: 0.5 },
                thrustLateralN: { type: "power", exp: 0.5 },
                turnTorqueNm: { type: "power", exp: 1.5 },
                speedLimitForwardMps: { type: "power", exp: 0 },
                speedLimitReverseMps: { type: "power", exp: 0 },
                speedLimitLateralMps: { type: "power", exp: 0 },
                angularSpeedLimitRadps: { type: "power", exp: 0 },
            },
        },
        collector: {
            id: "collector",
            name: "Collector",
            geometry: {
                baseMassKg: 100,
                baseRadiusM: 10.0,
                inertiaFactor: 0.5,
            },
            propulsion: {
                thrustForwardN: 9000,
                thrustReverseN: 6750,
                thrustLateralN: 8500,
                turnTorqueNm: 24000,
            },
            limits: {
                speedLimitForwardMps: 260,
                speedLimitReverseMps: 180,
                speedLimitLateralMps: 220,
                angularSpeedLimitRadps: (80 * Math.PI) / 180,
            },
            assist: {
                comfortableBrakingTimeS: 3.5,
                angularStopTimeS: 1.0,
                angularBrakeBoostFactor: 1.0,
                autoBrakeMaxThrustFraction: 0.6,
                overspeedDampingRate: 0.2,
                yawFullDeflectionAngleRad: Math.PI / 2,
                yawOscillationWindowFrames: 12,
                yawOscillationSignFlipsThreshold: 4,
                yawDampingBoostFactor: 2.0,
                yawCmdEps: 0.001,
                angularDeadzoneRad: 0.02,
                yawRateGain: 2.0,
                reactionTimeS: 0.15,
                accelTimeS: 0.5,
                velocityErrorThreshold: 0.1,
                inputMagnitudeThreshold: 0.01,
                counterAccelEnabled: true,
                counterAccelDirectionThresholdDeg: 30,
                counterAccelTimeS: 0.15,
                counterAccelMinSpeedMps: 50,
            },
            combat: {
                biteDamagePctOfMass: 0.15,
                biteVictimMassGainPct: 0.25,
                orbBitePctOfMass: 0.05,
            },
            massScaling: {
                minMassFactor: 0.1,
                thrustForwardN: { type: "power", exp: 0.5 },
                thrustReverseN: { type: "power", exp: 0.5 },
                thrustLateralN: { type: "power", exp: 0.5 },
                turnTorqueNm: { type: "power", exp: 1.5 },
                speedLimitForwardMps: { type: "power", exp: 0 },
                speedLimitReverseMps: { type: "power", exp: 0 },
                speedLimitLateralMps: { type: "power", exp: 0 },
                angularSpeedLimitRadps: { type: "power", exp: 0 },
            },
        },
    },
    worldPhysics: {
        forwardDragK: 0.1,
        lateralGripMultiplier: 1.0,
        angularDragK: 0.0,
        restitution: 0.9,
        maxPositionCorrectionM: 0.5,
        worldShape: "rectangle",
        widthM: 1000,
        heightM: 1000,
    },
    clientNetSmoothing: {
        lookAheadMs: 150,
        velocityWeight: 0.7,
        catchUpSpeed: 10.0,
        maxCatchUpSpeed: 800,
        teleportThreshold: 100,
        angleCatchUpSpeed: 12.0,
    },
    camera: {
        zoomMin: 1.0,
        zoomMax: 2.5,
        zoomSpeed: 0.5,
        zoomDamageHoldSec: 3,
        zoomMassMin: 100,
        zoomMassMax: 2000,
    },
    slime: {
        initialMass: 100,
        initialLevel: 1,
        initialClassId: 0,
        levelThresholds: [180, 300, 500, 800, 1200, 1800],
        slotUnlockLevels: [1, 3, 5],
        talentGrantLevels: [2, 4, 6],
        cardChoiceTimeoutSec: 12,
        abilityPool: ["slow", "projectile", "spit", "bomb", "push", "mine"],
    },
    combat: {
        mouthArcDeg: 120,
        tailArcDeg: 120,
        tailDamageMultiplier: 1.5,
        attackCooldownSec: 0.2,
        damageInvulnSec: 0.2,
        biteCooldownSec: 0.1,
        respawnShieldSec: 5,
        lastBreathDurationSec: 0.5,
        lastBreathSpeedPenalty: 0.8,
        pvpBiteAttackerGainPct: 0.10,
        pvpBiteScatterPct: 0.10,
        pvpBiteScatterOrbCount: 3,
        pvpBiteScatterSpeed: 200,
        scatterOrbMinMass: 5,
    },
    death: {
        respawnDelaySec: 2,
        massLostPercent: 0.5,
        massToOrbsPercent: 0.3,
        orbsCount: 4,
        minRespawnMass: 100,
    },
    orbs: {
        initialCount: 100,
        maxCount: 150,
        respawnIntervalSec: 0.5,
        minMass: 3,
        minRadius: 2.5,
        pushForce: 100,
        // Орбы можно кусать только начиная с этой массы.
        orbBiteMinMass: 50,
        // Влияние массы на силу укуса орба ограничивается этим значением.
        // Большое значение означает фактически без верхнего ограничения.
        orbBiteMaxMass: 100000,
        types: [
            { id: "green", weight: 40, density: 0.8, massRange: [5, 15] },
            { id: "blue", weight: 30, density: 1.0, massRange: [20, 40] },
            { id: "red", weight: 20, density: 1.0, massRange: [20, 40] },
            { id: "gold", weight: 10, density: 1.5, massRange: [50, 100] },
        ],
    },
    formulas: {
        damage: { base: 10, scale: 10, divisor: 100 },
        speed: { base: 1.0, scale: 1.0, divisor: 500 },
        radius: { base: 10, scale: 1.0, divisor: 50 },
    },
    classes: {
        hunter: {
            speedMult: 1.15,
            biteResistPct: 0,
            swallowLimit: 50,
            biteFraction: 0.3,
        },
        warrior: {
            speedMult: 0.9,
            biteResistPct: 0,
            damageVsSlimeMult: 1.1,
            swallowLimit: 45,
            biteFraction: 0.35,
        },
        collector: {
            radiusMult: 1,
            eatingPowerMult: 1.25,
            swallowLimit: 70,
            biteFraction: 0.5,
        },
    },
    abilities: {
        dash: {
            massCostPct: 0.03,
            cooldownSec: 5,
            distanceM: 80,
            durationSec: 0.3,
            collisionDamageMult: 1.5,
            levels: [
                { massCostPct: 0.03, cooldownSec: 5, distanceM: 80, durationSec: 0.3, collisionDamageMult: 1.5 },
                { massCostPct: 0.03, cooldownSec: 4, distanceM: 80, durationSec: 0.3, collisionDamageMult: 1.5 },
                { massCostPct: 0.03, cooldownSec: 4, distanceM: 104, durationSec: 0.3, collisionDamageMult: 1.5 },
            ],
        },
        shield: {
            massCostPct: 0.04,
            cooldownSec: 8,
            durationSec: 2.5,
            reflectDamagePct: 0,
            burstRadiusM: 0,
            levels: [
                { massCostPct: 0.04, cooldownSec: 8, durationSec: 2.5, reflectDamagePct: 0, burstRadiusM: 0 },
                { massCostPct: 0.04, cooldownSec: 8, durationSec: 2.5, reflectDamagePct: 0.30, burstRadiusM: 0 },
                { massCostPct: 0.04, cooldownSec: 8, durationSec: 2.5, reflectDamagePct: 0.30, burstRadiusM: 40 },
            ],
        },
        magnet: {
            massCostPct: 0.02,
            cooldownSec: 7,
            durationSec: 1.5,
            radiusM: 120,
            pullSpeedMps: 50,
            levels: [
                { massCostPct: 0.02, cooldownSec: 7, durationSec: 1.5, radiusM: 120, pullSpeedMps: 50 },
                { massCostPct: 0.02, cooldownSec: 7, durationSec: 1.5, radiusM: 150, pullSpeedMps: 50 },
                { massCostPct: 0.02, cooldownSec: 7, durationSec: 1.5, radiusM: 150, pullSpeedMps: 70 },
            ],
        },
        slow: {
            massCostPct: 0.02,
            cooldownSec: 7,
            durationSec: 2,
            radiusM: 80,
            slowPct: 0.30,
            levels: [
                { massCostPct: 0.02, cooldownSec: 7, durationSec: 2, radiusM: 80, slowPct: 0.30 },
                { massCostPct: 0.02, cooldownSec: 7, durationSec: 2, radiusM: 100, slowPct: 0.30 },
                { massCostPct: 0.02, cooldownSec: 7, durationSec: 2, radiusM: 100, slowPct: 0.40 },
            ],
        },
        projectile: {
            massCostPct: 0.02,
            cooldownSec: 3,
            speedMps: 400,
            rangeM: 300,
            damagePct: 0.15,
            radiusM: 8,
            piercingHits: 0,
            piercingDamagePct: 0,
            levels: [
                { massCostPct: 0.02, cooldownSec: 3, speedMps: 400, rangeM: 300, damagePct: 0.15, radiusM: 8, piercingHits: 0, piercingDamagePct: 0 },
                { massCostPct: 0.02, cooldownSec: 3, speedMps: 400, rangeM: 300, damagePct: 0.18, radiusM: 8, piercingHits: 0, piercingDamagePct: 0 },
                { massCostPct: 0.02, cooldownSec: 3, speedMps: 400, rangeM: 300, damagePct: 0.18, radiusM: 8, piercingHits: 2, piercingDamagePct: 0.6 },
            ],
        },
        spit: {
            massCostPct: 0.03,
            cooldownSec: 4,
            speedMps: 350,
            rangeM: 200,
            damagePct: 0.08,
            radiusM: 6,
            projectileCount: 3,
            spreadAngleDeg: 30,
            levels: [
                { massCostPct: 0.03, cooldownSec: 4, speedMps: 350, rangeM: 200, damagePct: 0.08, radiusM: 6, projectileCount: 3, spreadAngleDeg: 30 },
                { massCostPct: 0.03, cooldownSec: 4, speedMps: 350, rangeM: 200, damagePct: 0.08, radiusM: 6, projectileCount: 4, spreadAngleDeg: 30 },
                { massCostPct: 0.03, cooldownSec: 4, speedMps: 350, rangeM: 200, damagePct: 0.092, radiusM: 6, projectileCount: 4, spreadAngleDeg: 30 },
            ],
        },
        bomb: {
            massCostPct: 0.04,
            cooldownSec: 6,
            speedMps: 200,
            rangeM: 250,
            damagePct: 0.12,
            radiusM: 10,
            explosionRadiusM: 50,
            levels: [
                { massCostPct: 0.04, cooldownSec: 6, speedMps: 200, rangeM: 250, damagePct: 0.12, radiusM: 10, explosionRadiusM: 50 },
                { massCostPct: 0.04, cooldownSec: 6, speedMps: 200, rangeM: 250, damagePct: 0.12, radiusM: 10, explosionRadiusM: 70 },
                { massCostPct: 0.04, cooldownSec: 5, speedMps: 200, rangeM: 250, damagePct: 0.12, radiusM: 10, explosionRadiusM: 70 },
            ],
        },
        push: {
            massCostPct: 0.03,
            cooldownSec: 6,
            radiusM: 80,
            impulseNs: 50000,
            minSpeedMps: 30,
            maxSpeedMps: 120,
            levels: [
                { massCostPct: 0.03, cooldownSec: 6, radiusM: 80, impulseNs: 50000, minSpeedMps: 30, maxSpeedMps: 120 },
                { massCostPct: 0.03, cooldownSec: 6, radiusM: 100, impulseNs: 50000, minSpeedMps: 30, maxSpeedMps: 120 },
                { massCostPct: 0.03, cooldownSec: 6, radiusM: 100, impulseNs: 65000, minSpeedMps: 30, maxSpeedMps: 150 },
            ],
        },
        mine: {
            massCostPct: 0.02,
            cooldownSec: 10,
            damagePct: 0.15,
            radiusM: 15,
            durationSec: 20,
            maxMines: 1,
            levels: [
                { massCostPct: 0.02, cooldownSec: 10, damagePct: 0.15, radiusM: 15, durationSec: 20, maxMines: 1 },
                { massCostPct: 0.02, cooldownSec: 10, damagePct: 0.15, radiusM: 15, durationSec: 20, maxMines: 2 },
                { massCostPct: 0.02, cooldownSec: 10, damagePct: 0.20, radiusM: 15, durationSec: 20, maxMines: 2 },
            ],
        },
    },
    chests: {
        maxCount: 3,
        spawnIntervalSec: 20,
        mass: 200,
        radius: 14,
        rewards: {
            scatterTotalMassPct: [0.12, 0.18, 0.28],
            scatterBubbleCount: [10, 16, 24],
            scatterInnerFrac: [0.30, 0.30, 0.25],
            scatterInnerSpeedMpsMin: [25, 25, 25],
            scatterInnerSpeedMpsMax: [45, 45, 40],
            scatterOuterSpeedMpsMin: [55, 65, 75],
            scatterOuterSpeedMpsMax: [75, 85, 95],
            scatterSmallBubbleSpeedMul: 1.25,
            talentRarityWeights: {
                rare: { common: 80, rare: 20, epic: 0 },
                epic: { common: 30, rare: 60, epic: 10 },
                gold: { common: 0, rare: 40, epic: 60 },
            },
        },
    },
    boosts: {
        maxStackTimeSec: 20,
        rage: {
            durationSec: 10,
            damageMul: 1.25,
        },
        haste: {
            durationSec: 10,
            speedMul: 1.3,
        },
        guard: {
            durationSec: 15,
            charges: 1,
        },
        greed: {
            durationSec: 15,
            bubbleMassMul: 2.0,
            charges: 3,
        },
        allowedByChestType: {
            rare: ["haste", "guard"],
            epic: ["rage", "haste", "guard"],
            gold: ["greed", "rage", "guard"],
        },
    },
    obstacles: {
        countByMapSize: {
            small: 4,
            medium: 6,
            large: 9,
        },
        passageCountByMapSize: {
            small: 1,
            medium: 2,
            large: 2,
        },
        passageGapWidth: 25,
        passagePillarRadius: 18,
        pillarRadius: 20,
        spikeRadius: 16,
        spikeDamagePct: 0.05,
        spikeChance: 0.3,
        spacing: 8,
        placementRetries: 30,
    },
    safeZones: {
        finalStartSec: 120,
        warningSec: 10,
        damagePctPerSec: 0.015,
        minDistance: 200,
        placementRetries: 30,
        countByMapSize: {
            small: 1,
            medium: 2,
            large: 3,
        },
        radiusByMapSize: {
            small: 120,
            medium: 150,
            large: 180,
        },
    },
    zones: {
        countByMapSize: {
            small: 3,
            medium: 4,
            large: 5,
        },
        radiusByMapSize: {
            small: 90,
            medium: 110,
            large: 130,
        },
        minDistance: 180,
        placementRetries: 40,
        typeWeights: {
            nectar: 1,
            ice: 1,
            mud: 1,
            lava: 1,
            turbo: 1,
        },
        lavaMinDistanceFromSpawn: 100,
        nectar: {
            massGainPctPerSec: 0.01,
        },
        ice: {
            frictionMultiplier: 0.3,
        },
        mud: {
            speedMultiplier: 0.5,
            frictionMultiplier: 2.0,
        },
        lava: {
            damagePctPerSec: 0.02,
            scatterPct: 0.5,
            scatterOrbCount: 6,
            scatterSpeedMps: 60,
        },
        turbo: {
            speedMultiplier: 1.4,
        },
    },
    hotZones: {
        chaosCount: 2,
        finalCount: 1,
        radius: 110,
        spawnMultiplierChaos: 3,
        spawnMultiplierFinal: 5,
    },
    toxicPools: {
        radiusM: 20,
        durationSec: 3,
        damagePctPerSec: 0.01,
        slowPct: 0.2,
    },
    hunger: {
        baseDrainPerSec: 2,
        scalingPerMass: 0.01,
        maxDrainPerSec: 12,
        minMass: 50,
    },
    rebel: {
        updateIntervalSec: 5,
        massThresholdMultiplier: 1.2,
    },
    talents: {
        cardChoiceTimeoutSec: 12,
        cardQueueMax: 3,
        abilityUpgradeChance: 0.5,
        talentPool: {
            common: ["fastLegs", "spinner", "sharpTeeth", "glutton", "thickSkin", "economical", "recharge", "aggressor", "sturdy", "accelerator", "anchor", "crab", "bloodlust", "secondWind"],
            rare: ["poison", "frost", "vampire", "vacuum", "motor", "ricochet", "piercing", "longDash", "backNeedles", "toxic"],
            epic: ["lightning", "doubleActivation", "explosion", "leviathan", "invisible"],
        },
        talentRarityByLevel: {
            "2": { common: 100, rare: 0, epic: 0 },
            "3": { common: 85, rare: 15, epic: 0 },
            "4": { common: 70, rare: 28, epic: 2 },
            "5": { common: 60, rare: 35, epic: 5 },
            "6": { common: 50, rare: 40, epic: 10 },
            "7": { common: 40, rare: 45, epic: 15 },
        },
        autoPickPriorities: {
            hunter: { speed: 3, damage: 2, defense: 1, gather: 1 },
            warrior: { defense: 3, damage: 2, speed: 1, gather: 1 },
            collector: { gather: 3, defense: 2, speed: 1, damage: 1 },
        },
        common: {
            fastLegs: { name: "Быстрые ноги", maxLevel: 3, values: [0.10, 0.18, 0.25], effect: "speedLimitBonus", category: "speed" },
            spinner: { name: "Юла", maxLevel: 3, values: [0.10, 0.18, 0.25], effect: "turnBonus", category: "speed" },
            sharpTeeth: { name: "Острые зубы", maxLevel: 3, values: [0.15, 0.25, 0.35], effect: "biteDamageBonus", category: "damage" },
            glutton: { name: "Обжора", maxLevel: 3, values: [0.20, 0.35, 0.50], effect: "orbMassBonus", category: "gather" },
            thickSkin: { name: "Толстая шкура", maxLevel: 3, values: [0.12, 0.20, 0.27], effect: "biteResistBonus", category: "defense" },
            economical: { name: "Экономный", maxLevel: 3, values: [0.15, 0.25, 0.33], effect: "abilityCostReduction", category: "gather" },
            recharge: { name: "Перезарядка", maxLevel: 3, values: [0.15, 0.25, 0.33], effect: "cooldownReduction", category: "speed" },
            aggressor: { name: "Агрессор", maxLevel: 1, values: [0.12], effect: "aggressorDual", category: "damage" },
            sturdy: { name: "Стойкий", maxLevel: 1, values: [0.10], effect: "allDamageReduction", category: "defense" },
            accelerator: { name: "Ускоритель", maxLevel: 1, values: [0.15], effect: "thrustForwardBonus", category: "speed" },
            anchor: { name: "Якорь", maxLevel: 1, values: [0.20], effect: "thrustReverseBonus", category: "defense" },
            crab: { name: "Краб", maxLevel: 1, values: [0.15], effect: "thrustLateralBonus", category: "speed" },
            bloodlust: { name: "Кровожадность", maxLevel: 1, values: [0.15], effect: "killMassBonus", category: "damage" },
            secondWind: { name: "Второе дыхание", maxLevel: 1, values: [150], effect: "respawnMass", category: "defense" },
            sense: { name: "Чутьё", maxLevel: 2, values: [2, 5], effect: "chestSense", category: "gather" },
            regeneration: { name: "Регенерация", maxLevel: 2, values: [[0.01, 5], [0.01, 4]], effect: "outOfCombatRegen", category: "defense" },
        },
        rare: {
            poison: { name: "Яд", maxLevel: 2, values: [[0.02, 3], [0.03, 3]], effect: "poisonOnBite", requirement: null, category: "damage" },
            frost: { name: "Мороз", maxLevel: 2, values: [[0.30, 2], [0.40, 2.5]], effect: "frostOnBite", requirement: null, category: "damage" },
            vampire: { name: "Вампир", maxLevel: 1, values: [[0.20, 0.25]], effect: "vampireBite", requirement: null, category: "gather" },
            vacuum: { name: "Вакуум", maxLevel: 2, values: [[40, 15], [60, 20]], effect: "vacuumOrbs", requirement: null, category: "gather" },
            motor: { name: "Мотор", maxLevel: 1, values: [0.25], effect: "allThrustBonus", requirement: null, category: "speed" },
            ricochet: { name: "Рикошет", maxLevel: 1, values: [1], effect: "projectileRicochet", requirement: "projectile", category: "damage" },
            piercing: { name: "Пробивание", maxLevel: 1, values: [[1.0, 0.6]], effect: "projectilePiercing", requirement: "projectile", category: "damage" },
            longDash: { name: "Длинный рывок", maxLevel: 1, values: [0.40], effect: "dashDistanceBonus", requirement: "dash", category: "speed" },
            backNeedles: { name: "Иглы назад", maxLevel: 1, values: [[3, 0.10]], effect: "deathNeedles", requirement: null, category: "damage" },
            toxic: { name: "Токсичный", maxLevel: 1, values: [2.0], effect: "toxicPoolBonus", requirement: null, category: "damage" },
        },
        epic: {
            lightning: { name: "Молния", maxLevel: 1, values: [[0.25, 0.3]], effect: "lightningSpeed", requirement: null, category: "speed" },
            doubleActivation: { name: "Двойная активация", maxLevel: 1, values: [[1.0, 0.80]], effect: "doubleAbility", requirement: null, category: "damage" },
            explosion: { name: "Взрыв", maxLevel: 1, values: [[60, 0.08]], effect: "deathExplosion", requirement: null, category: "damage" },
            leviathan: { name: "Левиафан", maxLevel: 1, values: [[1.3, 1.5]], effect: "leviathanSize", requirement: null, category: "defense" },
            invisible: { name: "Невидимка", maxLevel: 1, values: [1.5], effect: "invisibleAfterDash", requirement: "dash", category: "speed" },
        },
        classTalents: {
            hunter: {
                ambush: { name: "Засада", maxLevel: 1, values: [0.30], effect: "ambushDamage", rarity: "rare", category: "damage" },
                hunterInvisible: { name: "Невидимка", maxLevel: 1, values: [1.5], effect: "invisibleAfterDash", requirement: "dash", rarity: "epic", category: "speed" },
            },
            warrior: {
                indestructible: { name: "Несокрушимый", maxLevel: 1, values: [0.15], effect: "allDamageReduction", rarity: "rare", category: "defense" },
                thorns: { name: "Шипы", maxLevel: 1, values: [0.10], effect: "thornsDamage", rarity: "rare", category: "defense" },
            },
            collector: {
                parasite: { name: "Паразит", maxLevel: 1, values: [0.05], effect: "parasiteMass", rarity: "rare", category: "gather" },
                magnet: { name: "Магнит", maxLevel: 1, values: [[50, 10]], effect: "magnetOrbs", rarity: "rare", category: "gather" },
            },
        },
    },
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readNumber(value: unknown, fallback: number, path: string): number {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Invalid number at ${path}`);
    }
    return value;
}

function readString(value: unknown, fallback: string, path: string): string {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== "string") {
        throw new Error(`Invalid string at ${path}`);
    }
    return value;
}

function readBoolean(value: unknown, fallback: boolean, path: string): boolean {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== "boolean") {
        throw new Error(`Invalid boolean at ${path}`);
    }
    return value;
}

function readNumberArray(value: unknown, fallback: number[], path: string): number[] {
    if (value === undefined || value === null) return fallback;
    if (!Array.isArray(value)) {
        throw new Error(`Invalid array at ${path}`);
    }
    return value.map((item, index) => readNumber(item, fallback[index] ?? 0, `${path}[${index}]`));
}

function readMapSizeConfig(value: unknown, fallback: MapSizeConfig, path: string): MapSizeConfig {
    if (!isRecord(value)) return fallback;
    return {
        small: readNumber(value.small, fallback.small, `${path}.small`),
        medium: readNumber(value.medium, fallback.medium, `${path}.medium`),
        large: readNumber(value.large, fallback.large, `${path}.large`),
    };
}

function readStringArray(value: unknown, fallback: string[], path: string): string[] {
    if (value === undefined || value === null) return fallback;
    if (!Array.isArray(value)) {
        throw new Error(`Invalid array at ${path}`);
    }
    return value.map((item, index) => {
        if (typeof item !== "string") {
            throw new Error(`Invalid string at ${path}[${index}]`);
        }
        return item;
    });
}

const BOOST_TYPES: BoostType[] = ["rage", "haste", "guard", "greed"];

function readBoostTypeArray(value: unknown, fallback: BoostType[], path: string): BoostType[] {
    const items = readStringArray(value, fallback, path);
    return items.map((item, index) => {
        if (!BOOST_TYPES.includes(item as BoostType)) {
            throw new Error(`Invalid boost type at ${path}[${index}]`);
        }
        return item as BoostType;
    });
}

function readOptionalNumber(value: unknown, path: string): number | undefined {
    if (value === undefined || value === null) return undefined;
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Invalid number at ${path}`);
    }
    return value;
}

function readPhaseId(value: unknown, fallback: MatchPhaseId, path: string): MatchPhaseId {
    if (value === undefined || value === null) return fallback;
    if (typeof value !== "string" || !MATCH_PHASES.includes(value as MatchPhaseId)) {
        throw new Error(`Invalid phase id at ${path}`);
    }
    return value as MatchPhaseId;
}

function readPhases(value: unknown, fallback: MatchPhaseConfig[], path: string): MatchPhaseConfig[] {
    if (value === undefined || value === null) return fallback;
    if (!Array.isArray(value)) {
        throw new Error(`Invalid array at ${path}`);
    }
    return value.map((item, index) => {
        if (!isRecord(item)) {
            throw new Error(`Invalid phase at ${path}[${index}]`);
        }
        const fallbackPhase = fallback[index] ?? fallback[0];
        return {
            id: readPhaseId(item.id, fallbackPhase.id, `${path}[${index}].id`),
            startSec: readNumber(item.startSec, fallbackPhase.startSec, `${path}[${index}].startSec`),
            endSec: readNumber(item.endSec, fallbackPhase.endSec, `${path}[${index}].endSec`),
        };
    });
}

function readFormula(value: unknown, fallback: FormulaConfig, path: string): FormulaConfig {
    if (!isRecord(value)) return fallback;
    return {
        base: readNumber(value.base, fallback.base, `${path}.base`),
        scale: readNumber(value.scale, fallback.scale, `${path}.scale`),
        divisor: readNumber(value.divisor, fallback.divisor, `${path}.divisor`),
    };
}

function readCurveConfig(value: unknown, fallback: MassCurveConfig, path: string): MassCurveConfig {
    if (!isRecord(value)) return fallback;
    const type = readString(value.type, fallback.type, `${path}.type`) as MassCurveType;
    return {
        type,
        exp: readOptionalNumber(value.exp, `${path}.exp`) ?? fallback.exp,
        k: readOptionalNumber(value.k, `${path}.k`) ?? fallback.k,
        minValue: readOptionalNumber(value.minValue, `${path}.minValue`) ?? fallback.minValue,
        maxValue: readOptionalNumber(value.maxValue, `${path}.maxValue`) ?? fallback.maxValue,
    };
}

function readSlimeConfig(value: unknown, fallback: SlimeConfig, path: string): SlimeConfig {
    const data = isRecord(value) ? value : {};
    const geometry = isRecord(data.geometry) ? data.geometry : {};
    const propulsion = isRecord(data.propulsion) ? data.propulsion : {};
    const limits = isRecord(data.limits) ? data.limits : {};
    const assist = isRecord(data.assist) ? data.assist : {};
    const combat = isRecord(data.combat) ? data.combat : {};
    const massScaling = isRecord(data.massScaling) ? data.massScaling : {};

    const angularSpeedLimitDegps = readOptionalNumber(limits.angularSpeedLimitDegps, `${path}.limits.angularSpeedLimitDegps`);
    const angularSpeedLimitRadps =
        readOptionalNumber(limits.angularSpeedLimitRadps, `${path}.limits.angularSpeedLimitRadps`) ??
        (angularSpeedLimitDegps !== undefined ? (angularSpeedLimitDegps * Math.PI) / 180 : fallback.limits.angularSpeedLimitRadps);

    const yawFullDeflectionAngleDeg = readOptionalNumber(
        assist.yawFullDeflectionAngleDeg,
        `${path}.assist.yawFullDeflectionAngleDeg`
    );
    const yawFullDeflectionAngleRad =
        readOptionalNumber(assist.yawFullDeflectionAngleRad, `${path}.assist.yawFullDeflectionAngleRad`) ??
        (yawFullDeflectionAngleDeg !== undefined
            ? (yawFullDeflectionAngleDeg * Math.PI) / 180
            : fallback.assist.yawFullDeflectionAngleRad);

    return {
        id: readString(data.id, fallback.id, `${path}.id`),
        name: readString(data.name, fallback.name, `${path}.name`),
        geometry: {
            baseMassKg: readNumber(geometry.baseMassKg, fallback.geometry.baseMassKg, `${path}.geometry.baseMassKg`),
            baseRadiusM: readNumber(geometry.baseRadiusM, fallback.geometry.baseRadiusM, `${path}.geometry.baseRadiusM`),
            inertiaFactor: readNumber(geometry.inertiaFactor, fallback.geometry.inertiaFactor, `${path}.geometry.inertiaFactor`),
        },
        propulsion: {
            thrustForwardN: readNumber(
                propulsion.thrustForwardN,
                fallback.propulsion.thrustForwardN,
                `${path}.propulsion.thrustForwardN`
            ),
            thrustReverseN: readNumber(
                propulsion.thrustReverseN,
                fallback.propulsion.thrustReverseN,
                `${path}.propulsion.thrustReverseN`
            ),
            thrustLateralN: readNumber(
                propulsion.thrustLateralN,
                fallback.propulsion.thrustLateralN,
                `${path}.propulsion.thrustLateralN`
            ),
            turnTorqueNm: readNumber(
                propulsion.turnTorqueNm,
                fallback.propulsion.turnTorqueNm,
                `${path}.propulsion.turnTorqueNm`
            ),
        },
        limits: {
            speedLimitForwardMps: readNumber(
                limits.speedLimitForwardMps,
                fallback.limits.speedLimitForwardMps,
                `${path}.limits.speedLimitForwardMps`
            ),
            speedLimitReverseMps: readNumber(
                limits.speedLimitReverseMps,
                fallback.limits.speedLimitReverseMps,
                `${path}.limits.speedLimitReverseMps`
            ),
            speedLimitLateralMps: readNumber(
                limits.speedLimitLateralMps,
                fallback.limits.speedLimitLateralMps,
                `${path}.limits.speedLimitLateralMps`
            ),
            angularSpeedLimitRadps,
        },
        assist: {
            comfortableBrakingTimeS: readNumber(
                assist.comfortableBrakingTimeS,
                fallback.assist.comfortableBrakingTimeS,
                `${path}.assist.comfortableBrakingTimeS`
            ),
            angularStopTimeS: readNumber(
                assist.angularStopTimeS,
                fallback.assist.angularStopTimeS,
                `${path}.assist.angularStopTimeS`
            ),
            angularBrakeBoostFactor: readNumber(
                assist.angularBrakeBoostFactor,
                fallback.assist.angularBrakeBoostFactor,
                `${path}.assist.angularBrakeBoostFactor`
            ),
            autoBrakeMaxThrustFraction: readNumber(
                assist.autoBrakeMaxThrustFraction,
                fallback.assist.autoBrakeMaxThrustFraction,
                `${path}.assist.autoBrakeMaxThrustFraction`
            ),
            overspeedDampingRate: readNumber(
                assist.overspeedDampingRate,
                fallback.assist.overspeedDampingRate,
                `${path}.assist.overspeedDampingRate`
            ),
            yawFullDeflectionAngleRad,
            yawOscillationWindowFrames: readNumber(
                assist.yawOscillationWindowFrames,
                fallback.assist.yawOscillationWindowFrames,
                `${path}.assist.yawOscillationWindowFrames`
            ),
            yawOscillationSignFlipsThreshold: readNumber(
                assist.yawOscillationSignFlipsThreshold,
                fallback.assist.yawOscillationSignFlipsThreshold,
                `${path}.assist.yawOscillationSignFlipsThreshold`
            ),
            yawDampingBoostFactor: readNumber(
                assist.yawDampingBoostFactor,
                fallback.assist.yawDampingBoostFactor,
                `${path}.assist.yawDampingBoostFactor`
            ),
            yawCmdEps: readNumber(assist.yawCmdEps, fallback.assist.yawCmdEps, `${path}.assist.yawCmdEps`),
            angularDeadzoneRad: readNumber(
                assist.angularDeadzoneRad,
                fallback.assist.angularDeadzoneRad,
                `${path}.assist.angularDeadzoneRad`
            ),
            yawRateGain: readNumber(
                assist.yawRateGain,
                fallback.assist.yawRateGain,
                `${path}.assist.yawRateGain`
            ),
            reactionTimeS: readNumber(
                assist.reactionTimeS,
                fallback.assist.reactionTimeS,
                `${path}.assist.reactionTimeS`
            ),
            accelTimeS: readNumber(
                assist.accelTimeS,
                fallback.assist.accelTimeS,
                `${path}.assist.accelTimeS`
            ),
            velocityErrorThreshold: readNumber(
                assist.velocityErrorThreshold,
                fallback.assist.velocityErrorThreshold,
                `${path}.assist.velocityErrorThreshold`
            ),
            inputMagnitudeThreshold: readNumber(
                assist.inputMagnitudeThreshold,
                fallback.assist.inputMagnitudeThreshold,
                `${path}.assist.inputMagnitudeThreshold`
            ),
            counterAccelEnabled: readBoolean(
                assist.counterAccelEnabled,
                fallback.assist.counterAccelEnabled,
                `${path}.assist.counterAccelEnabled`
            ),
            counterAccelDirectionThresholdDeg: readNumber(
                assist.counterAccelDirectionThresholdDeg,
                fallback.assist.counterAccelDirectionThresholdDeg,
                `${path}.assist.counterAccelDirectionThresholdDeg`
            ),
            counterAccelTimeS: readNumber(
                assist.counterAccelTimeS,
                fallback.assist.counterAccelTimeS,
                `${path}.assist.counterAccelTimeS`
            ),
            counterAccelMinSpeedMps: readNumber(
                assist.counterAccelMinSpeedMps,
                fallback.assist.counterAccelMinSpeedMps,
                `${path}.assist.counterAccelMinSpeedMps`
            ),
        },
        combat: {
            biteDamagePctOfMass: readNumber(
                combat.biteDamagePctOfMass,
                fallback.combat.biteDamagePctOfMass,
                `${path}.combat.biteDamagePctOfMass`
            ),
            biteVictimMassGainPct: readNumber(
                combat.biteVictimMassGainPct,
                fallback.combat.biteVictimMassGainPct,
                `${path}.combat.biteVictimMassGainPct`
            ),
            orbBitePctOfMass: readNumber(
                combat.orbBitePctOfMass,
                fallback.combat.orbBitePctOfMass,
                `${path}.combat.orbBitePctOfMass`
            ),
        },
        massScaling: {
            minMassFactor: readNumber(
                massScaling.minMassFactor,
                fallback.massScaling.minMassFactor,
                `${path}.massScaling.minMassFactor`
            ),
            thrustForwardN: readCurveConfig(
                massScaling.thrustForwardN,
                fallback.massScaling.thrustForwardN,
                `${path}.massScaling.thrustForwardN`
            ),
            thrustReverseN: readCurveConfig(
                massScaling.thrustReverseN,
                fallback.massScaling.thrustReverseN,
                `${path}.massScaling.thrustReverseN`
            ),
            thrustLateralN: readCurveConfig(
                massScaling.thrustLateralN,
                fallback.massScaling.thrustLateralN,
                `${path}.massScaling.thrustLateralN`
            ),
            turnTorqueNm: readCurveConfig(
                massScaling.turnTorqueNm,
                fallback.massScaling.turnTorqueNm,
                `${path}.massScaling.turnTorqueNm`
            ),
            speedLimitForwardMps: readCurveConfig(
                massScaling.speedLimitForwardMps,
                fallback.massScaling.speedLimitForwardMps,
                `${path}.massScaling.speedLimitForwardMps`
            ),
            speedLimitReverseMps: readCurveConfig(
                massScaling.speedLimitReverseMps,
                fallback.massScaling.speedLimitReverseMps,
                `${path}.massScaling.speedLimitReverseMps`
            ),
            speedLimitLateralMps: readCurveConfig(
                massScaling.speedLimitLateralMps,
                fallback.massScaling.speedLimitLateralMps,
                `${path}.massScaling.speedLimitLateralMps`
            ),
            angularSpeedLimitRadps: readCurveConfig(
                massScaling.angularSpeedLimitRadps,
                fallback.massScaling.angularSpeedLimitRadps,
                `${path}.massScaling.angularSpeedLimitRadps`
            ),
        },
    };
}

// P2-6: Извлечённые константы для fallback значений рейтинга
// Используются в resolveBalanceConfig() при парсинге balance.json
export const DEFAULT_RATING_BASE = 5;
export const DEFAULT_RATING_PLACEMENT_1 = 15;
export const DEFAULT_RATING_PLACEMENT_2 = 10;
export const DEFAULT_RATING_PLACEMENT_3 = 5;
export const DEFAULT_RATING_PLACEMENT_TOP5 = 2;
export const DEFAULT_RATING_PER_KILL = 2;

export function resolveBalanceConfig(raw: unknown): ResolvedBalanceConfig {
    const data = isRecord(raw) ? raw : {};

    const world = isRecord(data.world) ? data.world : {};
    const server = isRecord(data.server) ? data.server : {};
    const match = isRecord(data.match) ? data.match : {};
    const physics = isRecord(data.physics) ? data.physics : {};
    const controls = isRecord(data.controls) ? data.controls : {};
    const slimeConfigs = isRecord(data.slimeConfigs) ? data.slimeConfigs : {};
    const worldPhysics = isRecord(data.worldPhysics) ? data.worldPhysics : {};
    const clientNetSmoothing = isRecord(data.clientNetSmoothing) ? data.clientNetSmoothing : {};
    const camera = isRecord(data.camera) ? data.camera : {};
    const slime = isRecord(data.slime) ? data.slime : {};
    const combat = isRecord(data.combat) ? data.combat : {};
    const death = isRecord(data.death) ? data.death : {};
    const orbs = isRecord(data.orbs) ? data.orbs : {};
    const formulas = isRecord(data.formulas) ? data.formulas : {};
    const classes = isRecord(data.classes) ? data.classes : {};
    const chests = isRecord(data.chests) ? data.chests : {};
    const boosts = isRecord(data.boosts) ? data.boosts : {};
    const obstacles = isRecord(data.obstacles) ? data.obstacles : {};
    const safeZones = isRecord(data.safeZones) ? data.safeZones : {};
    const zones = isRecord(data.zones) ? data.zones : {};
    const hotZones = isRecord(data.hotZones) ? data.hotZones : {};
    const toxicPools = isRecord(data.toxicPools) ? data.toxicPools : {};
    const hunger = isRecord(data.hunger) ? data.hunger : {};
    const rebel = isRecord(data.rebel) ? data.rebel : {};
    const baseSlime = isRecord(slimeConfigs.base) ? slimeConfigs.base : {};
    const hunterSlime = isRecord(slimeConfigs.hunter) ? slimeConfigs.hunter : {};
    const warriorSlime = isRecord(slimeConfigs.warrior) ? slimeConfigs.warrior : {};
    const collectorSlime = isRecord(slimeConfigs.collector) ? slimeConfigs.collector : {};
    const worldShape = readString(
        worldPhysics.worldShape,
        DEFAULT_BALANCE_CONFIG.worldPhysics.worldShape,
        "worldPhysics.worldShape"
    ) as WorldPhysicsConfig["worldShape"];
    const hunter = isRecord(classes.hunter) ? classes.hunter : {};
    const warrior = isRecord(classes.warrior) ? classes.warrior : {};
    const collector = isRecord(classes.collector) ? classes.collector : {};
    const chestRewards = isRecord(chests.rewards) ? chests.rewards : {};
    const chestRewardWeights = isRecord(chestRewards.talentRarityWeights)
        ? chestRewards.talentRarityWeights
        : {};
    const boostAllowedByChestType = isRecord(boosts.allowedByChestType) ? boosts.allowedByChestType : {};
    const boostRage = isRecord(boosts.rage) ? boosts.rage : {};
    const boostHaste = isRecord(boosts.haste) ? boosts.haste : {};
    const boostGuard = isRecord(boosts.guard) ? boosts.guard : {};
    const boostGreed = isRecord(boosts.greed) ? boosts.greed : {};
    const zoneTypeWeights = isRecord(zones.typeWeights) ? zones.typeWeights : {};
    const zoneNectar = isRecord(zones.nectar) ? zones.nectar : {};
    const zoneIce = isRecord(zones.ice) ? zones.ice : {};
    const zoneMud = isRecord(zones.mud) ? zones.mud : {};
    const zoneLava = isRecord(zones.lava) ? zones.lava : {};
    const zoneTurbo = isRecord(zones.turbo) ? zones.turbo : {};
    const worldMapSize = readNumber(world.mapSize, DEFAULT_BALANCE_CONFIG.world.mapSize, "world.mapSize");
    const worldMapSizes = readNumberArray(
        world.mapSizes,
        DEFAULT_BALANCE_CONFIG.world.mapSizes,
        "world.mapSizes"
    ).filter((value) => Number.isFinite(value) && value > 0);

    const resolved: BalanceConfig = {
        world: {
            mapSize: worldMapSize,
            mapSizes: worldMapSizes,
        },
        server: {
            maxPlayers: readNumber(server.maxPlayers, DEFAULT_BALANCE_CONFIG.server.maxPlayers, "server.maxPlayers"),
            tickRate: readNumber(server.tickRate, DEFAULT_BALANCE_CONFIG.server.tickRate, "server.tickRate"),
            simulationIntervalMs: readNumber(
                server.simulationIntervalMs,
                DEFAULT_BALANCE_CONFIG.server.simulationIntervalMs,
                "server.simulationIntervalMs"
            ),
            globalCooldownMs: readNumber(
                server.globalCooldownMs,
                DEFAULT_BALANCE_CONFIG.server.globalCooldownMs,
                "server.globalCooldownMs"
            ),
            abilityQueueSize: readNumber(
                server.abilityQueueSize,
                DEFAULT_BALANCE_CONFIG.server.abilityQueueSize,
                "server.abilityQueueSize"
            ),
        },
        match: {
            durationSec: readNumber(match.durationSec, DEFAULT_BALANCE_CONFIG.match.durationSec, "match.durationSec"),
            resultsDurationSec: readNumber(
                match.resultsDurationSec,
                DEFAULT_BALANCE_CONFIG.match.resultsDurationSec,
                "match.resultsDurationSec"
            ),
            restartDelaySec: readNumber(
                match.restartDelaySec,
                DEFAULT_BALANCE_CONFIG.match.restartDelaySec,
                "match.restartDelaySec"
            ),
            phases: readPhases(match.phases, DEFAULT_BALANCE_CONFIG.match.phases, "match.phases"),
        },
        physics: {
            environmentDrag: readNumber(
                physics.environmentDrag,
                DEFAULT_BALANCE_CONFIG.physics.environmentDrag,
                "physics.environmentDrag"
            ),
            collisionRestitution: readNumber(
                physics.collisionRestitution,
                DEFAULT_BALANCE_CONFIG.physics.collisionRestitution,
                "physics.collisionRestitution"
            ),
            collisionImpulseCap: readNumber(
                physics.collisionImpulseCap,
                DEFAULT_BALANCE_CONFIG.physics.collisionImpulseCap,
                "physics.collisionImpulseCap"
            ),
            slimeLinearDamping: readNumber(
                physics.slimeLinearDamping,
                DEFAULT_BALANCE_CONFIG.physics.slimeLinearDamping,
                "physics.slimeLinearDamping"
            ),
            orbLinearDamping: readNumber(
                physics.orbLinearDamping,
                DEFAULT_BALANCE_CONFIG.physics.orbLinearDamping,
                "physics.orbLinearDamping"
            ),
            speedDampingRate: readNumber(
                physics.speedDampingRate,
                DEFAULT_BALANCE_CONFIG.physics.speedDampingRate,
                "physics.speedDampingRate"
            ),
            minSlimeMass: readNumber(
                physics.minSlimeMass,
                DEFAULT_BALANCE_CONFIG.physics.minSlimeMass,
                "physics.minSlimeMass"
            ),
            maxSlimeSpeed: readNumber(
                physics.maxSlimeSpeed,
                DEFAULT_BALANCE_CONFIG.physics.maxSlimeSpeed,
                "physics.maxSlimeSpeed"
            ),
            maxOrbSpeed: readNumber(
                physics.maxOrbSpeed,
                DEFAULT_BALANCE_CONFIG.physics.maxOrbSpeed,
                "physics.maxOrbSpeed"
            ),
        },
        controls: {
            joystickMode: readString(
                controls.joystickMode,
                DEFAULT_BALANCE_CONFIG.controls.joystickMode,
                "controls.joystickMode"
            ) as BalanceConfig["controls"]["joystickMode"],
            joystickRadius: readNumber(
                controls.joystickRadius,
                DEFAULT_BALANCE_CONFIG.controls.joystickRadius,
                "controls.joystickRadius"
            ),
            joystickDeadzone: readNumber(
                controls.joystickDeadzone,
                DEFAULT_BALANCE_CONFIG.controls.joystickDeadzone,
                "controls.joystickDeadzone"
            ),
            joystickSensitivity: readNumber(
                controls.joystickSensitivity,
                DEFAULT_BALANCE_CONFIG.controls.joystickSensitivity,
                "controls.joystickSensitivity"
            ),
            joystickFollowSpeed: readNumber(
                controls.joystickFollowSpeed,
                DEFAULT_BALANCE_CONFIG.controls.joystickFollowSpeed,
                "controls.joystickFollowSpeed"
            ),
            inputTimeoutMs: readNumber(
                controls.inputTimeoutMs,
                DEFAULT_BALANCE_CONFIG.controls.inputTimeoutMs,
                "controls.inputTimeoutMs"
            ),
            mouseDeadzone: Math.max(0, readNumber(
                controls.mouseDeadzone,
                DEFAULT_BALANCE_CONFIG.controls.mouseDeadzone,
                "controls.mouseDeadzone"
            )),
            mouseMaxDist: Math.max(1, readNumber(
                controls.mouseMaxDist,
                DEFAULT_BALANCE_CONFIG.controls.mouseMaxDist,
                "controls.mouseMaxDist"
            )),
        },
        slimeConfigs: {
            base: readSlimeConfig(baseSlime, DEFAULT_BALANCE_CONFIG.slimeConfigs.base, "slimeConfigs.base"),
            hunter: readSlimeConfig(hunterSlime, DEFAULT_BALANCE_CONFIG.slimeConfigs.hunter, "slimeConfigs.hunter"),
            warrior: readSlimeConfig(warriorSlime, DEFAULT_BALANCE_CONFIG.slimeConfigs.warrior, "slimeConfigs.warrior"),
            collector: readSlimeConfig(
                collectorSlime,
                DEFAULT_BALANCE_CONFIG.slimeConfigs.collector,
                "slimeConfigs.collector"
            ),
        },
        worldPhysics: {
            forwardDragK: readNumber(
                worldPhysics.forwardDragK ?? worldPhysics.linearDragK,
                DEFAULT_BALANCE_CONFIG.worldPhysics.forwardDragK,
                "worldPhysics.forwardDragK"
            ),
            lateralGripMultiplier: readNumber(
                worldPhysics.lateralGripMultiplier,
                DEFAULT_BALANCE_CONFIG.worldPhysics.lateralGripMultiplier,
                "worldPhysics.lateralGripMultiplier"
            ),
            angularDragK: readNumber(
                worldPhysics.angularDragK,
                DEFAULT_BALANCE_CONFIG.worldPhysics.angularDragK,
                "worldPhysics.angularDragK"
            ),
            restitution: readNumber(
                worldPhysics.restitution,
                DEFAULT_BALANCE_CONFIG.worldPhysics.restitution,
                "worldPhysics.restitution"
            ),
            maxPositionCorrectionM: readNumber(
                worldPhysics.maxPositionCorrectionM,
                DEFAULT_BALANCE_CONFIG.worldPhysics.maxPositionCorrectionM,
                "worldPhysics.maxPositionCorrectionM"
            ),
            worldShape,
            widthM: readNumber(
                worldPhysics.widthM,
                worldMapSize,
                "worldPhysics.widthM"
            ),
            heightM: readNumber(
                worldPhysics.heightM,
                worldMapSize,
                "worldPhysics.heightM"
            ),
            radiusM: readNumber(
                worldPhysics.radiusM,
                worldMapSize / 2,
                "worldPhysics.radiusM"
            ),
        },
        clientNetSmoothing: {
            lookAheadMs: Math.max(0, readNumber(
                clientNetSmoothing.lookAheadMs,
                DEFAULT_BALANCE_CONFIG.clientNetSmoothing.lookAheadMs,
                "clientNetSmoothing.lookAheadMs"
            )),
            velocityWeight: Math.max(0, Math.min(1, readNumber(
                clientNetSmoothing.velocityWeight,
                DEFAULT_BALANCE_CONFIG.clientNetSmoothing.velocityWeight,
                "clientNetSmoothing.velocityWeight"
            ))),
            catchUpSpeed: Math.max(0, readNumber(
                clientNetSmoothing.catchUpSpeed,
                DEFAULT_BALANCE_CONFIG.clientNetSmoothing.catchUpSpeed,
                "clientNetSmoothing.catchUpSpeed"
            )),
            maxCatchUpSpeed: Math.max(0, readNumber(
                clientNetSmoothing.maxCatchUpSpeed,
                DEFAULT_BALANCE_CONFIG.clientNetSmoothing.maxCatchUpSpeed,
                "clientNetSmoothing.maxCatchUpSpeed"
            )),
            teleportThreshold: Math.max(1, readNumber(
                clientNetSmoothing.teleportThreshold,
                DEFAULT_BALANCE_CONFIG.clientNetSmoothing.teleportThreshold,
                "clientNetSmoothing.teleportThreshold"
            )),
            angleCatchUpSpeed: Math.max(0, readNumber(
                clientNetSmoothing.angleCatchUpSpeed,
                DEFAULT_BALANCE_CONFIG.clientNetSmoothing.angleCatchUpSpeed,
                "clientNetSmoothing.angleCatchUpSpeed"
            )),
        },
        camera: {
            zoomMin: readNumber(camera.zoomMin, DEFAULT_BALANCE_CONFIG.camera.zoomMin, "camera.zoomMin"),
            zoomMax: readNumber(camera.zoomMax, DEFAULT_BALANCE_CONFIG.camera.zoomMax, "camera.zoomMax"),
            zoomSpeed: readNumber(camera.zoomSpeed, DEFAULT_BALANCE_CONFIG.camera.zoomSpeed, "camera.zoomSpeed"),
            zoomDamageHoldSec: readNumber(
                camera.zoomDamageHoldSec,
                DEFAULT_BALANCE_CONFIG.camera.zoomDamageHoldSec,
                "camera.zoomDamageHoldSec"
            ),
            zoomMassMin: readNumber(camera.zoomMassMin, DEFAULT_BALANCE_CONFIG.camera.zoomMassMin, "camera.zoomMassMin"),
            zoomMassMax: readNumber(camera.zoomMassMax, DEFAULT_BALANCE_CONFIG.camera.zoomMassMax, "camera.zoomMassMax"),
        },
        slime: {
            initialMass: readNumber(
                slime.initialMass,
                DEFAULT_BALANCE_CONFIG.slime.initialMass,
                "slime.initialMass"
            ),
            initialLevel: readNumber(
                slime.initialLevel,
                DEFAULT_BALANCE_CONFIG.slime.initialLevel,
                "slime.initialLevel"
            ),
            initialClassId: readNumber(
                slime.initialClassId,
                DEFAULT_BALANCE_CONFIG.slime.initialClassId,
                "slime.initialClassId"
            ),
            levelThresholds: Array.isArray(slime.levelThresholds)
                ? slime.levelThresholds.map((v: unknown, i: number) =>
                    readNumber(v, DEFAULT_BALANCE_CONFIG.slime.levelThresholds[i] ?? 100, `slime.levelThresholds[${i}]`))
                : DEFAULT_BALANCE_CONFIG.slime.levelThresholds,
            slotUnlockLevels: Array.isArray(slime.slotUnlockLevels)
                ? slime.slotUnlockLevels.map((v: unknown, i: number) =>
                    readNumber(v, DEFAULT_BALANCE_CONFIG.slime.slotUnlockLevels[i] ?? 1, `slime.slotUnlockLevels[${i}]`))
                : DEFAULT_BALANCE_CONFIG.slime.slotUnlockLevels,
            talentGrantLevels: Array.isArray(slime.talentGrantLevels)
                ? slime.talentGrantLevels.map((v: unknown, i: number) =>
                    readNumber(v, DEFAULT_BALANCE_CONFIG.slime.talentGrantLevels[i] ?? 2, `slime.talentGrantLevels[${i}]`))
                : DEFAULT_BALANCE_CONFIG.slime.talentGrantLevels,
            cardChoiceTimeoutSec: readNumber(
                slime.cardChoiceTimeoutSec,
                DEFAULT_BALANCE_CONFIG.slime.cardChoiceTimeoutSec,
                "slime.cardChoiceTimeoutSec"
            ),
            abilityPool: Array.isArray(slime.abilityPool)
                ? slime.abilityPool.filter((v: unknown) => typeof v === "string") as string[]
                : DEFAULT_BALANCE_CONFIG.slime.abilityPool,
        },
        combat: {
            mouthArcDeg: readNumber(
                combat.mouthArcDeg,
                DEFAULT_BALANCE_CONFIG.combat.mouthArcDeg,
                "combat.mouthArcDeg"
            ),
            tailArcDeg: readNumber(
                combat.tailArcDeg,
                DEFAULT_BALANCE_CONFIG.combat.tailArcDeg,
                "combat.tailArcDeg"
            ),
            tailDamageMultiplier: readNumber(
                combat.tailDamageMultiplier,
                DEFAULT_BALANCE_CONFIG.combat.tailDamageMultiplier,
                "combat.tailDamageMultiplier"
            ),
            attackCooldownSec: readNumber(
                combat.attackCooldownSec,
                DEFAULT_BALANCE_CONFIG.combat.attackCooldownSec,
                "combat.attackCooldownSec"
            ),
            damageInvulnSec: readNumber(
                combat.damageInvulnSec,
                DEFAULT_BALANCE_CONFIG.combat.damageInvulnSec,
                "combat.damageInvulnSec"
            ),
            biteCooldownSec: readNumber(
                combat.biteCooldownSec,
                DEFAULT_BALANCE_CONFIG.combat.biteCooldownSec,
                "combat.biteCooldownSec"
            ),
            respawnShieldSec: readNumber(
                combat.respawnShieldSec,
                DEFAULT_BALANCE_CONFIG.combat.respawnShieldSec,
                "combat.respawnShieldSec"
            ),
            lastBreathDurationSec: readNumber(
                combat.lastBreathDurationSec,
                DEFAULT_BALANCE_CONFIG.combat.lastBreathDurationSec,
                "combat.lastBreathDurationSec"
            ),
            lastBreathSpeedPenalty: readNumber(
                combat.lastBreathSpeedPenalty ?? combat.lastBreathSpeedMult,
                DEFAULT_BALANCE_CONFIG.combat.lastBreathSpeedPenalty,
                "combat.lastBreathSpeedPenalty"
            ),
            pvpBiteAttackerGainPct: readNumber(
                combat.pvpBiteAttackerGainPct,
                DEFAULT_BALANCE_CONFIG.combat.pvpBiteAttackerGainPct,
                "combat.pvpBiteAttackerGainPct"
            ),
            pvpBiteScatterPct: readNumber(
                combat.pvpBiteScatterPct,
                DEFAULT_BALANCE_CONFIG.combat.pvpBiteScatterPct,
                "combat.pvpBiteScatterPct"
            ),
            pvpBiteScatterOrbCount: readNumber(
                combat.pvpBiteScatterOrbCount,
                DEFAULT_BALANCE_CONFIG.combat.pvpBiteScatterOrbCount,
                "combat.pvpBiteScatterOrbCount"
            ),
            pvpBiteScatterSpeed: readNumber(
                combat.pvpBiteScatterSpeed,
                DEFAULT_BALANCE_CONFIG.combat.pvpBiteScatterSpeed,
                "combat.pvpBiteScatterSpeed"
            ),
            scatterOrbMinMass: readNumber(
                combat.scatterOrbMinMass,
                DEFAULT_BALANCE_CONFIG.combat.scatterOrbMinMass,
                "combat.scatterOrbMinMass"
            ),
        },
        death: {
            respawnDelaySec: readNumber(
                death.respawnDelaySec,
                DEFAULT_BALANCE_CONFIG.death.respawnDelaySec,
                "death.respawnDelaySec"
            ),
            massLostPercent: readNumber(
                death.massLostPercent,
                DEFAULT_BALANCE_CONFIG.death.massLostPercent,
                "death.massLostPercent"
            ),
            massToOrbsPercent: readNumber(
                death.massToOrbsPercent,
                DEFAULT_BALANCE_CONFIG.death.massToOrbsPercent,
                "death.massToOrbsPercent"
            ),
            orbsCount: readNumber(
                death.orbsCount,
                DEFAULT_BALANCE_CONFIG.death.orbsCount,
                "death.orbsCount"
            ),
            minRespawnMass: readNumber(
                death.minRespawnMass,
                DEFAULT_BALANCE_CONFIG.death.minRespawnMass,
                "death.minRespawnMass"
            ),
        },
        orbs: {
            initialCount: readNumber(
                orbs.initialCount,
                DEFAULT_BALANCE_CONFIG.orbs.initialCount,
                "orbs.initialCount"
            ),
            maxCount: readNumber(orbs.maxCount, DEFAULT_BALANCE_CONFIG.orbs.maxCount, "orbs.maxCount"),
            respawnIntervalSec: readNumber(
                orbs.respawnIntervalSec,
                DEFAULT_BALANCE_CONFIG.orbs.respawnIntervalSec,
                "orbs.respawnIntervalSec"
            ),
            minMass: readNumber(orbs.minMass, DEFAULT_BALANCE_CONFIG.orbs.minMass, "orbs.minMass"),
            minRadius: readNumber(orbs.minRadius, DEFAULT_BALANCE_CONFIG.orbs.minRadius, "orbs.minRadius"),
            orbBiteMinMass: readNumber(
                orbs.orbBiteMinMass,
                DEFAULT_BALANCE_CONFIG.orbs.orbBiteMinMass,
                "orbs.orbBiteMinMass"
            ),
            orbBiteMaxMass: readNumber(
                orbs.orbBiteMaxMass,
                DEFAULT_BALANCE_CONFIG.orbs.orbBiteMaxMass,
                "orbs.orbBiteMaxMass"
            ),
            types: (() => {
                if (!Array.isArray(orbs.types)) return DEFAULT_BALANCE_CONFIG.orbs.types;
                return orbs.types.map((entry: unknown, index: number) => {
                    if (!isRecord(entry)) {
                        throw new Error(`Invalid orb type at orbs.types[${index}]`);
                    }
                    const fallback = DEFAULT_BALANCE_CONFIG.orbs.types[index] ?? DEFAULT_BALANCE_CONFIG.orbs.types[0];
                    const massRange = Array.isArray(entry.massRange) ? entry.massRange : [];
                    return {
                        id: readString(entry.id, fallback.id, `orbs.types[${index}].id`),
                        weight: readNumber(entry.weight, fallback.weight, `orbs.types[${index}].weight`),
                        density: readNumber(entry.density, fallback.density, `orbs.types[${index}].density`),
                        massRange: [
                            readNumber(massRange[0], fallback.massRange[0], `orbs.types[${index}].massRange[0]`),
                            readNumber(massRange[1], fallback.massRange[1], `orbs.types[${index}].massRange[1]`),
                        ],
                    };
                });
            })(),
            pushForce: readNumber(orbs.pushForce, DEFAULT_BALANCE_CONFIG.orbs.pushForce, "orbs.pushForce"),
        },
        formulas: {
            damage: readFormula(formulas.damage, DEFAULT_BALANCE_CONFIG.formulas.damage, "formulas.damage"),
            speed: readFormula(formulas.speed, DEFAULT_BALANCE_CONFIG.formulas.speed, "formulas.speed"),
            radius: readFormula(formulas.radius, DEFAULT_BALANCE_CONFIG.formulas.radius, "formulas.radius"),
        },
        classes: {
            hunter: {
                speedMult: readNumber(
                    hunter.speedMult,
                    DEFAULT_BALANCE_CONFIG.classes.hunter.speedMult,
                    "classes.hunter.speedMult"
                ),
                biteResistPct: readNumber(
                    hunter.biteResistPct,
                    DEFAULT_BALANCE_CONFIG.classes.hunter.biteResistPct,
                    "classes.hunter.biteResistPct"
                ),
                swallowLimit: readNumber(
                    hunter.swallowLimit,
                    DEFAULT_BALANCE_CONFIG.classes.hunter.swallowLimit,
                    "classes.hunter.swallowLimit"
                ),
                biteFraction: readNumber(
                    hunter.biteFraction,
                    DEFAULT_BALANCE_CONFIG.classes.hunter.biteFraction,
                    "classes.hunter.biteFraction"
                ),
            },
            warrior: {
                speedMult: readNumber(
                    warrior.speedMult,
                    DEFAULT_BALANCE_CONFIG.classes.warrior.speedMult,
                    "classes.warrior.speedMult"
                ),
                biteResistPct: readNumber(
                    warrior.biteResistPct,
                    DEFAULT_BALANCE_CONFIG.classes.warrior.biteResistPct,
                    "classes.warrior.biteResistPct"
                ),
                damageVsSlimeMult: readNumber(
                    warrior.damageVsSlimeMult,
                    DEFAULT_BALANCE_CONFIG.classes.warrior.damageVsSlimeMult,
                    "classes.warrior.damageVsSlimeMult"
                ),
                swallowLimit: readNumber(
                    warrior.swallowLimit,
                    DEFAULT_BALANCE_CONFIG.classes.warrior.swallowLimit,
                    "classes.warrior.swallowLimit"
                ),
                biteFraction: readNumber(
                    warrior.biteFraction,
                    DEFAULT_BALANCE_CONFIG.classes.warrior.biteFraction,
                    "classes.warrior.biteFraction"
                ),
            },
            collector: {
                radiusMult: readNumber(
                    collector.radiusMult,
                    DEFAULT_BALANCE_CONFIG.classes.collector.radiusMult,
                    "classes.collector.radiusMult"
                ),
                eatingPowerMult: readNumber(
                    collector.eatingPowerMult,
                    DEFAULT_BALANCE_CONFIG.classes.collector.eatingPowerMult,
                    "classes.collector.eatingPowerMult"
                ),
                swallowLimit: readNumber(
                    collector.swallowLimit,
                    DEFAULT_BALANCE_CONFIG.classes.collector.swallowLimit,
                    "classes.collector.swallowLimit"
                ),
                biteFraction: readNumber(
                    collector.biteFraction,
                    DEFAULT_BALANCE_CONFIG.classes.collector.biteFraction,
                    "classes.collector.biteFraction"
                ),
            },
        },
        abilities: (() => {
            const abilities = isRecord(data.abilities) ? data.abilities : {};
            const dash = isRecord(abilities.dash) ? abilities.dash : {};
            const shield = isRecord(abilities.shield) ? abilities.shield : {};
            const magnet = isRecord(abilities.magnet) ? abilities.magnet : {};
            const slow = isRecord(abilities.slow) ? abilities.slow : {};
            const projectile = isRecord(abilities.projectile) ? abilities.projectile : {};
            const spit = isRecord(abilities.spit) ? abilities.spit : {};
            const bomb = isRecord(abilities.bomb) ? abilities.bomb : {};
            const push = isRecord(abilities.push) ? abilities.push : {};
            const mine = isRecord(abilities.mine) ? abilities.mine : {};
            const dashLevelsRaw = Array.isArray(dash.levels) ? dash.levels : null;
            const shieldLevelsRaw = Array.isArray(shield.levels) ? shield.levels : null;
            const magnetLevelsRaw = Array.isArray(magnet.levels) ? magnet.levels : null;
            const slowLevelsRaw = Array.isArray(slow.levels) ? slow.levels : null;
            const projectileLevelsRaw = Array.isArray(projectile.levels) ? projectile.levels : null;
            const spitLevelsRaw = Array.isArray(spit.levels) ? spit.levels : null;
            const bombLevelsRaw = Array.isArray(bomb.levels) ? bomb.levels : null;
            const pushLevelsRaw = Array.isArray(push.levels) ? push.levels : null;
            const mineLevelsRaw = Array.isArray(mine.levels) ? mine.levels : null;

            const dashLevelsFallback = DEFAULT_BALANCE_CONFIG.abilities.dash.levels ?? [];
            const shieldLevelsFallback = DEFAULT_BALANCE_CONFIG.abilities.shield.levels ?? [];
            const magnetLevelsFallback = DEFAULT_BALANCE_CONFIG.abilities.magnet.levels ?? [];
            const slowLevelsFallback = DEFAULT_BALANCE_CONFIG.abilities.slow.levels ?? [];
            const projectileLevelsFallback = DEFAULT_BALANCE_CONFIG.abilities.projectile.levels ?? [];
            const spitLevelsFallback = DEFAULT_BALANCE_CONFIG.abilities.spit.levels ?? [];
            const bombLevelsFallback = DEFAULT_BALANCE_CONFIG.abilities.bomb.levels ?? [];
            const pushLevelsFallback = DEFAULT_BALANCE_CONFIG.abilities.push.levels ?? [];
            const mineLevelsFallback = DEFAULT_BALANCE_CONFIG.abilities.mine.levels ?? [];

            const dashLevels = dashLevelsRaw && dashLevelsRaw.length > 0
                ? dashLevelsRaw.map((level, index) => {
                    const fallback = dashLevelsFallback[index] ?? DEFAULT_BALANCE_CONFIG.abilities.dash;
                    const dataLevel = isRecord(level) ? level : {};
                    return {
                        massCostPct: readNumber(dataLevel.massCostPct, fallback.massCostPct, `abilities.dash.levels.${index}.massCostPct`),
                        cooldownSec: readNumber(dataLevel.cooldownSec, fallback.cooldownSec, `abilities.dash.levels.${index}.cooldownSec`),
                        distanceM: readNumber(dataLevel.distanceM, fallback.distanceM, `abilities.dash.levels.${index}.distanceM`),
                        durationSec: readNumber(dataLevel.durationSec, fallback.durationSec, `abilities.dash.levels.${index}.durationSec`),
                        collisionDamageMult: readNumber(dataLevel.collisionDamageMult, fallback.collisionDamageMult, `abilities.dash.levels.${index}.collisionDamageMult`),
                    };
                })
                : dashLevelsFallback;

            const shieldLevels = shieldLevelsRaw && shieldLevelsRaw.length > 0
                ? shieldLevelsRaw.map((level, index) => {
                    const fallback = shieldLevelsFallback[index] ?? DEFAULT_BALANCE_CONFIG.abilities.shield;
                    const dataLevel = isRecord(level) ? level : {};
                    return {
                        massCostPct: readNumber(dataLevel.massCostPct, fallback.massCostPct, `abilities.shield.levels.${index}.massCostPct`),
                        cooldownSec: readNumber(dataLevel.cooldownSec, fallback.cooldownSec, `abilities.shield.levels.${index}.cooldownSec`),
                        durationSec: readNumber(dataLevel.durationSec, fallback.durationSec, `abilities.shield.levels.${index}.durationSec`),
                        reflectDamagePct: readNumber(dataLevel.reflectDamagePct, fallback.reflectDamagePct, `abilities.shield.levels.${index}.reflectDamagePct`),
                        burstRadiusM: readNumber(dataLevel.burstRadiusM, fallback.burstRadiusM, `abilities.shield.levels.${index}.burstRadiusM`),
                    };
                })
                : shieldLevelsFallback;

            const magnetLevels = magnetLevelsRaw && magnetLevelsRaw.length > 0
                ? magnetLevelsRaw.map((level, index) => {
                    const fallback = magnetLevelsFallback[index] ?? DEFAULT_BALANCE_CONFIG.abilities.magnet;
                    const dataLevel = isRecord(level) ? level : {};
                    return {
                        massCostPct: readNumber(dataLevel.massCostPct, fallback.massCostPct, `abilities.magnet.levels.${index}.massCostPct`),
                        cooldownSec: readNumber(dataLevel.cooldownSec, fallback.cooldownSec, `abilities.magnet.levels.${index}.cooldownSec`),
                        durationSec: readNumber(dataLevel.durationSec, fallback.durationSec, `abilities.magnet.levels.${index}.durationSec`),
                        radiusM: readNumber(dataLevel.radiusM, fallback.radiusM, `abilities.magnet.levels.${index}.radiusM`),
                        pullSpeedMps: readNumber(dataLevel.pullSpeedMps, fallback.pullSpeedMps, `abilities.magnet.levels.${index}.pullSpeedMps`),
                    };
                })
                : magnetLevelsFallback;

            const slowLevels = slowLevelsRaw && slowLevelsRaw.length > 0
                ? slowLevelsRaw.map((level, index) => {
                    const fallback = slowLevelsFallback[index] ?? DEFAULT_BALANCE_CONFIG.abilities.slow;
                    const dataLevel = isRecord(level) ? level : {};
                    return {
                        massCostPct: readNumber(dataLevel.massCostPct, fallback.massCostPct, `abilities.slow.levels.${index}.massCostPct`),
                        cooldownSec: readNumber(dataLevel.cooldownSec, fallback.cooldownSec, `abilities.slow.levels.${index}.cooldownSec`),
                        durationSec: readNumber(dataLevel.durationSec, fallback.durationSec, `abilities.slow.levels.${index}.durationSec`),
                        radiusM: readNumber(dataLevel.radiusM, fallback.radiusM, `abilities.slow.levels.${index}.radiusM`),
                        slowPct: readNumber(dataLevel.slowPct, fallback.slowPct, `abilities.slow.levels.${index}.slowPct`),
                    };
                })
                : slowLevelsFallback;

            const projectileLevels = projectileLevelsRaw && projectileLevelsRaw.length > 0
                ? projectileLevelsRaw.map((level, index) => {
                    const fallback = projectileLevelsFallback[index] ?? DEFAULT_BALANCE_CONFIG.abilities.projectile;
                    const dataLevel = isRecord(level) ? level : {};
                    return {
                        massCostPct: readNumber(dataLevel.massCostPct, fallback.massCostPct, `abilities.projectile.levels.${index}.massCostPct`),
                        cooldownSec: readNumber(dataLevel.cooldownSec, fallback.cooldownSec, `abilities.projectile.levels.${index}.cooldownSec`),
                        speedMps: readNumber(dataLevel.speedMps, fallback.speedMps, `abilities.projectile.levels.${index}.speedMps`),
                        rangeM: readNumber(dataLevel.rangeM, fallback.rangeM, `abilities.projectile.levels.${index}.rangeM`),
                        damagePct: readNumber(dataLevel.damagePct, fallback.damagePct, `abilities.projectile.levels.${index}.damagePct`),
                        radiusM: readNumber(dataLevel.radiusM, fallback.radiusM, `abilities.projectile.levels.${index}.radiusM`),
                        piercingHits: readNumber(dataLevel.piercingHits, fallback.piercingHits, `abilities.projectile.levels.${index}.piercingHits`),
                        piercingDamagePct: readNumber(dataLevel.piercingDamagePct, fallback.piercingDamagePct, `abilities.projectile.levels.${index}.piercingDamagePct`),
                    };
                })
                : projectileLevelsFallback;

            const spitLevels = spitLevelsRaw && spitLevelsRaw.length > 0
                ? spitLevelsRaw.map((level, index) => {
                    const fallback = spitLevelsFallback[index] ?? DEFAULT_BALANCE_CONFIG.abilities.spit;
                    const dataLevel = isRecord(level) ? level : {};
                    return {
                        massCostPct: readNumber(dataLevel.massCostPct, fallback.massCostPct, `abilities.spit.levels.${index}.massCostPct`),
                        cooldownSec: readNumber(dataLevel.cooldownSec, fallback.cooldownSec, `abilities.spit.levels.${index}.cooldownSec`),
                        speedMps: readNumber(dataLevel.speedMps, fallback.speedMps, `abilities.spit.levels.${index}.speedMps`),
                        rangeM: readNumber(dataLevel.rangeM, fallback.rangeM, `abilities.spit.levels.${index}.rangeM`),
                        damagePct: readNumber(dataLevel.damagePct, fallback.damagePct, `abilities.spit.levels.${index}.damagePct`),
                        radiusM: readNumber(dataLevel.radiusM, fallback.radiusM, `abilities.spit.levels.${index}.radiusM`),
                        projectileCount: readNumber(dataLevel.projectileCount, fallback.projectileCount, `abilities.spit.levels.${index}.projectileCount`),
                        spreadAngleDeg: readNumber(dataLevel.spreadAngleDeg, fallback.spreadAngleDeg, `abilities.spit.levels.${index}.spreadAngleDeg`),
                    };
                })
                : spitLevelsFallback;

            const bombLevels = bombLevelsRaw && bombLevelsRaw.length > 0
                ? bombLevelsRaw.map((level, index) => {
                    const fallback = bombLevelsFallback[index] ?? DEFAULT_BALANCE_CONFIG.abilities.bomb;
                    const dataLevel = isRecord(level) ? level : {};
                    return {
                        massCostPct: readNumber(dataLevel.massCostPct, fallback.massCostPct, `abilities.bomb.levels.${index}.massCostPct`),
                        cooldownSec: readNumber(dataLevel.cooldownSec, fallback.cooldownSec, `abilities.bomb.levels.${index}.cooldownSec`),
                        speedMps: readNumber(dataLevel.speedMps, fallback.speedMps, `abilities.bomb.levels.${index}.speedMps`),
                        rangeM: readNumber(dataLevel.rangeM, fallback.rangeM, `abilities.bomb.levels.${index}.rangeM`),
                        damagePct: readNumber(dataLevel.damagePct, fallback.damagePct, `abilities.bomb.levels.${index}.damagePct`),
                        radiusM: readNumber(dataLevel.radiusM, fallback.radiusM, `abilities.bomb.levels.${index}.radiusM`),
                        explosionRadiusM: readNumber(dataLevel.explosionRadiusM, fallback.explosionRadiusM, `abilities.bomb.levels.${index}.explosionRadiusM`),
                    };
                })
                : bombLevelsFallback;

            const pushLevels = pushLevelsRaw && pushLevelsRaw.length > 0
                ? pushLevelsRaw.map((level, index) => {
                    const fallback = pushLevelsFallback[index] ?? DEFAULT_BALANCE_CONFIG.abilities.push;
                    const dataLevel = isRecord(level) ? level : {};
                    return {
                        massCostPct: readNumber(dataLevel.massCostPct, fallback.massCostPct, `abilities.push.levels.${index}.massCostPct`),
                        cooldownSec: readNumber(dataLevel.cooldownSec, fallback.cooldownSec, `abilities.push.levels.${index}.cooldownSec`),
                        radiusM: readNumber(dataLevel.radiusM, fallback.radiusM, `abilities.push.levels.${index}.radiusM`),
                        impulseNs: readNumber(dataLevel.impulseNs, fallback.impulseNs, `abilities.push.levels.${index}.impulseNs`),
                        minSpeedMps: readNumber(dataLevel.minSpeedMps, fallback.minSpeedMps, `abilities.push.levels.${index}.minSpeedMps`),
                        maxSpeedMps: readNumber(dataLevel.maxSpeedMps, fallback.maxSpeedMps, `abilities.push.levels.${index}.maxSpeedMps`),
                    };
                })
                : pushLevelsFallback;

            const mineLevels = mineLevelsRaw && mineLevelsRaw.length > 0
                ? mineLevelsRaw.map((level, index) => {
                    const fallback = mineLevelsFallback[index] ?? DEFAULT_BALANCE_CONFIG.abilities.mine;
                    const dataLevel = isRecord(level) ? level : {};
                    return {
                        massCostPct: readNumber(dataLevel.massCostPct, fallback.massCostPct, `abilities.mine.levels.${index}.massCostPct`),
                        cooldownSec: readNumber(dataLevel.cooldownSec, fallback.cooldownSec, `abilities.mine.levels.${index}.cooldownSec`),
                        damagePct: readNumber(dataLevel.damagePct, fallback.damagePct, `abilities.mine.levels.${index}.damagePct`),
                        radiusM: readNumber(dataLevel.radiusM, fallback.radiusM, `abilities.mine.levels.${index}.radiusM`),
                        durationSec: readNumber(dataLevel.durationSec, fallback.durationSec, `abilities.mine.levels.${index}.durationSec`),
                        maxMines: readNumber(dataLevel.maxMines, fallback.maxMines, `abilities.mine.levels.${index}.maxMines`),
                    };
                })
                : mineLevelsFallback;
            return {
                dash: {
                    massCostPct: readNumber(dash.massCostPct, DEFAULT_BALANCE_CONFIG.abilities.dash.massCostPct, "abilities.dash.massCostPct"),
                    cooldownSec: readNumber(dash.cooldownSec, DEFAULT_BALANCE_CONFIG.abilities.dash.cooldownSec, "abilities.dash.cooldownSec"),
                    distanceM: readNumber(dash.distanceM, DEFAULT_BALANCE_CONFIG.abilities.dash.distanceM, "abilities.dash.distanceM"),
                    durationSec: readNumber(dash.durationSec, DEFAULT_BALANCE_CONFIG.abilities.dash.durationSec, "abilities.dash.durationSec"),
                    collisionDamageMult: readNumber(dash.collisionDamageMult, DEFAULT_BALANCE_CONFIG.abilities.dash.collisionDamageMult, "abilities.dash.collisionDamageMult"),
                    levels: dashLevels,
                },
                shield: {
                    massCostPct: readNumber(shield.massCostPct, DEFAULT_BALANCE_CONFIG.abilities.shield.massCostPct, "abilities.shield.massCostPct"),
                    cooldownSec: readNumber(shield.cooldownSec, DEFAULT_BALANCE_CONFIG.abilities.shield.cooldownSec, "abilities.shield.cooldownSec"),
                    durationSec: readNumber(shield.durationSec, DEFAULT_BALANCE_CONFIG.abilities.shield.durationSec, "abilities.shield.durationSec"),
                    reflectDamagePct: readNumber(shield.reflectDamagePct, DEFAULT_BALANCE_CONFIG.abilities.shield.reflectDamagePct, "abilities.shield.reflectDamagePct"),
                    burstRadiusM: readNumber(shield.burstRadiusM, DEFAULT_BALANCE_CONFIG.abilities.shield.burstRadiusM, "abilities.shield.burstRadiusM"),
                    levels: shieldLevels,
                },
                magnet: {
                    massCostPct: readNumber(magnet.massCostPct, DEFAULT_BALANCE_CONFIG.abilities.magnet.massCostPct, "abilities.magnet.massCostPct"),
                    cooldownSec: readNumber(magnet.cooldownSec, DEFAULT_BALANCE_CONFIG.abilities.magnet.cooldownSec, "abilities.magnet.cooldownSec"),
                    durationSec: readNumber(magnet.durationSec, DEFAULT_BALANCE_CONFIG.abilities.magnet.durationSec, "abilities.magnet.durationSec"),
                    radiusM: readNumber(magnet.radiusM, DEFAULT_BALANCE_CONFIG.abilities.magnet.radiusM, "abilities.magnet.radiusM"),
                    pullSpeedMps: readNumber(magnet.pullSpeedMps, DEFAULT_BALANCE_CONFIG.abilities.magnet.pullSpeedMps, "abilities.magnet.pullSpeedMps"),
                    levels: magnetLevels,
                },
                slow: {
                    massCostPct: readNumber(slow.massCostPct, DEFAULT_BALANCE_CONFIG.abilities.slow.massCostPct, "abilities.slow.massCostPct"),
                    cooldownSec: readNumber(slow.cooldownSec, DEFAULT_BALANCE_CONFIG.abilities.slow.cooldownSec, "abilities.slow.cooldownSec"),
                    durationSec: readNumber(slow.durationSec, DEFAULT_BALANCE_CONFIG.abilities.slow.durationSec, "abilities.slow.durationSec"),
                    radiusM: readNumber(slow.radiusM, DEFAULT_BALANCE_CONFIG.abilities.slow.radiusM, "abilities.slow.radiusM"),
                    slowPct: readNumber(slow.slowPct, DEFAULT_BALANCE_CONFIG.abilities.slow.slowPct, "abilities.slow.slowPct"),
                    levels: slowLevels,
                },
                projectile: {
                    massCostPct: readNumber(projectile.massCostPct, DEFAULT_BALANCE_CONFIG.abilities.projectile.massCostPct, "abilities.projectile.massCostPct"),
                    cooldownSec: readNumber(projectile.cooldownSec, DEFAULT_BALANCE_CONFIG.abilities.projectile.cooldownSec, "abilities.projectile.cooldownSec"),
                    speedMps: readNumber(projectile.speedMps, DEFAULT_BALANCE_CONFIG.abilities.projectile.speedMps, "abilities.projectile.speedMps"),
                    rangeM: readNumber(projectile.rangeM, DEFAULT_BALANCE_CONFIG.abilities.projectile.rangeM, "abilities.projectile.rangeM"),
                    damagePct: readNumber(projectile.damagePct, DEFAULT_BALANCE_CONFIG.abilities.projectile.damagePct, "abilities.projectile.damagePct"),
                    radiusM: readNumber(projectile.radiusM, DEFAULT_BALANCE_CONFIG.abilities.projectile.radiusM, "abilities.projectile.radiusM"),
                    piercingHits: readNumber(projectile.piercingHits, DEFAULT_BALANCE_CONFIG.abilities.projectile.piercingHits, "abilities.projectile.piercingHits"),
                    piercingDamagePct: readNumber(projectile.piercingDamagePct, DEFAULT_BALANCE_CONFIG.abilities.projectile.piercingDamagePct, "abilities.projectile.piercingDamagePct"),
                    levels: projectileLevels,
                },
                spit: {
                    massCostPct: readNumber(spit.massCostPct, DEFAULT_BALANCE_CONFIG.abilities.spit.massCostPct, "abilities.spit.massCostPct"),
                    cooldownSec: readNumber(spit.cooldownSec, DEFAULT_BALANCE_CONFIG.abilities.spit.cooldownSec, "abilities.spit.cooldownSec"),
                    speedMps: readNumber(spit.speedMps, DEFAULT_BALANCE_CONFIG.abilities.spit.speedMps, "abilities.spit.speedMps"),
                    rangeM: readNumber(spit.rangeM, DEFAULT_BALANCE_CONFIG.abilities.spit.rangeM, "abilities.spit.rangeM"),
                    damagePct: readNumber(spit.damagePct, DEFAULT_BALANCE_CONFIG.abilities.spit.damagePct, "abilities.spit.damagePct"),
                    radiusM: readNumber(spit.radiusM, DEFAULT_BALANCE_CONFIG.abilities.spit.radiusM, "abilities.spit.radiusM"),
                    projectileCount: readNumber(spit.projectileCount, DEFAULT_BALANCE_CONFIG.abilities.spit.projectileCount, "abilities.spit.projectileCount"),
                    spreadAngleDeg: readNumber(spit.spreadAngleDeg, DEFAULT_BALANCE_CONFIG.abilities.spit.spreadAngleDeg, "abilities.spit.spreadAngleDeg"),
                    levels: spitLevels,
                },
                bomb: {
                    massCostPct: readNumber(bomb.massCostPct, DEFAULT_BALANCE_CONFIG.abilities.bomb.massCostPct, "abilities.bomb.massCostPct"),
                    cooldownSec: readNumber(bomb.cooldownSec, DEFAULT_BALANCE_CONFIG.abilities.bomb.cooldownSec, "abilities.bomb.cooldownSec"),
                    speedMps: readNumber(bomb.speedMps, DEFAULT_BALANCE_CONFIG.abilities.bomb.speedMps, "abilities.bomb.speedMps"),
                    rangeM: readNumber(bomb.rangeM, DEFAULT_BALANCE_CONFIG.abilities.bomb.rangeM, "abilities.bomb.rangeM"),
                    damagePct: readNumber(bomb.damagePct, DEFAULT_BALANCE_CONFIG.abilities.bomb.damagePct, "abilities.bomb.damagePct"),
                    radiusM: readNumber(bomb.radiusM, DEFAULT_BALANCE_CONFIG.abilities.bomb.radiusM, "abilities.bomb.radiusM"),
                    explosionRadiusM: readNumber(bomb.explosionRadiusM, DEFAULT_BALANCE_CONFIG.abilities.bomb.explosionRadiusM, "abilities.bomb.explosionRadiusM"),
                    levels: bombLevels,
                },
                push: {
                    massCostPct: readNumber(push.massCostPct, DEFAULT_BALANCE_CONFIG.abilities.push.massCostPct, "abilities.push.massCostPct"),
                    cooldownSec: readNumber(push.cooldownSec, DEFAULT_BALANCE_CONFIG.abilities.push.cooldownSec, "abilities.push.cooldownSec"),
                    radiusM: readNumber(push.radiusM, DEFAULT_BALANCE_CONFIG.abilities.push.radiusM, "abilities.push.radiusM"),
                    impulseNs: readNumber(push.impulseNs, DEFAULT_BALANCE_CONFIG.abilities.push.impulseNs, "abilities.push.impulseNs"),
                    minSpeedMps: readNumber(push.minSpeedMps, DEFAULT_BALANCE_CONFIG.abilities.push.minSpeedMps, "abilities.push.minSpeedMps"),
                    maxSpeedMps: readNumber(push.maxSpeedMps, DEFAULT_BALANCE_CONFIG.abilities.push.maxSpeedMps, "abilities.push.maxSpeedMps"),
                    levels: pushLevels,
                },
                mine: {
                    massCostPct: readNumber(mine.massCostPct, DEFAULT_BALANCE_CONFIG.abilities.mine.massCostPct, "abilities.mine.massCostPct"),
                    cooldownSec: readNumber(mine.cooldownSec, DEFAULT_BALANCE_CONFIG.abilities.mine.cooldownSec, "abilities.mine.cooldownSec"),
                    damagePct: readNumber(mine.damagePct, DEFAULT_BALANCE_CONFIG.abilities.mine.damagePct, "abilities.mine.damagePct"),
                    radiusM: readNumber(mine.radiusM, DEFAULT_BALANCE_CONFIG.abilities.mine.radiusM, "abilities.mine.radiusM"),
                    durationSec: readNumber(mine.durationSec, DEFAULT_BALANCE_CONFIG.abilities.mine.durationSec, "abilities.mine.durationSec"),
                    maxMines: readNumber(mine.maxMines, DEFAULT_BALANCE_CONFIG.abilities.mine.maxMines, "abilities.mine.maxMines"),
                    levels: mineLevels,
                },
            };
        })(),
        chests: {
            maxCount: readNumber(chests.maxCount, DEFAULT_BALANCE_CONFIG.chests.maxCount, "chests.maxCount"),
            spawnIntervalSec: readNumber(
                chests.spawnIntervalSec,
                DEFAULT_BALANCE_CONFIG.chests.spawnIntervalSec,
                "chests.spawnIntervalSec"
            ),
            mass: readNumber(chests.mass, DEFAULT_BALANCE_CONFIG.chests.mass, "chests.mass"),
            radius: readNumber(chests.radius, DEFAULT_BALANCE_CONFIG.chests.radius, "chests.radius"),
            rewards: {
                scatterTotalMassPct: readNumberArray(
                    chestRewards.scatterTotalMassPct,
                    DEFAULT_BALANCE_CONFIG.chests.rewards.scatterTotalMassPct,
                    "chests.rewards.scatterTotalMassPct"
                ),
                scatterBubbleCount: readNumberArray(
                    chestRewards.scatterBubbleCount,
                    DEFAULT_BALANCE_CONFIG.chests.rewards.scatterBubbleCount,
                    "chests.rewards.scatterBubbleCount"
                ),
                scatterInnerFrac: readNumberArray(
                    chestRewards.scatterInnerFrac,
                    DEFAULT_BALANCE_CONFIG.chests.rewards.scatterInnerFrac,
                    "chests.rewards.scatterInnerFrac"
                ),
                scatterInnerSpeedMpsMin: readNumberArray(
                    chestRewards.scatterInnerSpeedMpsMin,
                    DEFAULT_BALANCE_CONFIG.chests.rewards.scatterInnerSpeedMpsMin,
                    "chests.rewards.scatterInnerSpeedMpsMin"
                ),
                scatterInnerSpeedMpsMax: readNumberArray(
                    chestRewards.scatterInnerSpeedMpsMax,
                    DEFAULT_BALANCE_CONFIG.chests.rewards.scatterInnerSpeedMpsMax,
                    "chests.rewards.scatterInnerSpeedMpsMax"
                ),
                scatterOuterSpeedMpsMin: readNumberArray(
                    chestRewards.scatterOuterSpeedMpsMin,
                    DEFAULT_BALANCE_CONFIG.chests.rewards.scatterOuterSpeedMpsMin,
                    "chests.rewards.scatterOuterSpeedMpsMin"
                ),
                scatterOuterSpeedMpsMax: readNumberArray(
                    chestRewards.scatterOuterSpeedMpsMax,
                    DEFAULT_BALANCE_CONFIG.chests.rewards.scatterOuterSpeedMpsMax,
                    "chests.rewards.scatterOuterSpeedMpsMax"
                ),
                scatterSmallBubbleSpeedMul: readNumber(
                    chestRewards.scatterSmallBubbleSpeedMul,
                    DEFAULT_BALANCE_CONFIG.chests.rewards.scatterSmallBubbleSpeedMul,
                    "chests.rewards.scatterSmallBubbleSpeedMul"
                ),
                talentRarityWeights: {
                    rare: (() => {
                        const entry = isRecord(chestRewardWeights.rare) ? chestRewardWeights.rare : {};
                        const fallback = DEFAULT_BALANCE_CONFIG.chests.rewards.talentRarityWeights.rare;
                        return {
                            common: readNumber(entry.common, fallback.common, "chests.rewards.talentRarityWeights.rare.common"),
                            rare: readNumber(entry.rare, fallback.rare, "chests.rewards.talentRarityWeights.rare.rare"),
                            epic: readNumber(entry.epic, fallback.epic, "chests.rewards.talentRarityWeights.rare.epic"),
                        };
                    })(),
                    epic: (() => {
                        const entry = isRecord(chestRewardWeights.epic) ? chestRewardWeights.epic : {};
                        const fallback = DEFAULT_BALANCE_CONFIG.chests.rewards.talentRarityWeights.epic;
                        return {
                            common: readNumber(entry.common, fallback.common, "chests.rewards.talentRarityWeights.epic.common"),
                            rare: readNumber(entry.rare, fallback.rare, "chests.rewards.talentRarityWeights.epic.rare"),
                            epic: readNumber(entry.epic, fallback.epic, "chests.rewards.talentRarityWeights.epic.epic"),
                        };
                    })(),
                    gold: (() => {
                        const entry = isRecord(chestRewardWeights.gold) ? chestRewardWeights.gold : {};
                        const fallback = DEFAULT_BALANCE_CONFIG.chests.rewards.talentRarityWeights.gold;
                        return {
                            common: readNumber(entry.common, fallback.common, "chests.rewards.talentRarityWeights.gold.common"),
                            rare: readNumber(entry.rare, fallback.rare, "chests.rewards.talentRarityWeights.gold.rare"),
                            epic: readNumber(entry.epic, fallback.epic, "chests.rewards.talentRarityWeights.gold.epic"),
                        };
                    })(),
                },
            },
            // GDD v3.3: типы сундуков и фазовые веса
            types: isRecord(chests.types) ? chests.types as BalanceConfig["chests"]["types"] : undefined,
            phaseWeights: isRecord(chests.phaseWeights) ? chests.phaseWeights as BalanceConfig["chests"]["phaseWeights"] : undefined,
        },
        boosts: {
            maxStackTimeSec: readNumber(
                boosts.maxStackTimeSec,
                DEFAULT_BALANCE_CONFIG.boosts.maxStackTimeSec,
                "boosts.maxStackTimeSec"
            ),
            rage: {
                durationSec: readNumber(
                    boostRage.durationSec,
                    DEFAULT_BALANCE_CONFIG.boosts.rage.durationSec,
                    "boosts.rage.durationSec"
                ),
                damageMul: readNumber(
                    boostRage.damageMul,
                    DEFAULT_BALANCE_CONFIG.boosts.rage.damageMul,
                    "boosts.rage.damageMul"
                ),
            },
            haste: {
                durationSec: readNumber(
                    boostHaste.durationSec,
                    DEFAULT_BALANCE_CONFIG.boosts.haste.durationSec,
                    "boosts.haste.durationSec"
                ),
                speedMul: readNumber(
                    boostHaste.speedMul,
                    DEFAULT_BALANCE_CONFIG.boosts.haste.speedMul,
                    "boosts.haste.speedMul"
                ),
            },
            guard: {
                durationSec: readNumber(
                    boostGuard.durationSec,
                    DEFAULT_BALANCE_CONFIG.boosts.guard.durationSec,
                    "boosts.guard.durationSec"
                ),
                charges: readNumber(
                    boostGuard.charges,
                    DEFAULT_BALANCE_CONFIG.boosts.guard.charges,
                    "boosts.guard.charges"
                ),
            },
            greed: {
                durationSec: readNumber(
                    boostGreed.durationSec,
                    DEFAULT_BALANCE_CONFIG.boosts.greed.durationSec,
                    "boosts.greed.durationSec"
                ),
                bubbleMassMul: readNumber(
                    boostGreed.bubbleMassMul,
                    DEFAULT_BALANCE_CONFIG.boosts.greed.bubbleMassMul,
                    "boosts.greed.bubbleMassMul"
                ),
                charges: readNumber(
                    boostGreed.charges,
                    DEFAULT_BALANCE_CONFIG.boosts.greed.charges,
                    "boosts.greed.charges"
                ),
            },
            allowedByChestType: {
                rare: readBoostTypeArray(
                    boostAllowedByChestType.rare,
                    DEFAULT_BALANCE_CONFIG.boosts.allowedByChestType.rare,
                    "boosts.allowedByChestType.rare"
                ),
                epic: readBoostTypeArray(
                    boostAllowedByChestType.epic,
                    DEFAULT_BALANCE_CONFIG.boosts.allowedByChestType.epic,
                    "boosts.allowedByChestType.epic"
                ),
                gold: readBoostTypeArray(
                    boostAllowedByChestType.gold,
                    DEFAULT_BALANCE_CONFIG.boosts.allowedByChestType.gold,
                    "boosts.allowedByChestType.gold"
                ),
            },
        },
        obstacles: {
            countByMapSize: readMapSizeConfig(
                obstacles.countByMapSize,
                DEFAULT_BALANCE_CONFIG.obstacles.countByMapSize,
                "obstacles.countByMapSize"
            ),
            passageCountByMapSize: readMapSizeConfig(
                obstacles.passageCountByMapSize,
                DEFAULT_BALANCE_CONFIG.obstacles.passageCountByMapSize,
                "obstacles.passageCountByMapSize"
            ),
            passageGapWidth: readNumber(
                obstacles.passageGapWidth,
                DEFAULT_BALANCE_CONFIG.obstacles.passageGapWidth,
                "obstacles.passageGapWidth"
            ),
            passagePillarRadius: readNumber(
                obstacles.passagePillarRadius,
                DEFAULT_BALANCE_CONFIG.obstacles.passagePillarRadius,
                "obstacles.passagePillarRadius"
            ),
            pillarRadius: readNumber(
                obstacles.pillarRadius,
                DEFAULT_BALANCE_CONFIG.obstacles.pillarRadius,
                "obstacles.pillarRadius"
            ),
            spikeRadius: readNumber(
                obstacles.spikeRadius,
                DEFAULT_BALANCE_CONFIG.obstacles.spikeRadius,
                "obstacles.spikeRadius"
            ),
            spikeDamagePct: readNumber(
                obstacles.spikeDamagePct,
                DEFAULT_BALANCE_CONFIG.obstacles.spikeDamagePct,
                "obstacles.spikeDamagePct"
            ),
            spikeChance: readNumber(
                obstacles.spikeChance,
                DEFAULT_BALANCE_CONFIG.obstacles.spikeChance,
                "obstacles.spikeChance"
            ),
            spacing: readNumber(
                obstacles.spacing,
                DEFAULT_BALANCE_CONFIG.obstacles.spacing,
                "obstacles.spacing"
            ),
            placementRetries: readNumber(
                obstacles.placementRetries,
                DEFAULT_BALANCE_CONFIG.obstacles.placementRetries,
                "obstacles.placementRetries"
            ),
        },
        safeZones: {
            finalStartSec: readNumber(
                safeZones.finalStartSec,
                DEFAULT_BALANCE_CONFIG.safeZones.finalStartSec,
                "safeZones.finalStartSec"
            ),
            warningSec: readNumber(
                safeZones.warningSec,
                DEFAULT_BALANCE_CONFIG.safeZones.warningSec,
                "safeZones.warningSec"
            ),
            damagePctPerSec: readNumber(
                safeZones.damagePctPerSec,
                DEFAULT_BALANCE_CONFIG.safeZones.damagePctPerSec,
                "safeZones.damagePctPerSec"
            ),
            minDistance: readNumber(
                safeZones.minDistance,
                DEFAULT_BALANCE_CONFIG.safeZones.minDistance,
                "safeZones.minDistance"
            ),
            placementRetries: readNumber(
                safeZones.placementRetries,
                DEFAULT_BALANCE_CONFIG.safeZones.placementRetries,
                "safeZones.placementRetries"
            ),
            countByMapSize: readMapSizeConfig(
                safeZones.countByMapSize,
                DEFAULT_BALANCE_CONFIG.safeZones.countByMapSize,
                "safeZones.countByMapSize"
            ),
            radiusByMapSize: readMapSizeConfig(
                safeZones.radiusByMapSize,
                DEFAULT_BALANCE_CONFIG.safeZones.radiusByMapSize,
                "safeZones.radiusByMapSize"
            ),
        },
        zones: {
            countByMapSize: readMapSizeConfig(
                zones.countByMapSize,
                DEFAULT_BALANCE_CONFIG.zones.countByMapSize,
                "zones.countByMapSize"
            ),
            radiusByMapSize: readMapSizeConfig(
                zones.radiusByMapSize,
                DEFAULT_BALANCE_CONFIG.zones.radiusByMapSize,
                "zones.radiusByMapSize"
            ),
            minDistance: readNumber(
                zones.minDistance,
                DEFAULT_BALANCE_CONFIG.zones.minDistance,
                "zones.minDistance"
            ),
            placementRetries: readNumber(
                zones.placementRetries,
                DEFAULT_BALANCE_CONFIG.zones.placementRetries,
                "zones.placementRetries"
            ),
            typeWeights: {
                nectar: readNumber(
                    zoneTypeWeights.nectar,
                    DEFAULT_BALANCE_CONFIG.zones.typeWeights.nectar,
                    "zones.typeWeights.nectar"
                ),
                ice: readNumber(
                    zoneTypeWeights.ice,
                    DEFAULT_BALANCE_CONFIG.zones.typeWeights.ice,
                    "zones.typeWeights.ice"
                ),
                mud: readNumber(
                    zoneTypeWeights.mud,
                    DEFAULT_BALANCE_CONFIG.zones.typeWeights.mud,
                    "zones.typeWeights.mud"
                ),
                lava: readNumber(
                    zoneTypeWeights.lava,
                    DEFAULT_BALANCE_CONFIG.zones.typeWeights.lava,
                    "zones.typeWeights.lava"
                ),
                turbo: readNumber(
                    zoneTypeWeights.turbo,
                    DEFAULT_BALANCE_CONFIG.zones.typeWeights.turbo,
                    "zones.typeWeights.turbo"
                ),
            },
            lavaMinDistanceFromSpawn: readNumber(
                zones.lavaMinDistanceFromSpawn,
                DEFAULT_BALANCE_CONFIG.zones.lavaMinDistanceFromSpawn,
                "zones.lavaMinDistanceFromSpawn"
            ),
            nectar: {
                massGainPctPerSec: readNumber(
                    zoneNectar.massGainPctPerSec,
                    DEFAULT_BALANCE_CONFIG.zones.nectar.massGainPctPerSec,
                    "zones.nectar.massGainPctPerSec"
                ),
            },
            ice: {
                frictionMultiplier: readNumber(
                    zoneIce.frictionMultiplier,
                    DEFAULT_BALANCE_CONFIG.zones.ice.frictionMultiplier,
                    "zones.ice.frictionMultiplier"
                ),
            },
            mud: {
                speedMultiplier: readNumber(
                    zoneMud.speedMultiplier,
                    DEFAULT_BALANCE_CONFIG.zones.mud.speedMultiplier,
                    "zones.mud.speedMultiplier"
                ),
                frictionMultiplier: readNumber(
                    zoneMud.frictionMultiplier,
                    DEFAULT_BALANCE_CONFIG.zones.mud.frictionMultiplier,
                    "zones.mud.frictionMultiplier"
                ),
            },
            lava: {
                damagePctPerSec: readNumber(
                    zoneLava.damagePctPerSec,
                    DEFAULT_BALANCE_CONFIG.zones.lava.damagePctPerSec,
                    "zones.lava.damagePctPerSec"
                ),
                scatterPct: readNumber(
                    zoneLava.scatterPct,
                    DEFAULT_BALANCE_CONFIG.zones.lava.scatterPct,
                    "zones.lava.scatterPct"
                ),
                scatterOrbCount: readNumber(
                    zoneLava.scatterOrbCount,
                    DEFAULT_BALANCE_CONFIG.zones.lava.scatterOrbCount,
                    "zones.lava.scatterOrbCount"
                ),
                scatterSpeedMps: readNumber(
                    zoneLava.scatterSpeedMps,
                    DEFAULT_BALANCE_CONFIG.zones.lava.scatterSpeedMps,
                    "zones.lava.scatterSpeedMps"
                ),
            },
            turbo: {
                speedMultiplier: readNumber(
                    zoneTurbo.speedMultiplier,
                    DEFAULT_BALANCE_CONFIG.zones.turbo.speedMultiplier,
                    "zones.turbo.speedMultiplier"
                ),
            },
        },
        hotZones: {
            chaosCount: readNumber(
                hotZones.chaosCount,
                DEFAULT_BALANCE_CONFIG.hotZones.chaosCount,
                "hotZones.chaosCount"
            ),
            finalCount: readNumber(
                hotZones.finalCount,
                DEFAULT_BALANCE_CONFIG.hotZones.finalCount,
                "hotZones.finalCount"
            ),
            radius: readNumber(hotZones.radius, DEFAULT_BALANCE_CONFIG.hotZones.radius, "hotZones.radius"),
            spawnMultiplierChaos: readNumber(
                hotZones.spawnMultiplierChaos,
                DEFAULT_BALANCE_CONFIG.hotZones.spawnMultiplierChaos,
                "hotZones.spawnMultiplierChaos"
            ),
            spawnMultiplierFinal: readNumber(
                hotZones.spawnMultiplierFinal,
                DEFAULT_BALANCE_CONFIG.hotZones.spawnMultiplierFinal,
                "hotZones.spawnMultiplierFinal"
            ),
        },
        toxicPools: {
            radiusM: readNumber(toxicPools.radiusM, DEFAULT_BALANCE_CONFIG.toxicPools.radiusM, "toxicPools.radiusM"),
            durationSec: readNumber(
                toxicPools.durationSec,
                DEFAULT_BALANCE_CONFIG.toxicPools.durationSec,
                "toxicPools.durationSec"
            ),
            damagePctPerSec: readNumber(
                toxicPools.damagePctPerSec,
                DEFAULT_BALANCE_CONFIG.toxicPools.damagePctPerSec,
                "toxicPools.damagePctPerSec"
            ),
            slowPct: readNumber(toxicPools.slowPct, DEFAULT_BALANCE_CONFIG.toxicPools.slowPct, "toxicPools.slowPct"),
        },
        hunger: {
            baseDrainPerSec: readNumber(
                hunger.baseDrainPerSec,
                DEFAULT_BALANCE_CONFIG.hunger.baseDrainPerSec,
                "hunger.baseDrainPerSec"
            ),
            scalingPerMass: readNumber(
                hunger.scalingPerMass,
                DEFAULT_BALANCE_CONFIG.hunger.scalingPerMass,
                "hunger.scalingPerMass"
            ),
            maxDrainPerSec: readNumber(
                hunger.maxDrainPerSec,
                DEFAULT_BALANCE_CONFIG.hunger.maxDrainPerSec,
                "hunger.maxDrainPerSec"
            ),
            minMass: readNumber(
                hunger.minMass,
                DEFAULT_BALANCE_CONFIG.hunger.minMass,
                "hunger.minMass"
            ),
        },
        rebel: {
            updateIntervalSec: readNumber(
                rebel.updateIntervalSec,
                DEFAULT_BALANCE_CONFIG.rebel.updateIntervalSec,
                "rebel.updateIntervalSec"
            ),
            massThresholdMultiplier: readNumber(
                rebel.massThresholdMultiplier,
                DEFAULT_BALANCE_CONFIG.rebel.massThresholdMultiplier,
                "rebel.massThresholdMultiplier"
            ),
        },
        talents: (() => {
            const talents = isRecord(data.talents) ? data.talents : {};
            const talentPool = isRecord(talents.talentPool) ? talents.talentPool : {};
            const talentRarityByLevel = isRecord(talents.talentRarityByLevel) ? talents.talentRarityByLevel : {};
            const autoPickPriorities = isRecord(talents.autoPickPriorities) ? talents.autoPickPriorities : {};
            const classTalents = isRecord(talents.classTalents) ? talents.classTalents : {};
            
            // Parse talent configs from JSON, falling back to defaults
            const parseTalentRecord = (
                source: unknown,
                defaults: Record<string, TalentConfig>
            ): Record<string, TalentConfig> => {
                if (!isRecord(source)) return defaults;
                const result: Record<string, TalentConfig> = {};
                // Merge source keys with defaults
                const allKeys = new Set([...Object.keys(defaults), ...Object.keys(source)]);
                for (const key of allKeys) {
                    const src = isRecord(source[key]) ? source[key] : {};
                    const def = defaults[key] || { name: key, maxLevel: 1, values: [0], effect: key };
                    result[key] = {
                        name: typeof src.name === "string" ? src.name : def.name,
                        maxLevel: typeof src.maxLevel === "number" ? src.maxLevel : def.maxLevel,
                        values: Array.isArray(src.values) ? src.values : def.values,
                        effect: typeof src.effect === "string" ? src.effect : def.effect,
                        requirement: src.requirement !== undefined ? src.requirement as string | null : def.requirement,
                        category: typeof src.category === "string" ? src.category : def.category,
                    };
                }
                return result;
            };
            
            // Parse class talents
            const parseClassTalents = (
                source: unknown,
                defaults: Record<string, Record<string, ClassTalentConfig>>
            ): Record<string, Record<string, ClassTalentConfig>> => {
                if (!isRecord(source)) return defaults;
                const result: Record<string, Record<string, ClassTalentConfig>> = {};
                for (const className of Object.keys(defaults)) {
                    const srcClass = isRecord(source[className]) ? source[className] : {};
                    const defClass = defaults[className];
                    result[className] = {};
                    const allKeys = new Set([...Object.keys(defClass), ...Object.keys(srcClass)]);
                    for (const talentKey of allKeys) {
                        const src = isRecord(srcClass[talentKey]) ? srcClass[talentKey] : {};
                        const def = defClass[talentKey] || { name: talentKey, maxLevel: 1, values: [0], effect: talentKey, rarity: "rare" as const, category: "damage" };
                        result[className][talentKey] = {
                            name: typeof src.name === "string" ? src.name : def.name,
                            maxLevel: typeof src.maxLevel === "number" ? src.maxLevel : def.maxLevel,
                            values: Array.isArray(src.values) ? src.values : def.values,
                            effect: typeof src.effect === "string" ? src.effect : def.effect,
                            requirement: src.requirement !== undefined ? src.requirement as string | null : def.requirement,
                            rarity: (src.rarity === "rare" || src.rarity === "epic") ? src.rarity : def.rarity,
                            category: typeof src.category === "string" ? src.category : def.category,
                        };
                    }
                }
                return result;
            };
            
            // Parse rarity by level
            const parseRarityByLevel = (
                source: unknown,
                defaults: Record<string, { common: number; rare: number; epic: number }>
            ): Record<string, { common: number; rare: number; epic: number }> => {
                if (!isRecord(source)) return defaults;
                const result: Record<string, { common: number; rare: number; epic: number }> = {};
                for (const lvl of Object.keys(defaults)) {
                    const src = isRecord(source[lvl]) ? source[lvl] : {};
                    const def = defaults[lvl];
                    result[lvl] = {
                        common: typeof src.common === "number" ? src.common : def.common,
                        rare: typeof src.rare === "number" ? src.rare : def.rare,
                        epic: typeof src.epic === "number" ? src.epic : def.epic,
                    };
                }
                return result;
            };
            
            // Parse auto pick priorities
            const parseAutoPickPriorities = (
                source: unknown,
                defaults: Record<string, Record<string, number>>
            ): Record<string, Record<string, number>> => {
                if (!isRecord(source)) return defaults;
                const result: Record<string, Record<string, number>> = {};
                for (const className of Object.keys(defaults)) {
                    const srcClass = isRecord(source[className]) ? source[className] : {};
                    const defClass = defaults[className];
                    result[className] = {};
                    for (const cat of Object.keys(defClass)) {
                        result[className][cat] = typeof srcClass[cat] === "number" ? srcClass[cat] as number : defClass[cat];
                    }
                }
                return result;
            };
            
            return {
                cardChoiceTimeoutSec: readNumber(
                    talents.cardChoiceTimeoutSec,
                    DEFAULT_BALANCE_CONFIG.talents.cardChoiceTimeoutSec,
                    "talents.cardChoiceTimeoutSec"
                ),
                cardQueueMax: readNumber(
                    talents.cardQueueMax,
                    DEFAULT_BALANCE_CONFIG.talents.cardQueueMax,
                    "talents.cardQueueMax"
                ),
                abilityUpgradeChance: readNumber(
                    talents.abilityUpgradeChance,
                    DEFAULT_BALANCE_CONFIG.talents.abilityUpgradeChance,
                    "talents.abilityUpgradeChance"
                ),
                talentPool: {
                    common: readStringArray(talentPool.common, DEFAULT_BALANCE_CONFIG.talents.talentPool.common, "talents.talentPool.common"),
                    rare: readStringArray(talentPool.rare, DEFAULT_BALANCE_CONFIG.talents.talentPool.rare, "talents.talentPool.rare"),
                    epic: readStringArray(talentPool.epic, DEFAULT_BALANCE_CONFIG.talents.talentPool.epic, "talents.talentPool.epic"),
                },
                talentRarityByLevel: parseRarityByLevel(talentRarityByLevel, DEFAULT_BALANCE_CONFIG.talents.talentRarityByLevel),
                autoPickPriorities: parseAutoPickPriorities(autoPickPriorities, DEFAULT_BALANCE_CONFIG.talents.autoPickPriorities),
                common: parseTalentRecord(talents.common, DEFAULT_BALANCE_CONFIG.talents.common),
                rare: parseTalentRecord(talents.rare, DEFAULT_BALANCE_CONFIG.talents.rare),
                epic: parseTalentRecord(talents.epic, DEFAULT_BALANCE_CONFIG.talents.epic),
                classTalents: parseClassTalents(classTalents, DEFAULT_BALANCE_CONFIG.talents.classTalents),
            };
        })(),
        // Передаём visual как есть (клиентская визуализация)
        visual: isRecord(data.visual) ? data.visual as BalanceConfig["visual"] : undefined,
        // Разбираем rewards для мета-геймплея (XP, coins, rating)
        rewards: (() => {
            const rewards = isRecord(data.rewards) ? data.rewards : undefined;
            if (!rewards) return undefined;
            const xp = isRecord(rewards.xp) ? rewards.xp : {};
            const coins = isRecord(rewards.coins) ? rewards.coins : {};
            const rating = isRecord(rewards.rating) ? rewards.rating : {};
            const xpPlacement = isRecord(xp.placement) ? xp.placement : {};
            const coinsPlacement = isRecord(coins.placement) ? coins.placement : {};
            const ratingPlacement = isRecord(rating.placement) ? rating.placement : {};
            return {
                xp: {
                    base: typeof xp.base === "number" ? xp.base : 10,
                    placement: {
                        "1": typeof xpPlacement["1"] === "number" ? xpPlacement["1"] : 50,
                        "2": typeof xpPlacement["2"] === "number" ? xpPlacement["2"] : 30,
                        "3": typeof xpPlacement["3"] === "number" ? xpPlacement["3"] : 20,
                        top5: typeof xpPlacement.top5 === "number" ? xpPlacement.top5 : 10,
                    },
                    perKill: typeof xp.perKill === "number" ? xp.perKill : 5,
                },
                coins: {
                    base: typeof coins.base === "number" ? coins.base : 5,
                    placement: {
                        "1": typeof coinsPlacement["1"] === "number" ? coinsPlacement["1"] : 25,
                        "2": typeof coinsPlacement["2"] === "number" ? coinsPlacement["2"] : 15,
                        "3": typeof coinsPlacement["3"] === "number" ? coinsPlacement["3"] : 10,
                        top5: typeof coinsPlacement.top5 === "number" ? coinsPlacement.top5 : 5,
                    },
                    perKill: typeof coins.perKill === "number" ? coins.perKill : 2,
                },
                rating: {
                    base: typeof rating.base === "number" ? rating.base : DEFAULT_RATING_BASE,
                    placement: {
                        "1": typeof ratingPlacement["1"] === "number" ? ratingPlacement["1"] : DEFAULT_RATING_PLACEMENT_1,
                        "2": typeof ratingPlacement["2"] === "number" ? ratingPlacement["2"] : DEFAULT_RATING_PLACEMENT_2,
                        "3": typeof ratingPlacement["3"] === "number" ? ratingPlacement["3"] : DEFAULT_RATING_PLACEMENT_3,
                        top5: typeof ratingPlacement.top5 === "number" ? ratingPlacement.top5 : DEFAULT_RATING_PLACEMENT_TOP5,
                    },
                    perKill: typeof rating.perKill === "number" ? rating.perKill : DEFAULT_RATING_PER_KILL,
                },
            };
        })(),
    };

    const globalCooldownTicks = Math.max(
        1,
        Math.round(resolved.server.globalCooldownMs / (1000 / resolved.server.tickRate))
    );

    return {
        ...resolved,
        server: {
            ...resolved.server,
            globalCooldownTicks,
        },
    };
}
