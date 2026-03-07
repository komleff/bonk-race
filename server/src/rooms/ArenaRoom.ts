import { randomUUID } from "crypto";
import { Room, Client } from "colyseus";
import {
    GameState,
    Player,
    Orb,
    Chest,
    HotZone,
    SlowZone,
    ToxicPool,
    Projectile,
    Mine,
    Talent,
    TalentCard,
    Obstacle,
    Zone,
    SafeZone,
} from "./schema/GameState";
import {
    InputCommand,
    MatchPhaseId,
    getSlimeInertia,
    getSlimeRadiusFromConfig,
    scaleSlimeValue,
    getOrbRadius,
    FLAG_RESPAWN_SHIELD,
    FLAG_ABILITY_SHIELD,
    FLAG_LAST_BREATH,
    FLAG_IS_REBEL,
    FLAG_IS_DEAD,
    FLAG_DASHING,
    FLAG_MAGNETIZING,
    FLAG_SLOWED,
    FLAG_PUSHING,
    FLAG_STUNNED,
    FLAG_INVISIBLE,
    FLAG_LEVIATHAN,
    ZONE_TYPE_NECTAR,
    ZONE_TYPE_ICE,
    ZONE_TYPE_SLIME,
    ZONE_TYPE_LAVA,
    ZONE_TYPE_TURBO,
    OBSTACLE_TYPE_PILLAR,
    OBSTACLE_TYPE_SPIKES,
    ResolvedBalanceConfig,
    SlimeConfig,
    generateUniqueName,
    TalentConfig,
    ClassTalentConfig,
    BoostType,
} from "@bonk-race/shared";
import { loadBalanceConfig } from "../config/loadBalanceConfig";
import { Rng } from "../utils/rng";
import { TelemetryService } from "../telemetry/TelemetryService";
import {
    abilityCardSystem,
    abilitySystem,
    mineSystem,
    projectileSystem,
} from "./systems/abilitySystem";
import { boostSystem } from "./systems/boostSystem";
import { chestSystem, updateChests } from "./systems/chestSystem";
import { collisionSystem } from "./systems/collisionSystem";
import { deathSystem } from "./systems/deathSystem";
import {
    processCombat as processCombatModule,
    applyShieldReflection as applyShieldReflectionModule,
    spawnPvPBiteOrbs as spawnPvPBiteOrbsModule,
    applyProjectileDamage as applyProjectileDamageModule,
    applySelfDamage as applySelfDamageModule,
    explodeBomb as explodeBombModule,
} from "./systems/combatSystem";
import {
    slowZoneSystem,
    statusEffectSystem,
    toxicPoolSystem,
    zoneEffectSystem,
} from "./systems/effectSystems";
import {
    activateAbility as activateAbilityModule,
    resetAbilityCooldowns as resetAbilityCooldownsModule,
    setAbilityLevelForSlot as setAbilityLevelForSlotModule,
    getAbilityLevelForSlot as getAbilityLevelForSlotModule,
    applyPushWave as applyPushWaveModule,
} from "./systems/abilityActivationSystem";
import { hungerSystem } from "./systems/hungerSystem";
import { flightAssistSystem, physicsSystem } from "./systems/movementSystems";
import { updateOrbs, updateOrbsVisual } from "./systems/orbSystem";
import { rebelSystem } from "./systems/rebelSystem";
import { safeZoneSystem } from "./systems/safeZoneSystem";
import { talentCardSystem } from "./systems/talentCardSystem";
import {
    recalculateTalentModifiers as recalculateTalentModifiersModule,
    generateTalentCard as generateTalentCardModule,
    getTalentConfig as getTalentConfigModule,
    parseAbilityUpgradeId as parseAbilityUpgradeIdModule,
    type TalentBalanceConfig,
    type TalentGeneratorConfig,
    type TalentGeneratorDeps,
} from "./systems/talent";
import {
    generateObstacleSeeds,
    generateSafeZoneSeeds,
    generateZoneSeeds,
    isInsideWorld,
    randomPointInMapWithMargin,
} from "./helpers/arenaGeneration";
import {
    generateArena as generateArenaModule,
    addObstacle as addObstacleModule,
    spawnInitialOrbs as spawnInitialOrbsModule,
} from "./systems/arenaGenerator";
import {
    handlePlayerDeath as handlePlayerDeathModule,
    handlePlayerRespawn as handlePlayerRespawnModule,
    updatePlayerLevel as updatePlayerLevelModule,
} from "./systems/playerStateManager";
import { getMatchResultService } from "../services/MatchResultService";
import { MatchSummary, PlayerResult } from "@bonk-race/shared/src/types";
import { joinTokenService, JoinTokenPayload } from "../meta/services/JoinTokenService";

type ContactZone = "mouth" | "tail" | "side";

interface ClassStats {
    radiusMult: number;
    damageMult: number;
    biteResistPct: number;
    swallowLimit: number;
    biteFraction: number;
    eatingPowerMult: number;
}

export class ArenaRoom extends Room<GameState> {
    maxClients = 20;

    private balance!: ResolvedBalanceConfig;
    private rng!: Rng;
    private seed = 0;
    private tick = 0;
    private orbIdCounter = 0;
    private chestIdCounter = 0;
    private hotZoneIdCounter = 0;
    private slowZoneIdCounter = 0;
    private toxicPoolIdCounter = 0;
    private projectileIdCounter = 0;
    private mineIdCounter = 0;
    private obstacleIdCounter = 0;
    private zoneIdCounter = 0;
    private lastOrbSpawnTick = 0;
    private lastChestSpawnTick = 0;
    private lastPhaseId: MatchPhaseId | null = null;
    private lastRebelUpdateTick = 0;
    private metricsAccumulatorMs = 0;
    private metricsTickCount = 0;
    private metricsIntervalTicks = 0;
    private metricsMaxTickMs = 0;
    // Последние рассчитанные метрики tick latency (для API мониторинга)
    private lastMetricsAvgMs = 0;
    private lastMetricsMaxMs = 0;
    private maxTalentQueue = 3;
    private telemetry: TelemetryService | null = null;
    private matchIndex = 0;
    private matchId = "";
    private matchStartLogged = false;
    private matchStartedAt: string = "";

    private attackCooldownTicks = 0;
    private invulnerableTicks = 0;
    private biteCooldownTicks = 0;
    private respawnShieldTicks = 0;
    private respawnDelayTicks = 0;
    private orbSpawnIntervalTicks = 0;
    private chestSpawnIntervalTicks = 0;
    private lastBreathTicks = 0;
    private rebelUpdateIntervalTicks = 0;
    private inputTimeoutTicks = 0;
    private resultsDurationTicks = 0;
    private restartDelayTicks = 0;
    private resultsStartTick = 0;
    private isMatchEnded = false;

