// ─── Общие константы BonkLab ─────────────────────────────────────────────────

/** Форматирование секунд в строку времени. padMinutes: "01:23.4" vs "1:23.4" */
export function formatTime(seconds: number, padMinutes = false): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    const mm = padMinutes ? String(mins).padStart(2, "0") : String(mins);
    const ss = secs.toFixed(1).padStart(4, "0");
    return `${mm}:${ss}`;
}

export const ZONE_LABELS: Record<string, string> = {
    ice: "Лёд",
    mud: "Грязь",
    turbo: "Турбо",
    sand: "Песок",
};

export const FA_LABELS: Record<string, string> = {
    "accel": "Разгон",
    "brake": "Торможение",
    "drift-correction": "Дрейф-коррекция",
    "idle": "Холостой ход",
};
