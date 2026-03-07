import type { GhostReplay } from "@bonk-race/shared";
import { lerp, wrapAngle } from "@bonk-race/shared";

/**
 * Plays back a ghost replay (GDD §5).
 * Interpolates between recorded frames for smooth rendering.
 * Ghosts have no collision — purely visual.
 */
export class GhostPlayer {
    private replay: GhostReplay;
    private frameIndex = 0;

    readonly nickname: string;
    readonly spriteId: string;
    readonly opacity: number;

    /** Current interpolated state */
    x = 0;
    y = 0;
    angle = 0;
    finished = false;

    constructor(
        replay: GhostReplay,
        nickname: string,
        spriteId: string,
        opacity = 0.4,
    ) {
        this.replay = replay;
        this.nickname = nickname;
        this.spriteId = spriteId;
        this.opacity = opacity;
    }

    /** Update ghost position for the given physics tick. */
    update(currentTick: number): void {
        if (this.replay.length === 0) {
            this.finished = true;
            return;
        }

        // Advance frame index to bracket currentTick
        while (
            this.frameIndex < this.replay.length - 1 &&
            this.replay[this.frameIndex + 1].tick <= currentTick
        ) {
            this.frameIndex++;
        }

        const curr = this.replay[this.frameIndex];
        const next = this.replay[this.frameIndex + 1];

        if (!next || curr.tick === next.tick) {
            // At or past the last frame
            this.x = curr.posX;
            this.y = curr.posY;
            this.angle = curr.angle;
            if (this.frameIndex >= this.replay.length - 1) {
                this.finished = true;
            }
            return;
        }

        // Interpolate between frames
        const t = (currentTick - curr.tick) / (next.tick - curr.tick);
        this.x = lerp(curr.posX, next.posX, t);
        this.y = lerp(curr.posY, next.posY, t);

        // Angle interpolation (shortest path)
        const diff = wrapAngle(next.angle - curr.angle);
        this.angle = curr.angle + diff * t;
    }

    /** Reset playback to the beginning. */
    reset(): void {
        this.frameIndex = 0;
        this.finished = false;
        this.x = 0;
        this.y = 0;
        this.angle = 0;
    }
}
