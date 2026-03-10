import {
    FLAG_DASHING,
    computeFlightAssist,
    integratePhysics,
} from "@bonk-race/shared";
import type {
    ISlimePhysicsState,
    ISlimeModifiers,
    IExternalMultipliers,
    IWorldPhysicsParams,
} from "@bonk-race/shared";
import { DEFAULT_SURFACE_PARAMS, DEFAULT_SURFACE_ASSIST_PARAMS } from "@bonk-race/shared";

export function flightAssistSystem(room: any) {
    const dt = 1 / room.balance.server.tickRate;
    const worldPhysics: IWorldPhysicsParams = {
        angularDragK: room.balance.worldPhysics.angularDragK,
    };

    for (const player of room.state.players.values()) {
        if (player.isDead) {
            player.assistFx = 0;
            player.assistFy = 0;
            player.assistTorque = 0;
            continue;
        }

        const slimeConfig = room.getSlimeConfig(player);
        const classStats = room.getClassStats(player);
        const mass = Math.max(player.mass, room.balance.physics.minSlimeMass);
        const inertia = room.getSlimeInertiaForPlayer(player, slimeConfig, classStats);

        // Adapt Colyseus state → plain interface
        const state: ISlimePhysicsState = {
            x: player.x,
            y: player.y,
            vx: player.vx,
            vy: player.vy,
            angle: player.angle,
            angVel: player.angVel,
            mass,
            inputX: player.inputX,
            inputY: player.inputY,
            isDead: player.isDead,
            isLastBreath: player.isLastBreath,
            slowPct: player.slowPct,
            yawSignHistory: player.yawSignHistory,
        };

        const modifiers: ISlimeModifiers = {
            thrustForwardBonus: player.mod_thrustForwardBonus,
            thrustReverseBonus: player.mod_thrustReverseBonus,
            thrustLateralBonus: player.mod_thrustLateralBonus,
            turnBonus: player.mod_turnBonus,
            speedLimitBonus: player.mod_speedLimitBonus,
            lightningSpeedBonus: player.mod_lightningSpeedBonus,
        };

        const external: IExternalMultipliers = {
            hasteSpeedMultiplier: room.getHasteSpeedMultiplier(player),
            lastBreathSpeedPenalty: room.balance.combat.lastBreathSpeedPenalty,
        };

        const surfaceAssist = room.getSurfaceAssistParams?.(player) ?? DEFAULT_SURFACE_ASSIST_PARAMS;
        const result = computeFlightAssist(
            state, slimeConfig, inertia, modifiers, external, worldPhysics,
            surfaceAssist, dt,
        );

        player.assistFx = result.assistFx;
        player.assistFy = result.assistFy;
        player.assistTorque = result.assistTorque;
    }
}

export function physicsSystem(room: any) {
    const dt = 1 / room.balance.server.tickRate;
    const world = room.balance.worldPhysics;

    for (const player of room.state.players.values()) {
        if (player.isDead) continue;

        // Dash movement: linear interpolation to target
        if ((player.flags & FLAG_DASHING) !== 0 && player.dashEndTick > 0) {
            const dashLevel = room.getAbilityLevelForAbility(player, "dash") || 1;
            const dashConfig = room.getAbilityConfigById("dash", dashLevel);
            const dashDurationTicks = Math.round(dashConfig.durationSec * room.balance.server.tickRate);
            const ticksRemaining = player.dashEndTick - room.tick;
            const progress = 1 - ticksRemaining / dashDurationTicks;

            const startX = player.dashTargetX - Math.cos(player.angle) * dashConfig.distanceM;
            const startY = player.dashTargetY - Math.sin(player.angle) * dashConfig.distanceM;
            player.x = startX + (player.dashTargetX - startX) * progress;
            player.y = startY + (player.dashTargetY - startY) * progress;

            const dashSpeed = dashConfig.distanceM / dashConfig.durationSec;
            player.vx = Math.cos(player.angle) * dashSpeed;
            player.vy = Math.sin(player.angle) * dashSpeed;
            continue;
        }

        const slimeConfig = room.getSlimeConfig(player);
        const classStats = room.getClassStats(player);
        const mass = Math.max(player.mass, room.balance.physics.minSlimeMass);
        const inertia = room.getSlimeInertiaForPlayer(player, slimeConfig, classStats);
        const surface = room.getSurfaceParams?.(player) ?? DEFAULT_SURFACE_PARAMS;

        const result = integratePhysics(
            { x: player.x, y: player.y, vx: player.vx, vy: player.vy, angle: player.angle, angVel: player.angVel },
            { assistFx: player.assistFx, assistFy: player.assistFy, assistTorque: player.assistTorque },
            mass,
            inertia,
            slimeConfig,
            { forwardDragK: world.forwardDragK, lateralGripMultiplier: world.lateralGripMultiplier, angularDragK: world.angularDragK },
            surface,
            player.isLastBreath,
            room.balance.combat.lastBreathSpeedPenalty,
            dt,
        );

        player.x = result.x;
        player.y = result.y;
        player.vx = result.vx;
        player.vy = result.vy;
        player.angle = result.angle;
        player.angVel = result.angVel;
    }
}