    onCreate(options: { seed?: number } = {}) {
        this.balance = loadBalanceConfig();
        this.maxClients = this.balance.server.maxPlayers;
        this.seed = Number(options.seed ?? Date.now());
        this.rng = new Rng(this.seed);
        const telemetryEnabled = process.env.TELEMETRY_DISABLED !== "1";
        this.telemetry = new TelemetryService({ enabled: telemetryEnabled });
        this.initMatchId();
        this.applyMapSizeConfig();

        this.attackCooldownTicks = this.secondsToTicks(this.balance.combat.attackCooldownSec);
        this.invulnerableTicks = this.secondsToTicks(this.balance.combat.damageInvulnSec);
        this.biteCooldownTicks = this.secondsToTicks(this.balance.combat.biteCooldownSec);
        this.respawnShieldTicks = this.secondsToTicks(this.balance.combat.respawnShieldSec);
        this.respawnDelayTicks = this.secondsToTicks(this.balance.death.respawnDelaySec);
        this.orbSpawnIntervalTicks = this.secondsToTicks(this.balance.orbs.respawnIntervalSec);
        this.chestSpawnIntervalTicks = this.secondsToTicks(this.balance.chests.spawnIntervalSec);
        this.lastBreathTicks = this.secondsToTicks(this.balance.combat.lastBreathDurationSec);
        this.rebelUpdateIntervalTicks = this.secondsToTicks(this.balance.rebel.updateIntervalSec);
        this.inputTimeoutTicks = this.msToTicks(this.balance.controls.inputTimeoutMs);
        this.resultsDurationTicks = this.secondsToTicks(this.balance.match.resultsDurationSec);
        this.restartDelayTicks = this.secondsToTicks(this.balance.match.restartDelaySec);
        this.metricsIntervalTicks = this.balance.server.tickRate;

        this.setState(new GameState());
        this.state.phase = "Spawn";
        this.state.timeRemaining = this.balance.match.durationSec;
        // Codex P1: Синхронизируем matchId в state после setState() (initMatchId() вызван ранее)
        this.state.matchId = this.matchId;
        this.generateArena();

        this.onMessage("selectClass", (client, data: { classId?: unknown; name?: unknown }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;
            if (this.isMatchEnded || this.state.phase === "Results") return;

            const currentClassId = Number(player.classId);
            const needsClass = !(Number.isInteger(currentClassId) && currentClassId >= 0 && currentClassId <= 2);
            if (!needsClass) return;

            const rawClassId = Number(data?.classId);
            if (!Number.isInteger(rawClassId) || rawClassId < 0 || rawClassId > 2) return;

            player.classId = rawClassId;

            // Обновляем имя игрока, если передано (для replay между матчами)
            const newName = data?.name;
            if (typeof newName === "string" && newName.trim().length > 0) {
                player.name = newName.trim().slice(0, 24);
            }

            const classAbilities = ["dash", "shield", "pull"];
            player.abilitySlot0 = classAbilities[player.classId] || "dash";
            player.abilitySlot1 = "";
            player.abilitySlot2 = "";
            player.abilityLevel0 = player.abilitySlot0 ? 1 : 0;
            player.abilityLevel1 = 0;
            player.abilityLevel2 = 0;
            player.pendingAbilityCard = null;
            player.cardChoicePressed = null;
            player.pendingCardSlots = [];
            player.pendingCardCount = 0;

            if (!this.isMatchEnded && this.state.phase !== "Results") {
                player.vx = 0;
                player.vy = 0;
                player.angVel = 0;
                player.angle = 0;
                player.mass = this.balance.slime.initialMass;
                player.level = this.balance.slime.initialLevel;
                player.isDead = false;
                player.isLastBreath = false;
                player.lastBreathEndTick = 0;
                player.invulnerableUntilTick = this.tick + this.respawnShieldTicks;
                player.respawnAtTick = 0;
                player.gcdReadyTick = this.tick;
                this.resetAbilityCooldowns(player, this.tick);
                player.queuedAbilitySlot = null;
                player.queuedAbilityTick = 0;
                player.abilitySlotPressed = null;
                player.lastAttackTick = 0;
                player.lastBiteTick = 0;
                player.lastInputTick = this.tick;
                player.flags = 0;

                this.updateLeaderboard();
            }
        });

        this.onMessage("input", (client, data: InputCommand) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || !data) return;

            const seq = Number(data.seq);
            if (!Number.isFinite(seq) || seq <= player.lastProcessedSeq) {
                return;
            }
            player.lastProcessedSeq = seq;

            let moveX = Number(data.moveX);
            let moveY = Number(data.moveY);
            if (!Number.isFinite(moveX)) moveX = 0;
            if (!Number.isFinite(moveY)) moveY = 0;
            moveX = Math.max(-1, Math.min(1, moveX));
            moveY = Math.max(-1, Math.min(1, moveY));
            const length = Math.hypot(moveX, moveY);
            if (length > 1e-6) {
                if (length > 1) {
                    moveX /= length;
                    moveY /= length;
                }
            } else {
                moveX = 0;
                moveY = 0;
            }

            player.inputX = moveX;
            player.inputY = moveY;
            player.lastInputTick = this.tick;

            // Обрабатываем abilitySlot только если он явно передан в пакете
            // Не сбрасываем, если поле отсутствует - чтобы обычные input'ы движения не перезатирали нажатие
            if ("abilitySlot" in data) {
                const abilitySlot = data.abilitySlot;
                if (
                    typeof abilitySlot === "number" &&
                    Number.isInteger(abilitySlot) &&
                    abilitySlot >= 0 &&
                    abilitySlot <= 2
                ) {
                    player.abilitySlotPressed = abilitySlot;
                }
            }

        });

        this.onMessage("talentChoice", (client, data: { choice?: unknown }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || !player.pendingTalentCard) return;
            const choice = Number(data?.choice);
            if (!Number.isInteger(choice) || choice < 0 || choice > 2) return;
            player.talentChoicePressed2 = choice;
        });

        this.onMessage("cardChoice", (client, data: { choice?: unknown }) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || !player.pendingAbilityCard) return;
            const choice = Number(data?.choice);
            if (!Number.isInteger(choice) || choice < 0 || choice > 2) return;
            player.cardChoicePressed = choice;
        });

        this.setSimulationInterval(() => this.onTick(), this.balance.server.simulationIntervalMs);

        this.spawnInitialOrbs();
        console.log("ArenaRoom created!");
    }

    /**
     * Authenticate client before allowing join
     * Validates joinToken JWT if provided, or allows dev mode connections
     */
    async onAuth(client: Client, options: { joinToken?: string; name?: string; classId?: number }): Promise<JoinTokenPayload | boolean> {
        // Dev mode: allow connections without token if JOIN_TOKEN_REQUIRED is not set
        const requireToken = process.env.JOIN_TOKEN_REQUIRED === "true" || process.env.JOIN_TOKEN_REQUIRED === "1";

        if (!options.joinToken) {
            if (requireToken) {
                console.warn(`[ArenaRoom] Client ${client.sessionId} rejected: no joinToken provided`);
                throw new Error("Authentication required: joinToken missing");
            }
            // Dev mode - allow without token
            console.log(`[ArenaRoom] Client ${client.sessionId} joined without token (dev mode)`);
            return true;
        }

        try {
            // Verify the joinToken and check it's valid for this room
            const payload = joinTokenService.verifyTokenForRoom(options.joinToken, this.roomId);

            const maskedUserId = joinTokenService.maskUserId(payload.userId);
            console.log(`[ArenaRoom] Client ${client.sessionId} authenticated as user ${maskedUserId} for match ${payload.matchId}`);

            // Return the payload - it will be available in onJoin via client.auth
            return payload;
        } catch (error: any) {
            console.warn(`[ArenaRoom] Client ${client.sessionId} auth failed: ${error.message}`);
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }

    onJoin(client: Client, options: { name?: string; classId?: number } = {}) {
        const player = new Player();
        player.id = client.sessionId;

        // If client authenticated with token, use nickname and userId from payload (trusted source)
        const authPayload = client.auth as JoinTokenPayload | boolean;
        const tokenNickname = authPayload && typeof authPayload === 'object' && authPayload.nickname
            ? authPayload.nickname
            : null;

        // Extract userId, guestSubjectId, spriteId from joinToken (server-only)
        if (authPayload && typeof authPayload === 'object') {
            if (authPayload.userId) {
                player.userId = authPayload.userId;
            }
            if (authPayload.guestSubjectId) {
                player.guestSubjectId = authPayload.guestSubjectId;
            }
            if (authPayload.spriteId) {
                player.spriteId = authPayload.spriteId;
            }
        }

        // Priority: token nickname > options.name > generated name
        if (tokenNickname) {
            player.name = tokenNickname.trim().slice(0, 24);
        } else if (options.name && options.name.trim().length > 0) {
            player.name = options.name.trim().slice(0, 24);
        } else {
            // Собираем существующие имена для проверки уникальности
            const existingNames: string[] = [];
            this.state.players.forEach((p) => existingNames.push(p.name));
            
            // Генерируем seed из sessionId игрока, не изменяя состояние RNG симуляции
            let nameSeed = 0;
            for (let i = 0; i < client.sessionId.length; i++) {
                nameSeed = (nameSeed * 31 + client.sessionId.charCodeAt(i)) >>> 0;
            }
            nameSeed = nameSeed % 2147483647;
            player.name = generateUniqueName(nameSeed, existingNames);
        }
        const spawnRadius = getSlimeRadiusFromConfig(this.balance.slime.initialMass, this.balance.slimeConfigs.base);
        const spawn = this.findSpawnPoint(
            spawnRadius,
            this.balance.obstacles.spacing,
            this.balance.obstacles.placementRetries
        );
        player.x = spawn.x;
        player.y = spawn.y;
        player.mass = this.balance.slime.initialMass;
        player.level = this.balance.slime.initialLevel;
        
        // Класс: 0 = Hunter, 1 = Warrior, 2 = Collector
        // Если classId не передан или некорректен, игрок ждёт выбора класса
        let rawClassId = typeof options.classId === "number" ? options.classId : -1;
        if (rawClassId < 0 || rawClassId > 2) {
            rawClassId = -1;
        }
        player.classId = rawClassId;
        
        // Классовое умение в слот 0 (GDD v3.3 1.3)
        const classAbilities = ["dash", "shield", "pull"];
        player.abilitySlot0 = player.classId >= 0 ? (classAbilities[player.classId] || "dash") : "";
        player.abilitySlot1 = "";  // Разблокируется на level 3
        player.abilitySlot2 = "";  // Разблокируется на level 5
        player.abilityLevel0 = player.abilitySlot0 ? 1 : 0;
        player.abilityLevel1 = 0;
        player.abilityLevel2 = 0;
        player.pendingAbilityCard = null;
        
        player.talentsAvailable = 0;
        player.angle = 0;
        player.angVel = 0;
        player.isDrifting = false;
        player.gcdReadyTick = this.tick;
        this.resetAbilityCooldowns(player, this.tick);
        player.lastInputTick = this.tick;
        
        // Если матч завершён (фаза Results) или класс не выбран, игрок ждёт следующий раунд
        // Помечаем как isDead, чтобы не попал в таблицу лидеров текущего матча
        if (player.classId < 0 || this.isMatchEnded || this.state.phase === "Results") {
            player.isDead = true;
            player.respawnAtTick = Number.MAX_SAFE_INTEGER;
        } else {
            player.isDead = false;
        }
        
        this.state.players.set(client.sessionId, player);
        
        // Не обновляем таблицу лидеров если матч завершён
        if (!this.isMatchEnded && this.state.phase !== "Results") {
            this.updateLeaderboard();
        }
        
        client.send("balance", this.balance);
        console.log(`${client.sessionId} joined!`);
    }

    onLeave(client: Client) {
        this.state.players.delete(client.sessionId);
        this.updateLeaderboard();
        console.log(`${client.sessionId} left!`);
    }

    onDispose() {
        console.log("room", this.roomId, "disposing...");
        this.telemetry?.close();
    }

    private applyMapSizeConfig() {
        const mapSizes = this.balance.world.mapSizes ?? [] as number[];
        const validSizes = mapSizes.filter((size: number) => Number.isFinite(size) && size > 0);
        if (validSizes.length === 0) return;

        const chosen = validSizes[Math.floor(this.rng.next() * validSizes.length)];
        if (!Number.isFinite(chosen) || chosen <= 0) return;

        this.balance.world.mapSize = chosen;
        if (this.balance.worldPhysics.worldShape === "circle") {
            this.balance.worldPhysics.radiusM = chosen / 2;
        } else {
            this.balance.worldPhysics.widthM = chosen;
            this.balance.worldPhysics.heightM = chosen;
        }
    }

    private onTick() {
        try {
            const tickStartMs = Date.now();
            this.tick += 1;
            this.state.serverTick = this.tick;

            this.updateMatchPhase();

            // Results phase: полная заморозка симуляции
            if (this.isMatchEnded) {
                // Только обновляем orbs для визуального эффекта (они замедляются)
                this.updateOrbsVisual();
                this.updatePlayerFlags();
                this.reportMetrics(tickStartMs);
                return;
            }

            this.collectInputs();
            this.applyInputs();
            this.boostSystem();
            this.abilitySystem();
            this.abilityCardSystem();  // GDD v3.3: обработка карточек выбора умений
            this.talentCardSystem();   // GDD-Talents: обработка карточек выбора талантов
            this.updateOrbs();
            this.updateChests();
            this.toxicPoolSystem();
            this.slowZoneSystem();  // GDD v3.3: до flightAssist чтобы FLAG_SLOWED был актуален
            this.flightAssistSystem();
            this.physicsSystem();
            this.collisionSystem();
            this.projectileSystem();
            this.mineSystem();
            this.chestSystem();
            this.statusEffectSystem();
            this.zoneEffectSystem();
            this.deathSystem();
            this.hungerSystem();
            this.safeZoneSystem();
            this.rebelSystem();
            this.updatePlayerFlags();
            this.reportMetrics(tickStartMs);
        } catch (error) {
            // Критическая ошибка — состояние комнаты может быть повреждено
            console.error(`[ArenaRoom ${this.roomId}] CRITICAL: onTick() error at tick ${this.tick}:`, error);
            if (error instanceof Error) {
                console.error("Стек:", error.stack);
            }
            // Безопасно закрываем комнату — отключаем всех клиентов
            this.clients.forEach(client => client.leave());
        }
    }

    private collectInputs() {
        // Inputs are captured in onMessage, nothing else to do here yet.
    }

    private applyInputs() {
        const deadzone = this.balance.controls.joystickDeadzone;
        const timeoutTick = this.inputTimeoutTicks > 0 ? this.tick - this.inputTimeoutTicks : null;
        for (const player of this.state.players.values()) {
            if (player.isDead) {
                player.inputX = 0;
                player.inputY = 0;
                continue;
            }
            if (player.stunEndTick > this.tick) {
                player.inputX = 0;
                player.inputY = 0;
                continue;
            }
            if (timeoutTick !== null && player.lastInputTick <= timeoutTick) {
                player.inputX = 0;
                player.inputY = 0;
                continue;
            }

            let x = player.inputX;
            let y = player.inputY;
            const len = Math.hypot(x, y);
            if (len <= deadzone) {
                player.inputX = 0;
                player.inputY = 0;
                continue;
            }

            const normalized = 1 / Math.max(len, 1e-6);
            const mag = Math.min(1, (len - deadzone) / Math.max(1 - deadzone, 1e-6));
            x = x * normalized * mag;
            y = y * normalized * mag;
            player.inputX = x;
            player.inputY = y;
        }
    }

    private boostSystem() {
        boostSystem(this);
    }

    private abilitySystem() {
        abilitySystem(this);
    }

    activateAbility(player: Player, slot: number) {
        activateAbilityModule(this, player, slot);
    }

    resetAbilityCooldowns(player: Player, tick: number) {
        resetAbilityCooldownsModule(player, tick);
    }

    private getAbilityLevelForSlot(player: Player, slot: number): number {
        return getAbilityLevelForSlotModule(player, slot);
    }

    setAbilityLevelForSlot(player: Player, slot: number, level: number) {
        setAbilityLevelForSlotModule(player, slot, level);
    }

    getAbilityLevelForAbility(player: Player, abilityId: string): number {
        if (player.abilitySlot0 === abilityId) return this.getAbilityLevelForSlot(player, 0);
        if (player.abilitySlot1 === abilityId) return this.getAbilityLevelForSlot(player, 1);
        if (player.abilitySlot2 === abilityId) return this.getAbilityLevelForSlot(player, 2);
        return 0;
    }

    getAbilityConfigById(abilityId: string, level: number) {
        const abilities = this.balance.abilities as any;
        const safeLevel = Math.max(1, Math.min(3, Math.floor(level)));
        const resolveLevel = (config: any) => {
            if (!config?.levels || config.levels.length === 0) return config;
            const index = Math.max(0, Math.min(config.levels.length - 1, safeLevel - 1));
            return config.levels[index] ?? config;
        };
        switch (abilityId) {
            case "pull":
            case "magnet":
                return resolveLevel(abilities.magnet);
            case "dash":
                return resolveLevel(abilities.dash);
            case "shield":
                return resolveLevel(abilities.shield);
            case "slow":
                return resolveLevel(abilities.slow);
            case "projectile":
                return resolveLevel(abilities.projectile);
            case "spit":
                return resolveLevel(abilities.spit);
            case "bomb":
                return resolveLevel(abilities.bomb);
            case "push":
                return resolveLevel(abilities.push);
            case "mine":
                return resolveLevel(abilities.mine);
            default:
                return resolveLevel(abilities.dash);
        }
    }

    private isBoostActive(player: Player, boostType: BoostType): boolean {
        if (player.boostType !== boostType) return false;
        if (player.boostEndTick > 0 && this.tick < player.boostEndTick) return true;
        this.clearBoost(player);
        return false;
    }

    clearBoost(player: Player) {
        player.boostType = "";
        player.boostEndTick = 0;
        player.boostCharges = 0;
    }

    private getBoostMaxCharges(boostType: BoostType): number {
        if (boostType === "guard") {
            return Math.max(0, Math.floor(this.balance.boosts.guard.charges));
        }
        if (boostType === "greed") {
            return Math.max(0, Math.floor(this.balance.boosts.greed.charges));
        }
        return 0;
    }

    private getRageDamageMultiplier(player: Player): number {
        if (!this.isBoostActive(player, "rage")) return 1;
        return Math.max(0, this.balance.boosts.rage.damageMul);
    }

    private getHasteSpeedMultiplier(player: Player): number {
        if (!this.isBoostActive(player, "haste")) return 1;
        return Math.max(0, this.balance.boosts.haste.speedMul);
    }

    tryConsumeGuard(player: Player): boolean {
        if (!this.isBoostActive(player, "guard")) return false;
        if (player.boostCharges <= 0) {
            this.clearBoost(player);
            return false;
        }
        player.boostCharges = Math.max(0, player.boostCharges - 1);
        if (player.boostCharges <= 0) {
            this.clearBoost(player);
        }
        return true;
    }

    private applyGreedToOrbGain(player: Player, gain: number): number {
        if (gain <= 0) return gain;
        if (!this.isBoostActive(player, "greed")) return gain;
        if (player.boostCharges <= 0) {
            this.clearBoost(player);
            return gain;
        }
        const multiplier = Math.max(0, this.balance.boosts.greed.bubbleMassMul);
        const boostedGain = gain * multiplier;
        player.boostCharges = Math.max(0, player.boostCharges - 1);
        if (player.boostCharges <= 0) {
            this.clearBoost(player);
        }
        return boostedGain;
    }

    private getBoostDurationSec(boostType: BoostType): number {
        switch (boostType) {
            case "rage":
                return this.balance.boosts.rage.durationSec;
            case "haste":
                return this.balance.boosts.haste.durationSec;
            case "guard":
                return this.balance.boosts.guard.durationSec;
            case "greed":
                return this.balance.boosts.greed.durationSec;
            default:
                return 0;
        }
    }

    private applyBoost(player: Player, boostType: BoostType) {
        const durationSec = this.getBoostDurationSec(boostType);
        if (durationSec <= 0) return;

        const durationTicks = this.secondsToTicks(durationSec);
        const maxStackTicks = this.secondsToTicks(this.balance.boosts.maxStackTimeSec);
        const maxCharges = this.getBoostMaxCharges(boostType);

        const isStacked = player.boostType === boostType && player.boostEndTick > this.tick;
        if (isStacked) {
            const stackedEnd = player.boostEndTick + durationTicks;
            const maxEnd = maxStackTicks > 0 ? this.tick + maxStackTicks : stackedEnd;
            player.boostEndTick = Math.min(stackedEnd, maxEnd);
            if (maxCharges > 0) {
                player.boostCharges = Math.max(player.boostCharges, maxCharges);
            }
            this.logTelemetry(
                "boost_gained",
                {
                    boostType,
                    boostEndTick: player.boostEndTick,
                    boostCharges: player.boostCharges,
                    stacked: true,
                },
                player
            );
            return;
        }

        player.boostType = boostType;
        player.boostEndTick = this.tick + durationTicks;
        player.boostCharges = maxCharges;
        this.logTelemetry(
            "boost_gained",
            {
                boostType,
                boostEndTick: player.boostEndTick,
                boostCharges: player.boostCharges,
                stacked: false,
            },
            player
        );
    }

    getDamageBonusMultiplier(attacker: Player, includeBiteBonus: boolean): number {
        const bonus = attacker.mod_damageBonus + (includeBiteBonus ? attacker.mod_biteDamageBonus : 0);
        return Math.max(0, (1 + bonus) * this.getRageDamageMultiplier(attacker));
    }

    getDamageTakenMultiplier(defender: Player): number {
        const reduction = this.clamp(defender.mod_allDamageReduction, 0, 0.9);
        const takenMultiplier = Math.max(0, 1 + defender.mod_damageTakenBonus);
        return takenMultiplier * (1 - reduction);
    }

    clearInvisibility(player: Player) {
        if (this.tick < player.invisibleEndTick) {
            player.invisibleEndTick = 0;
        }
    }

    applyPushWave(
        sourceX: number,
        sourceY: number,
        radiusM: number,
        impulseNs: number,
        minSpeedMps: number,
        maxSpeedMps: number,
        excludeId?: string
    ) {
        applyPushWaveModule(this, sourceX, sourceY, radiusM, impulseNs, minSpeedMps, maxSpeedMps, excludeId);
    }

    private applyTalentChoice(player: Player, choice: number) {
        const applyMassBonus = (bonus: number) => {
            if (bonus <= 0) return;
            this.applyMassDelta(player, player.mass * bonus);
        };

        switch (choice) {
            case 0:
                applyMassBonus(0.05);
                break;
            case 1:
                // Mass Boost (ранее Vital Burst): +30% массы
                applyMassBonus(0.30);
                break;
            case 2:
                applyMassBonus(0.03);
                player.invulnerableUntilTick = Math.max(
                    player.invulnerableUntilTick,
                    this.tick + this.invulnerableTicks
                );
                break;
            default:
                break;
        }
    }

    private flightAssistSystem() {
        flightAssistSystem(this);
    }

    private physicsSystem() {
        physicsSystem(this);
    }

    private collisionSystem() {
        collisionSystem(this);
    }

    /**
     * Попытка съесть орб (вызывается при столкновении ртом).
     */
    private tryEatOrb(player: Player, orbId: string, orb: Orb) {
        player.lastBiteTick = this.tick;
        // GDD v3.3: GCD после укуса
        player.gcdReadyTick = this.tick + this.balance.server.globalCooldownTicks;

        const slimeConfig = this.getSlimeConfig(player);
        const classStats = this.getClassStats(player);
        const orbBiteMinMass = this.balance.orbs.orbBiteMinMass;
        const orbBiteMaxMass = this.balance.orbs.orbBiteMaxMass;
        // GCD ставится при попытке укуса, даже если масса ниже порога.
        if (player.mass < orbBiteMinMass) return;
        const bitePct = slimeConfig.combat.orbBitePctOfMass * classStats.eatingPowerMult;

        // Если orb.mass <= bitePct * player.mass - проглотить целиком
        // Иначе - откусить bitePct * player.mass
        const effectiveMass = Math.min(player.mass, orbBiteMaxMass);
        const swallowThreshold = effectiveMass * bitePct;
        const canSwallow = orb.mass <= swallowThreshold;

        if (canSwallow || orb.mass <= this.balance.orbs.minMass) {
            const baseGain = orb.mass * (1 + player.mod_orbMassBonus);
            const gain = this.applyGreedToOrbGain(player, baseGain);
            this.applyMassDelta(player, gain);
            this.state.orbs.delete(orbId);
        } else {
            const biteMass = swallowThreshold;
            orb.mass -= biteMass;
            const baseGain = biteMass * (1 + player.mod_orbMassBonus);
            const gain = this.applyGreedToOrbGain(player, baseGain);
            this.applyMassDelta(player, gain);
        }
    }

    /**
     * Обрабатывает столкновения между орбами.
     */
    private orbOrbCollisions(restitution: number) {
        const orbs = Array.from(this.state.orbs.values());
        const slop = 0.001;
        const percent = 0.8;

        for (let i = 0; i < orbs.length; i++) {
            const o1 = orbs[i];
            const type1 = this.balance.orbs.types[o1.colorId] ?? this.balance.orbs.types[0];
            const r1 = getOrbRadius(o1.mass, type1.density);

            for (let j = i + 1; j < orbs.length; j++) {
                const o2 = orbs[j];
                const type2 = this.balance.orbs.types[o2.colorId] ?? this.balance.orbs.types[0];
                const r2 = getOrbRadius(o2.mass, type2.density);

                const dx = o2.x - o1.x;
                const dy = o2.y - o1.y;
                const minDist = r1 + r2;
                const distSq = dx * dx + dy * dy;
                if (distSq >= minDist * minDist) continue;

                const dist = Math.sqrt(distSq);
                const nx = dist > 0 ? dx / dist : 1;
                const ny = dist > 0 ? dy / dist : 0;
                const penetration = minDist - (dist || 0);

                // Физическая масса = пищевая масса
                const invMass1 = o1.mass > 0 ? 1 / o1.mass : 0;
                const invMass2 = o2.mass > 0 ? 1 / o2.mass : 0;
                const invMassSum = invMass1 + invMass2;

                if (invMassSum > 0) {
                    // Позиционная коррекция
                    const corrRaw = (Math.max(penetration - slop, 0) / invMassSum) * percent;
                    const corrX = nx * corrRaw;
                    const corrY = ny * corrRaw;
                    o1.x -= corrX * invMass1;
                    o1.y -= corrY * invMass1;
                    o2.x += corrX * invMass2;
                    o2.y += corrY * invMass2;

                    // Импульсное отталкивание
                    const rvx = o2.vx - o1.vx;
                    const rvy = o2.vy - o1.vy;
                    const velAlongNormal = rvx * nx + rvy * ny;
                    if (velAlongNormal <= 0) {
                        const jImpulse = (-(1 + restitution) * velAlongNormal) / invMassSum;
                        const impulseX = nx * jImpulse;
                        const impulseY = ny * jImpulse;
                        o1.vx -= impulseX * invMass1;
                        o1.vy -= impulseY * invMass1;
                        o2.vx += impulseX * invMass2;
                        o2.vy += impulseY * invMass2;
                    }
                }
            }
        }
    }

    processCombat(attacker: Player, defender: Player, dx: number, dy: number) {
        processCombatModule(this, attacker, defender, dx, dy);
    }

    applyShieldReflection(defender: Player, attacker: Player, incomingLoss: number) {
        applyShieldReflectionModule(this, defender, attacker, incomingLoss);
    }

    /**
     * Создаёт орбы, разлетающиеся от точки укуса PvP.
     * Эти орбы игнорируют maxCount - боевая механика важнее лимита.
     * @param colorId - colorId орбов (classId + 10 или золотой для Короля)
     */
    spawnPvPBiteOrbs(x: number, y: number, totalMass: number, colorId?: number): void {
        spawnPvPBiteOrbsModule(this, x, y, totalMass, colorId);
    }
    
    private projectileSystem() {
        projectileSystem(this);
    }
    
    /**
     * Взрыв бомбы - AoE урон всем в радиусе
     */
    explodeBomb(proj: Projectile) {
        explodeBombModule(this, proj);
    }
    
    /**
     * Система мин - детонация при контакте с врагами
     */
    private mineSystem() {
        mineSystem(this);
    }
    
    applyProjectileDamage(attacker: Player, defender: Player, damagePct: number) {
        applyProjectileDamageModule(this, attacker, defender, damagePct);
    }

    /**
     * Самоурон (от своей мины) - без передачи массы, но с Last Breath
     */
    applySelfDamage(player: Player, damagePct: number) {
        applySelfDamageModule(this, player, damagePct);
    }

    private chestSystem() {
        chestSystem(this);
    }

    private openChest(player: Player, chest: Chest) {
        const chestTypeId = this.getChestTypeId(chest.type);
        let rewardKind: "talent" | "boost" | "none" = "none";
        let rewardId = "";
        const awardedTalentId = this.awardChestTalent(player, chestTypeId);
        if (awardedTalentId) {
            rewardKind = "talent";
            rewardId = awardedTalentId;
        } else {
            const awardedBoostId = this.awardChestBoost(player, chestTypeId);
            if (awardedBoostId) {
                rewardKind = "boost";
                rewardId = awardedBoostId;
            }
        }
        if (rewardKind !== "none") {
            this.sendChestReward(player, chest, rewardKind, rewardId);
        }
        this.spawnChestRewardOrbs(chestTypeId, chest.x, chest.y);
        this.state.chests.delete(chest.id);
    }

    private sendChestReward(
        player: Player,
        chest: Chest,
        rewardKind: "talent" | "boost",
        rewardId: string
    ) {
        const client = this.clients.find((entry) => entry.sessionId === player.id);
        if (!client) return;
        client.send("chestReward", {
            chestId: chest.id,
            x: chest.x,
            y: chest.y,
            type: chest.type ?? 0,
            rewardKind,
            rewardId,
        });
    }

    private getChestTypeId(type: number): "rare" | "epic" | "gold" {
        if (type === 1) return "epic";
        if (type === 2) return "gold";
        return "rare";
    }

    private getChestTypeIndex(typeId: "rare" | "epic" | "gold"): number {
        return typeId === "epic" ? 1 : typeId === "gold" ? 2 : 0;
    }

    private awardChestTalent(player: Player, chestTypeId: "rare" | "epic" | "gold"): string | null {
        const available = this.getAvailableTalentsByRarity(player);
        const rarityPools = [available.common, available.rare, available.epic];
        if (rarityPools[0].length === 0 && rarityPools[1].length === 0 && rarityPools[2].length === 0) {
            return null;
        }

        const weights = this.balance.chests.rewards.talentRarityWeights[chestTypeId];
        const rarityWeights = [weights.common, weights.rare, weights.epic];
        const availableRarities = [0, 1, 2].filter((rarity) => rarityPools[rarity].length > 0);
        const totalWeight = availableRarities.reduce(
            (sum, rarity) => sum + Math.max(0, rarityWeights[rarity] ?? 0),
            0
        );
        let chosenRarity = availableRarities[0] ?? 0;
        if (totalWeight > 0) {
            let roll = this.rng.next() * totalWeight;
            for (const rarity of availableRarities) {
                roll -= Math.max(0, rarityWeights[rarity] ?? 0);
                if (roll < 0) {
                    chosenRarity = rarity;
                    break;
                }
            }
        } else if (availableRarities.length > 0) {
            chosenRarity = availableRarities[Math.floor(this.rng.next() * availableRarities.length)];
        }
        const pool = rarityPools[chosenRarity];
        const choice = pool[Math.floor(this.rng.next() * pool.length)];
        this.addTalentToPlayer(player, choice);
        return choice;
    }

    private awardChestBoost(player: Player, chestTypeId: "rare" | "epic" | "gold"): string | null {
        const allowedBoosts = this.balance.boosts.allowedByChestType[chestTypeId] ?? [];
        if (allowedBoosts.length === 0) return null;
        const choice = allowedBoosts[Math.floor(this.rng.next() * allowedBoosts.length)];
        this.applyBoost(player, choice);
        return choice;
    }

    private pickTalentRarity(weights: { common: number; rare: number; epic: number }): number {
        const total = weights.common + weights.rare + weights.epic;
        if (total <= 0) return 0;
        const roll = this.rng.next() * total;
        if (roll < weights.common) return 0;
        if (roll < weights.common + weights.rare) return 1;
        return 2;
    }

    private getAvailableTalentsByRarity(player: Player) {
        const talents = this.balance.talents;
        const available = {
            common: [] as string[],
            rare: [] as string[],
            epic: [] as string[],
        };
        const addFromPool = (
            pool: string[],
            configs: Record<string, TalentConfig>,
            dest: string[]
        ) => {
            for (const id of pool) {
                const config = configs[id];
                if (!config) continue;

                if (config.requirement) {
                    const hasRequirement =
                        player.abilitySlot0 === config.requirement ||
                        player.abilitySlot1 === config.requirement ||
                        player.abilitySlot2 === config.requirement;
                    if (!hasRequirement) continue;
                }

                let currentLevel = 0;
                for (const t of player.talents) {
                    if (t.id === id) {
                        currentLevel = t.level;
                        break;
                    }
                }

                if (currentLevel < config.maxLevel) {
                    dest.push(id);
                }
            }
        };

        addFromPool(talents.talentPool.common, talents.common, available.common);
        addFromPool(talents.talentPool.rare, talents.rare, available.rare);
        addFromPool(talents.talentPool.epic, talents.epic, available.epic);

        const className = this.getClassName(player.classId);
        const classTalents = talents.classTalents[className];
        if (classTalents) {
            for (const [id, config] of Object.entries(classTalents) as [string, ClassTalentConfig][]) {
                if (config.requirement) {
                    const hasRequirement =
                        player.abilitySlot0 === config.requirement ||
                        player.abilitySlot1 === config.requirement ||
                        player.abilitySlot2 === config.requirement;
                    if (!hasRequirement) continue;
                }

                let currentLevel = 0;
                for (const t of player.talents) {
                    if (t.id === id) {
                        currentLevel = t.level;
                        break;
                    }
                }

                if (currentLevel < config.maxLevel) {
                    const dest = config.rarity === "epic" ? available.epic : available.rare;
                    dest.push(id);
                }
            }
        }

        return available;
    }

    private spawnChestRewardOrbs(chestTypeId: "rare" | "epic" | "gold", x: number, y: number) {
        const rewards = this.balance.chests.rewards;
        const typeIndex = this.getChestTypeIndex(chestTypeId);
        const bubbleCount = Math.max(0, Math.floor(rewards.scatterBubbleCount[typeIndex] ?? 0));
        const totalMassPct = rewards.scatterTotalMassPct[typeIndex] ?? 0;
        if (bubbleCount <= 0 || totalMassPct <= 0) return;

        const averageMass = this.getAveragePlayerMass();
        const totalMass = averageMass * totalMassPct;
        if (totalMass <= 0) return;

        const innerFrac = this.clamp(rewards.scatterInnerFrac[typeIndex] ?? 0, 0, 1);
        const innerCount = Math.min(bubbleCount, Math.round(bubbleCount * innerFrac));
        const avgOrbMass = totalMass / bubbleCount;
        const goldColorId = this.getOrbTypeIndexById("gold");

        const massWeights: number[] = [];
        let totalWeight = 0;
        for (let i = 0; i < bubbleCount; i += 1) {
            const weight = this.rng.range(0.7, 1.3);
            massWeights.push(weight);
            totalWeight += weight;
        }

        const angleStep = (Math.PI * 2) / bubbleCount;
        for (let i = 0; i < bubbleCount; i += 1) {
            const isInner = i < innerCount;
            const speedMin =
                (isInner
                    ? rewards.scatterInnerSpeedMpsMin[typeIndex]
                    : rewards.scatterOuterSpeedMpsMin[typeIndex]) ?? 0;
            const speedMax =
                (isInner
                    ? rewards.scatterInnerSpeedMpsMax[typeIndex]
                    : rewards.scatterOuterSpeedMpsMax[typeIndex]) ?? speedMin;
            const baseSpeed = this.rng.range(speedMin, speedMax);
            const orbMass = totalMass * (massWeights[i] / totalWeight);
            const speedMultiplier = orbMass < avgOrbMass ? rewards.scatterSmallBubbleSpeedMul : 1;
            const speed = baseSpeed * speedMultiplier;
            const angle = i * angleStep + this.rng.range(-0.35, 0.35);
            const orb = this.forceSpawnOrb(x, y, orbMass, goldColorId);
            orb.vx = Math.cos(angle) * speed;
            orb.vy = Math.sin(angle) * speed;
        }
    }

    private getAveragePlayerMass(): number {
        let total = 0;
        let count = 0;
        for (const player of this.state.players.values()) {
            if (player.isDead) continue;
            total += player.mass;
            count += 1;
        }
        return count > 0 ? total / count : this.balance.slime.initialMass;
    }

    private getOrbTypeIndexById(id: string): number {
        const types = this.balance.orbs.types;
        for (let i = 0; i < types.length; i += 1) {
            if (types[i]?.id === id) return i;
        }
        return Math.max(0, types.length - 1);
    }

    getDamageOrbColorId(player: Player): number {
        if (this.state.rebelId && player.id === this.state.rebelId) {
            return this.getOrbTypeIndexById("gold");
        }
        return Math.max(0, player.classId) + 10;
    }

    private grantTalent(player: Player): boolean {
        // Выдаём карточку таланта через новую систему
        this.awardTalentToPlayer(player);
        return true;
    }

    private deathSystem() {
        deathSystem(this);
    }

    private handlePlayerDeath(player: Player) {
        handlePlayerDeathModule(this, player);
    }

    awardKillMass(player: Player) {
        const baseReward = this.balance.slime.initialMass;
        const reward = baseReward * (1 + Math.max(0, player.mod_killMassBonus));
        if (reward > 0) {
            this.applyMassDelta(player, reward);
        }
    }

    spawnDeathExplosion(player: Player) {
        const radius = player.mod_deathExplosionRadiusM;
        const damagePct = player.mod_deathExplosionDamagePct;
        if (radius <= 0 || damagePct <= 0) return;

        const radiusSq = radius * radius;
        const impulseNs = this.balance.abilities.push?.impulseNs ?? 0;

        for (const target of this.state.players.values()) {
            if (target.isDead || target.id === player.id) continue;
            if (target.isLastBreath) continue;
            if (this.tick < target.invulnerableUntilTick) continue;

            const dx = target.x - player.x;
            const dy = target.y - player.y;
            const distSq = dx * dx + dy * dy;
            if (distSq > radiusSq) continue;

            const damageBonusMult = this.getDamageBonusMultiplier(player, false);
            const damageTakenMult = this.getDamageTakenMultiplier(target);
            const baseLoss = target.mass * damagePct * damageBonusMult * damageTakenMult;

            if ((target.flags & FLAG_ABILITY_SHIELD) !== 0) {
                this.applyShieldReflection(target, player, baseLoss);
                continue;
            }

            if (this.tryConsumeGuard(target)) {
                continue;
            }

            let massLoss = baseLoss;

            const newMass = target.mass - massLoss;
            const triggersLastBreath =
                newMass <= this.balance.physics.minSlimeMass &&
                !target.isLastBreath &&
                this.lastBreathTicks > 0 &&
                !target.isDead;

            if (triggersLastBreath) {
                massLoss = Math.max(0, target.mass - this.balance.physics.minSlimeMass);
            }

            if (massLoss > 0) {
                this.applyMassDelta(target, -massLoss);
                target.lastDamagedById = player.id;
                target.lastDamagedAtTick = this.tick;
                this.spawnPvPBiteOrbs(target.x, target.y, massLoss * 0.5, this.getDamageOrbColorId(target));
            }

            if (triggersLastBreath) {
                target.isLastBreath = true;
                target.lastBreathEndTick = this.tick + this.lastBreathTicks;
                target.invulnerableUntilTick = target.lastBreathEndTick;
                continue;
            }

            target.invulnerableUntilTick = this.tick + this.invulnerableTicks;

            if (impulseNs > 0) {
                const dist = Math.sqrt(Math.max(distSq, 1e-6));
                const nx = dx / dist;
                const ny = dy / dist;
                const targetMass = Math.max(target.mass, this.balance.physics.minSlimeMass);
                const speed = this.clamp(impulseNs / targetMass, 30, 120);
                target.vx += nx * speed;
                target.vy += ny * speed;
            }
        }
    }

    spawnDeathNeedles(player: Player) {
        const count = player.mod_deathNeedlesCount;
        const damagePct = player.mod_deathNeedlesDamagePct;
        if (count <= 0 || damagePct <= 0) return;

        const config = this.balance.abilities.projectile;
        const baseAngle = player.angle + Math.PI;
        const spread = Math.min(Math.PI / 3, 0.35 + count * 0.05);

        for (let i = 0; i < count; i += 1) {
            const t = count > 1 ? i / (count - 1) : 0.5;
            const offset = (t - 0.5) * spread;
            const angle = baseAngle + offset + this.rng.range(-0.05, 0.05);
            const proj = new Projectile();
            proj.id = `proj_${++this.projectileIdCounter}`;
            proj.ownerId = player.id;
            proj.x = player.x;
            proj.y = player.y;
            proj.startX = player.x;
            proj.startY = player.y;
            proj.vx = Math.cos(angle) * config.speedMps;
            proj.vy = Math.sin(angle) * config.speedMps;
            proj.radius = config.radiusM * 0.7;
            proj.damagePct = damagePct;
            proj.spawnTick = this.tick;
            proj.maxRangeM = config.rangeM;
            proj.allowDeadOwner = true;
            this.state.projectiles.set(proj.id, proj);
        }
    }

    spawnToxicPool(player: Player) {
        const baseRadius = this.balance.toxicPools.radiusM;
        const durationSec = this.balance.toxicPools.durationSec;
        if (baseRadius <= 0 || durationSec <= 0) return;
        if (player.mod_toxicPoolBonus <= 1) return;

        const pool = new ToxicPool();
        pool.id = `toxic_${++this.toxicPoolIdCounter}`;
        pool.x = player.x;
        pool.y = player.y;
        pool.radius = baseRadius * Math.max(0.1, player.mod_toxicPoolBonus);
        pool.slowPct = this.balance.toxicPools.slowPct;
        pool.damagePctPerSec = this.balance.toxicPools.damagePctPerSec;
        pool.endTick = this.tick + this.secondsToTicks(durationSec);
        this.state.toxicPools.set(pool.id, pool);
    }

    private handlePlayerRespawn(player: Player) {
        handlePlayerRespawnModule(this, player);
    }

    private updateOrbs() {
        updateOrbs(this);
    }

    /**
     * Визуальное обновление орбов во время фазы Results (без спауна).
     * Орбы только замедляются и останавливаются у границ.
     */
    private updateOrbsVisual(): void {
        updateOrbsVisual(this);
    }

    private updateChests() {
        updateChests(this);
    }

    private slowZoneSystem() {
        slowZoneSystem(this);
    }

    private toxicPoolSystem() {
        toxicPoolSystem(this);
    }

    private statusEffectSystem() {
        statusEffectSystem(this);
    }

    private zoneEffectSystem() {
        zoneEffectSystem(this);
    }

    private spawnLavaOrbs(player: Player, addedMass: number) {
        if (addedMass <= 0) return;
        
        // Накапливаем массу до минимального порога
        player.pendingLavaScatterMass += addedMass;
        
        const minOrbMass = this.balance.combat.scatterOrbMinMass ?? 5;
        if (player.pendingLavaScatterMass < minOrbMass) return;
        
        const totalMass = player.pendingLavaScatterMass;
        player.pendingLavaScatterMass = 0;
        
        let count = Math.max(0, Math.floor(this.balance.zones.lava.scatterOrbCount));
        if (count <= 0) return;

        let perOrbMass = totalMass / count;
        if (perOrbMass < minOrbMass) {
            count = Math.max(1, Math.floor(totalMass / minOrbMass));
            perOrbMass = totalMass / count;
        }

        const angleStep = (Math.PI * 2) / count;
        const speed = Math.max(0, this.balance.zones.lava.scatterSpeedMps);
        const colorId = this.getDamageOrbColorId(player);
        for (let i = 0; i < count; i += 1) {
            const angle = i * angleStep + this.rng.range(-0.3, 0.3);
            const orb = this.forceSpawnOrb(player.x, player.y, perOrbMass, colorId);
            orb.vx = Math.cos(angle) * speed;
            orb.vy = Math.sin(angle) * speed;
        }
    }

    private hungerSystem() {
        hungerSystem(this);
    }

    private safeZoneSystem() {
        safeZoneSystem(this);
    }

    private rebelSystem() {
        rebelSystem(this);
    }

    private updateLeaderboard() {
        const sorted = Array.from(this.state.players.values())
            .filter((player) => !player.isDead)
            .sort((a, b) => b.mass - a.mass)
            .slice(0, 10);
        this.state.leaderboard.length = 0;
        for (const player of sorted) {
            this.state.leaderboard.push(player.id);
        }
    }

    private updatePlayerFlags() {
        for (const player of this.state.players.values()) {
            let flags = 0;
            if (player.isDead) {
                flags |= FLAG_IS_DEAD;
            }
            if (player.isLastBreath) {
                flags |= FLAG_LAST_BREATH;
            }
            if (!player.isDead && !player.isLastBreath && this.tick < player.invulnerableUntilTick) {
                flags |= FLAG_RESPAWN_SHIELD;
            }
            if (this.state.rebelId && player.id === this.state.rebelId) {
                flags |= FLAG_IS_REBEL;
            }
            
            // Ability flags
            if (this.tick < player.dashEndTick) {
                flags |= FLAG_DASHING;
            } else if (player.dashEndTick > 0) {
                // Dash ended
                player.dashEndTick = 0;
            }
            
            if (this.tick < player.shieldEndTick) {
                flags |= FLAG_ABILITY_SHIELD;
            } else if (player.shieldEndTick > 0) {
                const shieldLevel = this.getAbilityLevelForAbility(player, "shield") || 1;
                const shieldConfig = this.getAbilityConfigById("shield", shieldLevel);
                const burstRadius = Math.max(0, Number(shieldConfig.burstRadiusM ?? 0));
                if (burstRadius > 0) {
                    const pushConfig = this.getAbilityConfigById("push", 1);
                    this.applyPushWave(
                        player.x,
                        player.y,
                        burstRadius,
                        pushConfig.impulseNs,
                        pushConfig.minSpeedMps,
                        pushConfig.maxSpeedMps,
                        player.id
                    );
                }
                // Shield ended
                player.shieldEndTick = 0;
            }
            
            if (this.tick < player.magnetEndTick) {
                flags |= FLAG_MAGNETIZING;
            } else if (player.magnetEndTick > 0) {
                // Magnet ended
                player.magnetEndTick = 0;
            }

            if (this.tick < player.pushEndTick) {
                flags |= FLAG_PUSHING;
            } else if (player.pushEndTick > 0) {
                player.pushEndTick = 0;
            }

            if (this.tick < player.stunEndTick) {
                flags |= FLAG_STUNNED;
            } else if (player.stunEndTick > 0) {
                player.stunEndTick = 0;
            }

            if (this.tick < player.invisibleEndTick) {
                flags |= FLAG_INVISIBLE;
            } else if (player.invisibleEndTick > 0) {
                player.invisibleEndTick = 0;
            }

            if (player.mod_leviathanRadiusMul > 1 || player.mod_leviathanMouthMul > 1) {
                flags |= FLAG_LEVIATHAN;
            }

            if (player.doubleAbilityWindowEndTick > 0 && this.tick >= player.doubleAbilityWindowEndTick) {
                player.doubleAbilityWindowEndTick = 0;
                player.doubleAbilitySlot = null;
                player.doubleAbilitySecondUsed = false;
            }
            
            // FLAG_SLOWED устанавливается в slowZoneSystem() и должен сохраняться
            if ((player.flags & FLAG_SLOWED) !== 0) {
                flags |= FLAG_SLOWED;
            }
            
            player.flags = flags;
        }
    }

    private updateMatchPhase() {
        // Если матч завершён и в фазе Results - проверяем время для перезапуска
        if (this.isMatchEnded) {
            const ticksSinceResults = this.tick - this.resultsStartTick;
            const totalResultsTicks = this.resultsDurationTicks + this.restartDelayTicks;
            this.state.timeRemaining = Math.max(0, (totalResultsTicks - ticksSinceResults) / this.balance.server.tickRate);
            
            if (ticksSinceResults >= totalResultsTicks) {
                this.restartMatch();
            }
            return;
        }

        const elapsedSec = this.tick / this.balance.server.tickRate;
        this.state.timeRemaining = Math.max(0, this.balance.match.durationSec - elapsedSec);

        // Проверяем завершение матча
        if (elapsedSec >= this.balance.match.durationSec) {
            this.endMatch();
            return;
        }

        let nextPhase: MatchPhaseId = "Final";
        for (const phase of this.balance.match.phases) {
            if (elapsedSec >= phase.startSec && elapsedSec < phase.endSec) {
                nextPhase = phase.id;
                break;
            }
        }

        if (this.lastPhaseId !== nextPhase) {
            const prevPhase = this.lastPhaseId;
            console.log(`Phase: ${prevPhase ?? "none"} -> ${nextPhase}`);
            this.lastPhaseId = nextPhase;
            this.state.phase = nextPhase;
            if (!this.matchStartLogged && nextPhase !== "Results") {
                this.startMatchTelemetry();
            }
            this.logTelemetry("phase_change", { from: prevPhase ?? "none", to: nextPhase });
            this.handlePhaseChange(nextPhase);
        } else {
            this.state.phase = nextPhase;
        }
    }

    private endMatch() {
        this.isMatchEnded = true;
        this.resultsStartTick = this.tick;
        this.state.phase = "Results";
        this.lastPhaseId = "Results";
        this.updateLeaderboard();
        console.log("Match ended! Phase: Results");
        this.logTelemetry("match_end", {
            leaderboard: Array.from(this.state.leaderboard),
            playersAlive: Array.from(this.state.players.values()).filter((player) => !player.isDead).length,
        });

        // Останавливаем всех игроков
        for (const player of this.state.players.values()) {
            player.inputX = 0;
            player.inputY = 0;
            player.vx = 0;
            player.vy = 0;
            player.angVel = 0;
        }

        // Отправляем результаты матча на MetaServer
        this.submitMatchResults();
    }

    private submitMatchResults() {
        try {
            const matchResultService = getMatchResultService();

            // Формируем результаты игроков
            const playerResults: PlayerResult[] = [];
            const leaderboard = Array.from(this.state.leaderboard);

            for (const [sessionId, player] of this.state.players.entries()) {
                const placement = leaderboard.indexOf(sessionId) + 1;
                playerResults.push({
                    userId: player.userId || undefined,  // From joinToken (registered users)
                    guestSubjectId: player.guestSubjectId || undefined,  // P0-2: для идентификации гостей
                    sessionId,
                    placement: placement > 0 ? placement : leaderboard.length + 1,
                    finalMass: player.mass,
                    killCount: player.killCount,
                    deathCount: 0, // TODO: добавить счётчик смертей в Player schema
                    level: player.level,
                    classId: player.classId,
                    isDead: player.isDead,
                });
            }

            // Find guestSubjectId if any guest player exists in the match
            // Note: guestSubjectId is set per-match for claim verification (one guest per match supported)
            let guestSubjectId: string | undefined;
            for (const player of this.state.players.values()) {
                if (player.guestSubjectId) {
                    guestSubjectId = player.guestSubjectId;
                    break;
                }
            }

            // Формируем MatchSummary
            const matchSummary: MatchSummary = {
                matchId: this.matchId,
                mode: "arena",
                startedAt: this.matchStartedAt || new Date().toISOString(),
                endedAt: new Date().toISOString(),
                configVersion: "1.0.0", // TODO: получить из RuntimeConfig
                buildVersion: "0.3.1", // TODO: получить из package.json
                playerResults,
                matchStats: {
                    totalKills: playerResults.reduce((sum, p) => sum + p.killCount, 0),
                    totalBubblesCollected: 0, // TODO: добавить счётчик
                    matchDurationMs: Math.floor((this.tick / this.balance.server.tickRate) * 1000),
                },
                guestSubjectId,  // For guest claim verification
            };

            // Отправляем асинхронно, не блокируем игровой цикл
            matchResultService.submitMatchResult(matchSummary).catch((error) => {
                console.error(`[ArenaRoom] Failed to submit match results: ${error}`);
            });
        } catch (error) {
            // MatchResultService не инициализирован — это нормально в dev режиме
            console.log("[ArenaRoom] MatchResultService not available, skipping result submission");
        }
    }

    private restartMatch() {
        console.log("Restarting match...");
        this.isMatchEnded = false;
        this.resultsStartTick = 0;
        this.tick = 0;
        this.lastPhaseId = null;
        this.matchId = "";
        this.matchStartLogged = false;
        this.matchStartedAt = "";
        this.initMatchId();
        this.lastOrbSpawnTick = 0;
        this.lastChestSpawnTick = 0;
        this.lastRebelUpdateTick = 0;
        this.orbIdCounter = 0;
        this.chestIdCounter = 0;
        this.hotZoneIdCounter = 0;
        this.slowZoneIdCounter = 0;
        this.toxicPoolIdCounter = 0;
        this.projectileIdCounter = 0;
        this.mineIdCounter = 0;

        // Очистка состояния
        this.state.orbs.clear();
        this.state.chests.clear();
        this.state.hotZones.clear();
        this.state.slowZones.clear();
        this.state.zones.clear();
        this.state.obstacles.clear();
        this.state.safeZones.splice(0, this.state.safeZones.length);
        this.state.toxicPools.clear();
        this.state.projectiles.clear();
        this.state.mines.clear();
        this.state.rebelId = "";
        this.state.phase = "Spawn";
        this.state.timeRemaining = this.balance.match.durationSec;
        this.state.serverTick = 0;
        this.generateArena();

        // Респавн всех игроков
        for (const player of this.state.players.values()) {
            const spawn = this.randomPointInMap();
            player.x = spawn.x;
            player.y = spawn.y;
            player.vx = 0;
            player.vy = 0;
            player.angVel = 0;
            player.angle = 0;
            player.mass = this.balance.slime.initialMass;
            player.killCount = 0;
            player.level = this.balance.slime.initialLevel;
            // Новый матч: игрок не добавляется в бой до выбора класса
            player.isDead = true;
            player.isLastBreath = false;
            player.lastBreathEndTick = 0;
            player.invulnerableUntilTick = 0;
            player.respawnAtTick = Number.MAX_SAFE_INTEGER;
            player.gcdReadyTick = this.tick;
            this.resetAbilityCooldowns(player, this.tick);
            player.queuedAbilitySlot = null;
            player.queuedAbilityTick = 0;
            player.abilitySlotPressed = null;
            player.talentsAvailable = 0;
            player.lastAttackTick = 0;
            player.lastBiteTick = 0;
            player.inputX = 0;
            player.inputY = 0;
            player.lastInputTick = this.tick;
            player.flags = 0;
            player.yawSignHistory.length = 0;
            player.assistFx = 0;
            player.assistFy = 0;
            player.assistTorque = 0;
            
            // GDD-Talents: Сброс талантов между матчами
            player.pendingTalentCard = null;
            player.pendingTalentCount = 0;
            player.pendingTalentQueue = [];
            player.talentChoicePressed2 = null;
            player.talentChoicePressed = null;
            player.talents.splice(0, player.talents.length);
            this.recalculateTalentModifiers(player);
            this.clearBoost(player);
            
            // Сброс состояний способностей
            player.dashEndTick = 0;
            player.shieldEndTick = 0;
            player.magnetEndTick = 0;

            // GDD v3.3: Сброс слотов умений между матчами
            player.classId = -1;
            player.abilitySlot0 = "";
            player.abilitySlot1 = "";
            player.abilitySlot2 = "";
            player.abilityLevel0 = 0;
            player.abilityLevel1 = 0;
            player.abilityLevel2 = 0;
            player.pendingAbilityCard = null;
            player.cardChoicePressed = null;
            player.pendingCardSlots = [];
            player.pendingCardCount = 0;
        }

        this.spawnInitialOrbs();
        this.updateLeaderboard();
        console.log("Match restarted!");
    }

    private handlePhaseChange(phase: MatchPhaseId) {
        this.state.hotZones.clear();
        // GDD v3.3: Hot zones появляются в Hunt и Final
        if (phase === "Hunt") {
            this.spawnHotZones(this.balance.hotZones.chaosCount, this.balance.hotZones.spawnMultiplierChaos);
        } else if (phase === "Final") {
            this.spawnHotZones(this.balance.hotZones.finalCount, this.balance.hotZones.spawnMultiplierFinal, true);
        }
    }

    private generateArena() {
        generateArenaModule(this);
    }

    private isPointFreeOfObstacles(x: number, y: number, radius: number, padding: number): boolean {
        const safePadding = Math.max(0, padding);
        for (const obstacle of this.state.obstacles.values()) {
            const dx = x - obstacle.x;
            const dy = y - obstacle.y;
            const minDist = radius + obstacle.radius + safePadding;
            if (dx * dx + dy * dy < minDist * minDist) {
                return false;
            }
        }
        return true;
    }

    private isPointNearZoneType(x: number, y: number, radius: number, zoneType: number): boolean {
        const safeRadius = Math.max(0, radius);
        for (const zone of this.state.zones.values()) {
            if (zone.type !== zoneType) continue;
            const dx = x - zone.x;
            const dy = y - zone.y;
            const minDist = zone.radius + safeRadius;
            if (dx * dx + dy * dy < minDist * minDist) {
                return true;
            }
        }
        return false;
    }

    private randomPointAround(x: number, y: number, range: number) {
        const angle = this.rng.range(0, Math.PI * 2);
        const r = Math.sqrt(this.rng.next()) * range;
        return { x: x + Math.cos(angle) * r, y: y + Math.sin(angle) * r };
    }

    findSpawnPoint(
        radius: number,
        padding: number,
        retries: number,
        preferred?: { x: number; y: number }
    ) {
        const safeRadius = Math.max(0, radius);
        const safePadding = Math.max(0, padding);
        const attempts = Math.max(1, retries);
        const mapSize = this.balance.world.mapSize;
        const world = this.balance.worldPhysics;
        const isValid = (point: { x: number; y: number }) =>
            isInsideWorld(world, mapSize, point.x, point.y, safeRadius) &&
            this.isPointFreeOfObstacles(point.x, point.y, safeRadius, safePadding) &&
            !this.isPointNearZoneType(point.x, point.y, safeRadius, ZONE_TYPE_LAVA);

        if (preferred && isValid(preferred)) {
            return preferred;
        }

        for (let i = 0; i < attempts; i += 1) {
            const spread = safeRadius + safePadding * 2;
            const point = preferred
                ? this.randomPointAround(preferred.x, preferred.y, spread)
                : randomPointInMapWithMargin(this.rng, world, mapSize, safeRadius + safePadding);
            if (isValid(point)) {
                return point;
            }
        }

        return preferred ?? randomPointInMapWithMargin(this.rng, world, mapSize, safeRadius + safePadding);
    }

    private addObstacle(type: number, x: number, y: number, radius: number) {
        addObstacleModule(this, type, x, y, radius);
    }

    private spawnHotZones(count: number, spawnMultiplier: number, centerFirst = false) {
        const radius = this.balance.hotZones.radius;
        for (let i = 0; i < count; i += 1) {
            const zone = new HotZone();
            zone.id = `hot_${this.hotZoneIdCounter++}`;
            if (centerFirst && i === 0) {
                zone.x = 0;
                zone.y = 0;
            } else {
                const point = this.randomPointInMap();
                zone.x = point.x;
                zone.y = point.y;
            }
            zone.radius = radius;
            zone.spawnMultiplier = spawnMultiplier;
            this.state.hotZones.set(zone.id, zone);
        }
    }

    private isInsideHotZone(player: Player): boolean {
        for (const zone of this.state.hotZones.values()) {
            const dx = player.x - zone.x;
            const dy = player.y - zone.y;
            if (dx * dx + dy * dy <= zone.radius * zone.radius) {
                return true;
            }
        }
        return false;
    }

    private isInsideSafeZone(player: Player): boolean {
        for (const zone of this.state.safeZones) {
            const dx = player.x - zone.x;
            const dy = player.y - zone.y;
            if (dx * dx + dy * dy <= zone.radius * zone.radius) {
                return true;
            }
        }
        return false;
    }

    private isSafeZoneActive(): boolean {
        if (this.state.phase !== "Final") return false;
        const elapsedSec = this.tick / this.balance.server.tickRate;
        return elapsedSec >= this.balance.safeZones.finalStartSec;
    }

    private getZoneForPlayer(player: Player): Zone | null {
        if (this.state.zones.size === 0) return null;
        for (const zone of this.state.zones.values()) {
            const dx = player.x - zone.x;
            const dy = player.y - zone.y;
            if (dx * dx + dy * dy <= zone.radius * zone.radius) {
                return zone;
            }
        }
        return null;
    }

    private getZoneSpeedMultiplier(player: Player): number {
        const zone = this.getZoneForPlayer(player);
        if (!zone) return 1;
        if (zone.type === ZONE_TYPE_TURBO) {
            return Math.max(0, this.balance.zones.turbo.speedMultiplier);
        }
        if (zone.type === ZONE_TYPE_SLIME) {
            return Math.max(0, this.balance.zones.slime.speedMultiplier);
        }
        return 1;
    }

    private getZoneFrictionMultiplier(player: Player): number {
        const zone = this.getZoneForPlayer(player);
        if (!zone) return 1;
        if (zone.type === ZONE_TYPE_ICE) {
            return Math.max(0, this.balance.zones.ice.frictionMultiplier);
        }
        if (zone.type === ZONE_TYPE_SLIME) {
            return Math.max(0, this.balance.zones.slime.frictionMultiplier);
        }
        return 1;
    }

    private getOrbSpawnMultiplier(): number {
        let multiplier = 1;
        for (const zone of this.state.hotZones.values()) {
            multiplier = Math.max(multiplier, zone.spawnMultiplier);
        }
        return multiplier;
    }

    private randomOrbSpawnPoint() {
        if (this.state.hotZones.size > 0) {
            const zones = Array.from(this.state.hotZones.values());
            const zone = zones[this.rng.int(0, zones.length)];
            const angle = this.rng.range(0, Math.PI * 2);
            const radius = Math.sqrt(this.rng.next()) * zone.radius;
            const x = zone.x + Math.cos(angle) * radius;
            const y = zone.y + Math.sin(angle) * radius;
            return this.clampPointToWorld(x, y);
        }
        return this.randomPointInMap();
    }

    private spawnInitialOrbs() {
        spawnInitialOrbsModule(this);
    }

    spawnOrb(x?: number, y?: number, massOverride?: number): Orb | null {
        if (this.state.orbs.size >= this.balance.orbs.maxCount) return null;
        return this.forceSpawnOrb(x, y, massOverride);
    }

    /**
     * Создаёт орб без проверки maxCount (для scatter orbs и death orbs).
     */
    forceSpawnOrb(x?: number, y?: number, massOverride?: number, colorId?: number): Orb {
        const typePick = this.pickOrbType();
        const mass =
            massOverride ??
            this.rng.range(typePick.type.massRange[0], typePick.type.massRange[1]);
        const orbRadius = getOrbRadius(mass, typePick.type.density);
        const basePoint = x !== undefined && y !== undefined ? { x, y } : this.randomOrbSpawnPoint();
        const spawn = this.findSpawnPoint(
            orbRadius,
            this.balance.obstacles.spacing,
            this.balance.obstacles.placementRetries,
            basePoint
        );
        const orb = new Orb();
        orb.id = `orb_${this.orbIdCounter++}`;
        orb.x = spawn.x;
        orb.y = spawn.y;
        orb.mass = mass;
        orb.colorId = colorId ?? typePick.index;
        orb.vx = 0;
        orb.vy = 0;
        this.state.orbs.set(orb.id, orb);
        return orb;
    }

    private pickOrbType() {
        const types = this.balance.orbs.types;
        let total = 0;
        for (const type of types) total += type.weight;
        let roll = this.rng.range(0, total);
        for (let i = 0; i < types.length; i += 1) {
            const type = types[i];
            if (roll < type.weight) {
                return { type, index: i };
            }
            roll -= type.weight;
        }
        return { type: types[types.length - 1], index: types.length - 1 };
    }

    private spawnChest() {
        if (this.state.chests.size >= this.balance.chests.maxCount) return;
        const chest = new Chest();
        chest.id = `chest_${this.chestIdCounter++}`;
        const spawn = this.findSpawnPoint(
            this.balance.chests.radius,
            this.balance.obstacles.spacing,
            this.balance.obstacles.placementRetries
        );
        chest.x = spawn.x;
        chest.y = spawn.y;
        chest.vx = 0;
        chest.vy = 0;
        
        // GDD v3.3: Выбор типа сундука по фазе
        const phase = this.state.phase as "Growth" | "Hunt" | "Final";
        const phaseWeights = this.balance.chests.phaseWeights;
        const weights = phaseWeights?.[phase] ?? 
                        phaseWeights?.Growth ?? 
                        { rare: 85, epic: 15, gold: 0 };
        
        const totalWeight = weights.rare + weights.epic + weights.gold;
        const roll = this.rng.next() * totalWeight;
        
        let chestTypeId: "rare" | "epic" | "gold" = "rare";
        if (roll < weights.rare) {
            chestTypeId = "rare";
        } else if (roll < weights.rare + weights.epic) {
            chestTypeId = "epic";
        } else {
            chestTypeId = "gold";
        }
        
        // type: 0 = rare, 1 = epic, 2 = gold
        chest.type = chestTypeId === "rare" ? 0 : chestTypeId === "epic" ? 1 : 2;
        
        // GDD v3.3: armorRings по типу
        const typeConfig = this.balance.chests.types?.[chestTypeId];
        chest.armorRings = typeConfig?.armorRings ?? 0;
        
        this.state.chests.set(chest.id, chest);
    }

    getPlayerRadius(player: Player): number {
        const slimeConfig = this.getSlimeConfig(player);
        const classStats = this.getClassStats(player);
        const leviathanMul = player.mod_leviathanRadiusMul > 0 ? player.mod_leviathanRadiusMul : 1;
        return getSlimeRadiusFromConfig(player.mass, slimeConfig) * classStats.radiusMult * leviathanMul;
    }

    /** Точка притяжения орбов смещена на 1.9 радиуса от центра слайма по углу поворота */
    public getMouthPoint(player: Player): { x: number; y: number } {
        const radius = this.getPlayerRadius(player);
        const offset = radius * 1.9;
        return {
            x: player.x + Math.cos(player.angle) * offset,
            y: player.y + Math.sin(player.angle) * offset,
        };
    }

    getClassStats(player: Player): ClassStats {
        switch (player.classId) {
            case 1:
                return {
                    radiusMult: 1,
                    damageMult: this.balance.classes.warrior.damageVsSlimeMult,
                    biteResistPct: this.balance.classes.warrior.biteResistPct,
                    swallowLimit: this.balance.classes.warrior.swallowLimit,
                    biteFraction: this.balance.classes.warrior.biteFraction,
                    eatingPowerMult: 1,
                };
            case 2:
                return {
                    radiusMult: this.balance.classes.collector.radiusMult,
                    damageMult: 1,
                    biteResistPct: 0,
                    swallowLimit: this.balance.classes.collector.swallowLimit,
                    biteFraction: this.balance.classes.collector.biteFraction,
                    eatingPowerMult: this.balance.classes.collector.eatingPowerMult,
                };
            case 0:
            default:
                return {
                    radiusMult: 1,
                    damageMult: 1,
                    biteResistPct: this.balance.classes.hunter.biteResistPct,
                    swallowLimit: this.balance.classes.hunter.swallowLimit,
                    biteFraction: this.balance.classes.hunter.biteFraction,
                    eatingPowerMult: 1,
                };
        }
    }

    getContactZone(attacker: Player, dx: number, dy: number): ContactZone {
        const angleToTarget = Math.atan2(dy, dx);
        const diff = this.normalizeAngle(angleToTarget - attacker.angle);
        const mouthHalf = this.getMouthHalfAngle(attacker);
        const tailHalf = (this.balance.combat.tailArcDeg * Math.PI) / 360;
        if (Math.abs(diff) <= mouthHalf) return "mouth";
        if (Math.abs(diff) >= Math.PI - tailHalf) return "tail";
        return "side";
    }

    private getMouthHalfAngle(player: Player): number {
        const mouthMul = player.mod_leviathanMouthMul > 0 ? player.mod_leviathanMouthMul : 1;
        const mouthArcDeg = this.balance.combat.mouthArcDeg * mouthMul;
        return (Math.min(mouthArcDeg, 180) * Math.PI) / 360;
    }

    private normalizeAngle(angle: number): number {
        let value = angle;
        while (value < -Math.PI) value += Math.PI * 2;
        while (value > Math.PI) value -= Math.PI * 2;
        return value;
    }

    private applyYawOscillationDamping(player: Player, yawCmd: number, slimeConfig: SlimeConfig): number {
        const windowFrames = slimeConfig.assist.yawOscillationWindowFrames;
        const threshold = slimeConfig.assist.yawOscillationSignFlipsThreshold;
        const boost = slimeConfig.assist.yawDampingBoostFactor;
        if (windowFrames <= 0 || threshold <= 0 || boost <= 1) return yawCmd;

        const sign = yawCmd === 0 ? 0 : Math.sign(yawCmd);
        if (sign === 0) return yawCmd;

        const history = player.yawSignHistory;
        history.push(sign);
        if (history.length > windowFrames) {
            history.splice(0, history.length - windowFrames);
        }

        let flips = 0;
        let lastSign = 0;
        for (const s of history) {
            if (s === 0) continue;
            if (lastSign !== 0 && s !== lastSign) {
                flips += 1;
            }
            lastSign = s;
        }

        if (flips >= threshold) {
            return yawCmd / boost;
        }

        return yawCmd;
    }

    private getSlimeConfig(player: Player): SlimeConfig {
        switch (player.classId) {
            case 1:
                return this.balance.slimeConfigs.warrior;
            case 2:
                return this.balance.slimeConfigs.collector;
            case 0:
                return this.balance.slimeConfigs.hunter;
            default:
                return this.balance.slimeConfigs.base;
        }
    }

    private getSlimeInertiaForPlayer(player: Player, config: SlimeConfig, classStats: ClassStats): number {
        const baseInertia = getSlimeInertia(player.mass, config);
        const radiusMult = Math.max(classStats.radiusMult, 0.01);
        const inertia = baseInertia * radiusMult * radiusMult;
        return Math.max(inertia, 1e-6);
    }

    /**
     * Изменяет массу игрока на delta.
     * 
     * ИНВАРИАНТ: после применения delta, масса clamp'ится к [minSlimeMass, ∞).
     * Фактическое изменение массы может быть меньше delta, если игрок уже на минимуме.
     * Смерть обрабатывается отдельно при mass <= minSlimeMass в deathSystem().
     * 
     * @param player - игрок
     * @param delta - изменение массы (может быть отрицательным)
     */
    applyMassDelta(player: Player, delta: number) {
        if (!Number.isFinite(delta) || delta === 0) return;
        const minMass = this.balance.physics.minSlimeMass;
        const nextMass = Math.max(minMass, player.mass + delta);
        if (nextMass === player.mass) return;
        const oldMass = player.mass;
        player.mass = nextMass;

        // Проверяем изменение уровня при росте массы
        if (nextMass > oldMass) {
            this.updatePlayerLevel(player);
        }
    }
    
    /**
     * Обновляет уровень игрока по массе (GDD v3.3 5.1)
     * При достижении level 3/5 открываются слоты 2/3 и показывается карточка выбора умения
     * При достижении level 2/4/6/7+ показывается карточка выбора таланта
     */
    private updatePlayerLevel(player: Player) {
        updatePlayerLevelModule(this, player);
    }
    
    /**
     * Пытается сгенерировать следующую карточку из очереди
     */
    tryGenerateNextCard(player: Player) {
        if (player.pendingAbilityCard !== null) return;
        if (player.pendingCardSlots.length === 0) return;
        
        const nextSlot = player.pendingCardSlots.shift()!;
        player.pendingCardCount = player.pendingCardSlots.length;
        this.generateAbilityCard(player, nextSlot);
    }
    
    /**
     * Генерирует карточку выбора умения для слота (GDD v3.3 1.3)
     */
    private generateAbilityCard(player: Player, slotIndex: number) {
        // Уже есть активная карточка - не генерируем новую
        if (player.pendingAbilityCard !== null) return;
        
        const pool = this.balance.slime.abilityPool;
        const usedAbilities = new Set([player.abilitySlot0, player.abilitySlot1, player.abilitySlot2]);
        
        // Фильтруем доступные умения (которых ещё нет у игрока)
        const available = pool.filter((ab: string) => !usedAbilities.has(ab));
        const shuffled = [...available];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(this.rng.next() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        
        const { AbilityCard } = require("./schema/GameState");
        const card = new AbilityCard();
        card.slotIndex = slotIndex;
        card.option0 = shuffled[0] || "";
        card.option1 = shuffled[1] || "";
        card.option2 = shuffled[2] || "";
        card.expiresAtTick = this.tick + this.secondsToTicks(this.balance.slime.cardChoiceTimeoutSec);
        
        player.pendingAbilityCard = card;
    }
    
    /**
     * Система обработки карточек умений
     */
    private abilityCardSystem() {
        abilityCardSystem(this);
    }
    
    /**
     * Применяет выбор из карточки умений
     */
    private applyAbilityCardChoice(player: Player, choiceIndex: number) {
        const card = player.pendingAbilityCard;
        if (!card) return;
        
        const options = [card.option0, card.option1, card.option2];
        const chosen = options[choiceIndex] || options[0] || "";
        
        if (!chosen) {
            player.pendingAbilityCard = null;
            return;
        }
        
        // Присваиваем умение в соответствующий слот
        if (card.slotIndex === 1) {
            player.abilitySlot1 = chosen;
            player.abilityLevel1 = chosen ? 1 : 0;
        } else if (card.slotIndex === 2) {
            player.abilitySlot2 = chosen;
            player.abilityLevel2 = chosen ? 1 : 0;
        }
        
        player.pendingAbilityCard = null;
        
        // Генерируем следующую карточку из очереди (если есть)
        this.tryGenerateNextCard(player);
    }
    
    /**
     * Система обработки карточек талантов (GDD-Talents.md)
     */
    private talentCardSystem() {
        talentCardSystem(this);
    }
    
    /**
     * Применяет выбор таланта и пересчитывает модификаторы
     */
    private applyTalentCardChoice(player: Player, choiceIndex: number) {
        const card = player.pendingTalentCard;
        if (!card) return;
        
        const options = [card.option0, card.option1, card.option2];
        const chosen = options[choiceIndex] || options[0] || "";
        
        if (!chosen) {
            player.pendingTalentCard = null;
            return;
        }

        const upgrade = parseAbilityUpgradeIdModule(chosen);
        if (upgrade) {
            this.applyAbilityUpgrade(player, upgrade.abilityId, upgrade.level);
        } else {
            // Добавляем или повышаем уровень таланта
            this.addTalentToPlayer(player, chosen);
        }
        
        player.pendingTalentCard = null;
        
        // Генерируем следующую карточку талантов из очереди (если есть)
        this.tryGenerateNextTalentCard(player);
    }
    
    /**
     * Добавляет талант игроку или повышает уровень существующего
     */
    private addTalentToPlayer(player: Player, talentId: string) {
        // Найдём существующий талант
        let existingTalent: Talent | null = null;
        for (const t of player.talents) {
            if (t.id === talentId) {
                existingTalent = t;
                break;
            }
        }
        
        // Получаем конфиг таланта
        const className = this.getClassName(player.classId);
        const talentConfig = getTalentConfigModule(talentId, this.getTalentBalanceConfig(), className);
        if (!talentConfig) return;
        const beforeLevel = existingTalent?.level ?? 0;
        
        if (existingTalent) {
            // Повышаем уровень если возможно
            if (existingTalent.level < talentConfig.maxLevel) {
                existingTalent.level += 1;
            }
        } else {
            // Добавляем новый талант
            const newTalent = new Talent();
            newTalent.id = talentId;
            newTalent.level = 1;
            player.talents.push(newTalent);
        }

        const afterLevel = existingTalent?.level ?? 1;
        if (afterLevel > beforeLevel) {
            this.logTelemetry("talent_chosen", { talentId, level: afterLevel }, player);
        }
        
        // Пересчитываем модификаторы
        this.recalculateTalentModifiers(player);
    }

    /**
     * Создаёт TalentBalanceConfig из текущего balance.talents
     */
    private getTalentBalanceConfig(): TalentBalanceConfig {
        const talents = this.balance.talents;
        return {
            common: talents.common,
            rare: talents.rare,
            epic: talents.epic,
            classTalents: talents.classTalents,
        };
    }

    /**
     * Определяет редкость таланта (0=common, 1=rare, 2=epic)
     */
    private getTalentRarity(talentId: string): number {
        const talents = this.balance.talents;
        if (talents.common[talentId]) return 0;
        if (talents.rare[talentId]) return 1;
        if (talents.epic[talentId]) return 2;
        for (const classPool of Object.values(talents.classTalents)) {
            const classTalent = classPool[talentId];
            if (classTalent) return classTalent.rarity === "epic" ? 2 : 1;
        }
        return 0;
    }
    
    /**
     * Пересчитывает все модификаторы игрока на основе его талантов.
     * Делегирует в модуль talent/TalentModifierCalculator.
     */
    private recalculateTalentModifiers(player: Player) {
        const balance = this.getTalentBalanceConfig();
        recalculateTalentModifiersModule(player, balance, this.getClassName.bind(this));
    }
    
    /**
     * Получает имя класса по classId
     */
    private getClassName(classId: number): string {
        if (classId === 0) return "hunter";
        if (classId === 1) return "warrior";
        if (classId === 2) return "collector";
        return "hunter";
    }

    private getAbilitySlotIndex(player: Player, abilityId: string): number {
        if (player.abilitySlot0 === abilityId) return 0;
        if (player.abilitySlot1 === abilityId) return 1;
        if (player.abilitySlot2 === abilityId) return 2;
        return -1;
    }

    private applyAbilityUpgrade(player: Player, abilityId: string, level: number): boolean {
        const slotIndex = this.getAbilitySlotIndex(player, abilityId);
        if (slotIndex < 0) return false;
        const currentLevel = this.getAbilityLevelForSlot(player, slotIndex);
        const targetLevel = Math.max(1, Math.min(3, Math.floor(level)));
        if (currentLevel <= 0) {
            // Неконсистентное состояние: улучшение не должно предлагаться без умения.
            return false;
        }
        if (targetLevel <= currentLevel) return false;
        this.setAbilityLevelForSlot(player, slotIndex, targetLevel);
        return true;
    }
    
    /**
     * Генерирует карточку выбора таланта для игрока (GDD v3.3 7.2-7.3).
     * Делегирует в модуль talent/TalentGenerator.
     */
    private generateTalentCard(player: Player) {
        const talentConfig: TalentGeneratorConfig = {
            cardChoiceTimeoutSec: this.balance.talents.cardChoiceTimeoutSec,
            talentRarityByLevel: this.balance.talents.talentRarityByLevel,
            talentPool: this.balance.talents.talentPool,
            abilityUpgradeChance: this.balance.talents.abilityUpgradeChance,
        };

        const deps: TalentGeneratorDeps = {
            rng: this.rng,
            currentTick: this.tick,
            secondsToTicks: this.secondsToTicks.bind(this),
            getClassName: this.getClassName.bind(this),
            getAbilityLevelForSlot: this.getAbilityLevelForSlot.bind(this),
            clamp: this.clamp.bind(this),
        };

        generateTalentCardModule(player, talentConfig, this.getTalentBalanceConfig(), deps);
    }
    
    /**
     * Пытается сгенерировать следующую карточку таланта из очереди
     */
    private tryGenerateNextTalentCard(player: Player) {
        if (player.pendingTalentQueue.length > 0 && !player.pendingTalentCard) {
            player.pendingTalentQueue.shift();
            this.generateTalentCard(player);
        }
        player.pendingTalentCount = player.pendingTalentQueue.length;
    }
    
    /**
     * Принудительный автовыбор таланта при переполнении очереди (GDD 7.4)
     * Использует приоритеты класса для выбора лучшего варианта
     */
    private forceAutoPickTalent(player: Player) {
        const card = player.pendingTalentCard;
        if (!card) return;
        
        const talents = this.balance.talents;
        const className = this.getClassName(player.classId);
        const priorities = talents.autoPickPriorities[className] || [];
        
        const options = [card.option0, card.option1, card.option2];
        let bestIndex = 0;
        let bestScore = -1;
        let hasTalentOption = false;
        
        // Ищем талант с наивысшим приоритетом по категории (больше число = выше приоритет)
        for (let i = 0; i < options.length; i++) {
            const talentId = options[i];
            if (!talentId) continue;

            if (parseAbilityUpgradeIdModule(talentId)) {
                continue;
            }
            
            // Получаем категорию таланта
            const talentConfig = getTalentConfigModule(talentId, this.getTalentBalanceConfig(), className);
            if (!talentConfig) continue;
            
            hasTalentOption = true;
            const category = talentConfig.category || "other";
            const score = priorities[category] || 0;
            
            if (score > bestScore) {
                bestScore = score;
                bestIndex = i;
            }
        }

        if (!hasTalentOption) {
            const fallbackIndex = options.findIndex((value) => !!value);
            if (fallbackIndex >= 0) {
                bestIndex = fallbackIndex;
            }
        }
        
        // Применяем выбор
        this.applyTalentCardChoice(player, bestIndex);
    }
    
    /**
     * Выдаёт игроку талант (например, из сундука)
     */
    awardTalentToPlayer(player: Player) {
        const cardQueueMax = this.balance.talents.cardQueueMax || 3;
        
        // GDD 7.4: При переполнении очереди - принудительный автовыбор
        if (player.pendingTalentQueue.length >= cardQueueMax) {
            this.forceAutoPickTalent(player);
        }
        
        if (player.pendingTalentCard) {
            // Уже есть активная карточка - добавляем в очередь
            player.pendingTalentQueue.push(1);
            player.pendingTalentCount = player.pendingTalentQueue.length;
        } else {
            this.generateTalentCard(player);
        }
    }

    private clamp(value: number, min: number, max: number): number {
        return Math.max(min, Math.min(max, value));
    }

    secondsToTicks(seconds: number): number {
        if (!Number.isFinite(seconds) || seconds <= 0) return 0;
        return Math.max(1, Math.round(seconds * this.balance.server.tickRate));
    }

    private msToTicks(ms: number): number {
        if (!Number.isFinite(ms) || ms <= 0) return 0;
        const msPerTick = 1000 / this.balance.server.tickRate;
        return Math.max(1, Math.round(ms / msPerTick));
    }

    private randomPointInMap() {
        const world = this.balance.worldPhysics;
        if (world.worldShape === "circle") {
            const radius = world.radiusM ?? this.balance.world.mapSize / 2;
            const angle = this.rng.range(0, Math.PI * 2);
            const r = Math.sqrt(this.rng.next()) * radius;
            return {
                x: Math.cos(angle) * r,
                y: Math.sin(angle) * r,
            };
        }

        const width = world.widthM ?? this.balance.world.mapSize;
        const height = world.heightM ?? this.balance.world.mapSize;
        return {
            x: this.rng.range(-width / 2, width / 2),
            y: this.rng.range(-height / 2, height / 2),
        };
    }

    clampPointToWorld(x: number, y: number) {
        const world = this.balance.worldPhysics;
        if (world.worldShape === "circle") {
            const radius = world.radiusM ?? this.balance.world.mapSize / 2;
            const dist = Math.hypot(x, y);
            if (dist > radius && dist > 0) {
                const scale = radius / dist;
                return { x: x * scale, y: y * scale };
            }
            return { x, y };
        }

        const width = world.widthM ?? this.balance.world.mapSize;
        const height = world.heightM ?? this.balance.world.mapSize;
        return {
            x: this.clamp(x, -width / 2, width / 2),
            y: this.clamp(y, -height / 2, height / 2),
        };
    }

    private applyWorldBounds(entity: { x: number; y: number; vx: number; vy: number }, radius: number) {
        const world = this.balance.worldPhysics;
        const restitution = world.restitution;
        if (world.worldShape === "circle") {
            const limit = world.radiusM ?? this.balance.world.mapSize / 2;
            const dist = Math.hypot(entity.x, entity.y);
            if (dist + radius > limit) {
                const nx = dist > 1e-6 ? entity.x / dist : 1;
                const ny = dist > 1e-6 ? entity.y / dist : 0;
                entity.x = nx * (limit - radius);
                entity.y = ny * (limit - radius);
                const velAlongNormal = entity.vx * nx + entity.vy * ny;
                entity.vx -= (1 + restitution) * velAlongNormal * nx;
                entity.vy -= (1 + restitution) * velAlongNormal * ny;
            }
            return;
        }

        const width = world.widthM ?? this.balance.world.mapSize;
        const height = world.heightM ?? this.balance.world.mapSize;
        const halfW = width / 2;
        const halfH = height / 2;
        if (entity.x - radius < -halfW) {
            entity.x = -halfW + radius;
            entity.vx = Math.abs(entity.vx) * restitution;
        } else if (entity.x + radius > halfW) {
            entity.x = halfW - radius;
            entity.vx = -Math.abs(entity.vx) * restitution;
        }
        if (entity.y - radius < -halfH) {
            entity.y = -halfH + radius;
            entity.vy = Math.abs(entity.vy) * restitution;
        } else if (entity.y + radius > halfH) {
            entity.y = halfH - radius;
            entity.vy = -Math.abs(entity.vy) * restitution;
        }
    }

    private applySpeedCap(entity: { vx: number; vy: number }, maxSpeed: number) {
        const speedSq = entity.vx * entity.vx + entity.vy * entity.vy;
        const maxSpeedSq = maxSpeed * maxSpeed;
        if (speedSq <= maxSpeedSq || maxSpeedSq <= 0) return;
        const speed = Math.sqrt(speedSq);
        const dampedSpeed = maxSpeed + (speed - maxSpeed) * (1 - this.balance.physics.speedDampingRate);
        const scale = dampedSpeed / speed;
        entity.vx *= scale;
        entity.vy *= scale;
    }

    private startMatchTelemetry() {
        if (!this.matchId) {
            this.initMatchId();
        }
        if (this.matchStartLogged) return;
        this.matchStartLogged = true;
        this.matchStartedAt = new Date().toISOString();
        this.logTelemetry("match_start", {
            mapSize: this.balance.world.mapSize,
            worldShape: this.balance.worldPhysics.worldShape,
            seed: this.seed,
        });
    }

    private initMatchId() {
        this.matchIndex += 1;
        // Generate UUID for matchId (required by match_results.match_id UUID PRIMARY KEY)
        this.matchId = randomUUID();
        // Codex P1: Синхронизируем с state для клиента (используется в /match-results/claim)
        if (this.state) {
            this.state.matchId = this.matchId;
        }
    }

    logTelemetry(event: string, data?: Record<string, unknown>, player?: Player) {
        if (!this.telemetry) return;
        this.telemetry.log({
            event,
            ts: Date.now(),
            tick: this.tick,
            matchId: this.matchId,
            roomId: this.roomId,
            phase: this.state.phase,
            playerId: player?.id,
            data,
        });
    }

    private reportMetrics(startMs: number) {
        const dt = Date.now() - startMs;
        this.metricsAccumulatorMs += dt;
        this.metricsTickCount += 1;
        if (dt > this.metricsMaxTickMs) {
            this.metricsMaxTickMs = dt;
        }
        
        // Предупреждаем, если тик стабильно приближается к исчерпанию бюджета (≈85%)
        const tickBudgetMs = this.balance.server.simulationIntervalMs;
        const warnThresholdMs = tickBudgetMs * 0.85;
        if (dt > warnThresholdMs) {
            console.warn(`[PERF] tick=${this.tick} took ${dt.toFixed(1)}ms (budget: ${tickBudgetMs.toFixed(1)}ms, warn ≥ ${warnThresholdMs.toFixed(1)}ms)`);
        }
        
        if (this.metricsTickCount >= this.metricsIntervalTicks) {
            const avg = this.metricsAccumulatorMs / this.metricsTickCount;
            // Сохраняем последние метрики для API мониторинга
            this.lastMetricsAvgMs = avg;
            this.lastMetricsMaxMs = this.metricsMaxTickMs;
            console.log(
                `tick=${this.tick} dt_avg=${avg.toFixed(2)}ms dt_max=${this.metricsMaxTickMs.toFixed(2)}ms players=${this.state.players.size} orbs=${this.state.orbs.size} chests=${this.state.chests.size}`
            );
            this.metricsAccumulatorMs = 0;
            this.metricsTickCount = 0;
            this.metricsMaxTickMs = 0;
        }
    }

    /**
     * Возвращает статистику комнаты для API мониторинга.
     * Вызывается через matchMaker.remoteRoomCall().
     */
    getRoomStats(): {
        roomId: string;
        playerCount: number;
        maxPlayers: number;
        state: string;
        phase: string;
        duration: number;
        tick: { avg: number; max: number };
    } {
        // Определяем состояние матча
        let matchState: string;
        const phase = this.state.phase;
        if (phase === "Spawn") {
            matchState = "spawning";
        } else if (phase === "Results") {
            matchState = "ending";
        } else {
            matchState = "playing";
        }

        // Длительность матча в секундах (от начала)
        const totalDuration = this.balance.match.durationSec;
        const duration = totalDuration - this.state.timeRemaining;

        return {
            roomId: this.roomId,
            playerCount: this.state.players.size,
            maxPlayers: this.maxClients,
            state: matchState,
            phase: phase,
            duration: Math.round(duration),
            tick: {
                avg: Math.round(this.lastMetricsAvgMs * 100) / 100,
                max: Math.round(this.lastMetricsMaxMs * 100) / 100,
            },
        };
    }

    /**
     * Устанавливает время перезагрузки сервера.
     * Вызывается через matchMaker.remoteRoomCall() из MatchServer internal API.
     * @param shutdownAtMs — Unix timestamp (ms) когда сервер будет перезагружен
     */
    setShutdownAt(shutdownAtMs: number) {
        this.state.shutdownAt = shutdownAtMs;
    }
}
