/**
 * labTypes — shared type definitions for BonkLab sandbox.
 *
 * Extracted from BonkLab.ts so that renderers and HUDs can import
 * lightweight types without pulling in the full orchestrator module.
 */

import type { Arena } from "@bonk-race/shared";

// ─── SandboxOrb ──────────────────────────────────────────────────────────────

export interface SandboxOrb {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    mass: number;
    alive: boolean;
    /** Death animation progress (0 = just died, 1 = animation done) */
    deathProgress: number;
}

// ─── SandboxState ────────────────────────────────────────────────────────────

export interface SandboxState {
    // Character
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    angularVelocity: number;
    mass: number;
    radius: number;

    // Input
    inputX: number;
    inputY: number;
    inputMagnitude: number;

    // FA output (for visualization)
    assistFx: number;
    assistFy: number;
    assistTorque: number;
    faState: "accel" | "brake" | "drift-correction" | "idle";

    // Correction vector (for orange arrow)
    correctionFx: number;
    correctionFy: number;

    // Arena
    arena: Arena;

    // Orbs
    orbs: SandboxOrb[];

    // Timing
    elapsedTime: number;

    // Current zone
    currentZone: string | null;

    // Progress
    distanceM: number;       // distance from spawn toward finish (metres)
    progressPct: number;     // 0..1 progress from spawn to finish

    // Death state (spike hit)
    deathTimer: number;
    deathX: number;
    deathY: number;
    deathDistanceM: number;  // distance at moment of death (for death message)
    respawnCountdown: number; // таймер заморозки Go!-Go! после респауна
    startCountdown: number;   // pre-race 3-2-1-Go! countdown timer

    // Finish state
    finished: boolean;
    finishTime: number;      // elapsed time when crossed finish
    bestTime: number;        // best time across runs (0 = no record yet)
    isNewRecord: boolean;    // true if finishTime < previous bestTime
}
