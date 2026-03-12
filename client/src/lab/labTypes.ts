/**
 * labTypes — общие типы для песочницы BonkLab.
 *
 * Извлечены из BonkLab.ts, чтобы рендереры и HUD могли импортировать
 * лёгкие типы без подключения всего модуля-оркестратора.
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
    /** Прогресс анимации гибели (0 = только что погиб, 1 = анимация завершена) */
    deathProgress: number;
}

// ─── SandboxState ────────────────────────────────────────────────────────────

export interface SandboxState {
    // Персонаж
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    angularVelocity: number;
    mass: number;
    radius: number;

    // Ввод
    inputX: number;
    inputY: number;
    inputMagnitude: number;

    // Выход FA (для визуализации)
    assistFx: number;
    assistFy: number;
    assistTorque: number;
    faState: "accel" | "brake" | "drift-correction" | "idle";

    // Вектор коррекции (для оранжевой стрелки)
    correctionFx: number;
    correctionFy: number;

    // Арена
    arena: Arena;

    // Орбы
    orbs: SandboxOrb[];

    // Время
    elapsedTime: number;

    // Текущая зона
    currentZone: string | null;

    // Прогресс
    distanceM: number;       // расстояние от спавна к финишу (метры)
    progressPct: number;     // 0..1 прогресс от спавна до финиша

    // Состояние смерти (удар шипом)
    deathTimer: number;
    deathX: number;
    deathY: number;
    deathDistanceM: number;  // расстояние в момент гибели (для сообщения)
    respawnCountdown: number; // таймер заморозки Go!-Go! после респауна
    startCountdown: number;   // таймер обратного отсчёта 3-2-1-Go!

    // Состояние финиша
    finished: boolean;
    finishTime: number;      // время прохождения при пересечении финиша
    bestTime: number;        // лучшее время за все попытки (0 = нет рекорда)
    isNewRecord: boolean;    // true если finishTime < предыдущего bestTime
}
