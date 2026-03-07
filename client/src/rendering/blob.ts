/**
 * Blob renderer for BonkRace (GDD §1.1).
 * Top-down view: circular blob with a face on the side (face points in movement direction).
 */

export interface BlobRenderOptions {
    x: number;
    y: number;
    radius: number;
    angle: number;          // radians, direction of movement
    color: string;
    opacity?: number;       // 0-1, for ghost rendering
    nickname?: string;
    isShielded?: boolean;
}

const EYE_OFFSET_RATIO = 0.3;
const EYE_RADIUS_RATIO = 0.15;
const PUPIL_RADIUS_RATIO = 0.08;

export function drawBlob(
    ctx: CanvasRenderingContext2D,
    opts: BlobRenderOptions,
): void {
    const { x, y, radius, angle, color, opacity = 1, nickname, isShielded } = opts;

    ctx.save();
    ctx.globalAlpha = opacity;

    // ─── Body circle ─────────────────────────────────────────────────────
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    // Shield glow
    if (isShielded) {
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0, 200, 255, 0.7)";
        ctx.stroke();
    }

    // ─── Face (eyes on the side facing movement direction) ───────────────
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const eyeOff = radius * EYE_OFFSET_RATIO;
    const eyeR = radius * EYE_RADIUS_RATIO;
    const pupilR = radius * PUPIL_RADIUS_RATIO;
    const faceX = radius * 0.5; // face is on the "front" side

    // Left eye
    ctx.beginPath();
    ctx.arc(faceX, -eyeOff, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(faceX + pupilR * 0.3, -eyeOff, pupilR, 0, Math.PI * 2);
    ctx.fillStyle = "#111111";
    ctx.fill();

    // Right eye
    ctx.beginPath();
    ctx.arc(faceX, eyeOff, eyeR, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(faceX + pupilR * 0.3, eyeOff, pupilR, 0, Math.PI * 2);
    ctx.fillStyle = "#111111";
    ctx.fill();

    ctx.restore();

    // ─── Nickname label ──────────────────────────────────────────────────
    if (nickname) {
        ctx.font = `${Math.max(10, radius * 0.7)}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.9})`;
        ctx.fillText(nickname, x, y - radius - 4);
    }

    ctx.restore();
}
