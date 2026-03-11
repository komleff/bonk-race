/**
 * Парсит hex-цвет (#RRGGBB) в { r, g, b }
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
    } : { r: 68, g: 170, b: 255 }; // запасное значение #44aaff
}

/**
 * Конвертирует { r, g, b } в hex-строку цвета
 */
function rgbToHex(r: number, g: number, b: number): string {
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * Интерполяция между двумя hex-цветами: c1 * (1 - t) + c2 * t
 */
export function lerpColor(c1: string, c2: string, t: number): string {
    const rgb1 = hexToRgb(c1);
    const rgb2 = hexToRgb(c2);
    const r = Math.round(rgb1.r * (1 - t) + rgb2.r * t);
    const g = Math.round(rgb1.g * (1 - t) + rgb2.g * t);
    const b = Math.round(rgb1.b * (1 - t) + rgb2.b * t);
    return rgbToHex(
        Math.max(0, Math.min(255, r)),
        Math.max(0, Math.min(255, g)),
        Math.max(0, Math.min(255, b)),
    );
}

/**
 * Конвертирует HSL в RGB, возвращает hex-цвет
 */
export function hslToHex(h: number, s: number, l: number): string {
    h = ((h % 360) + 360) % 360;
    s = Math.max(0, Math.min(1, s));
    l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    return rgbToHex(
        Math.round((r + m) * 255),
        Math.round((g + m) * 255),
        Math.round((b + m) * 255),
    );
}

/**
 * Нормализация угла в диапазон [-π, π]
 */
export function normalizeAngle(angle: number): number {
    let a = angle;
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
}

/**
 * Угол дрифта между вектором скорости и направлением
 */
export function getDriftAngle(vx: number, vy: number, heading: number): number {
    if (vx === 0 && vy === 0) return 0;
    const velAngle = Math.atan2(vy, vx);
    return normalizeAngle(velAngle - heading);
}
