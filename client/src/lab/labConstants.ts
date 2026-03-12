// ─── Shared constants for BonkLab ───────────────────────────────────────────

/** Format seconds as time string. padMinutes: "01:23.4" vs "1:23.4" */
export function formatTime(seconds: number, padMinutes = false): string {
    const mins = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    const mm = padMinutes ? String(mins).padStart(2, "0") : String(mins);
    return `${mm}:${String(s).padStart(2, "0")}.${tenths}`;
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
