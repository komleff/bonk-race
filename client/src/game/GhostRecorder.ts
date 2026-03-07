import type { GhostFrame, GhostReplay } from "@bonk-race/shared";

/**
 * Records player position each physics tick for ghost replay (GDD §5).
 * After finish, getReplay() returns the packed data to submit to server.
 */
export class GhostRecorder {
    private frames: GhostFrame[] = [];
    private recording = false;

    start(): void {
        this.frames = [];
        this.recording = true;
    }

    /** Record a single frame. Call once per physics tick. */
    record(tick: number, posX: number, posY: number, angle: number): void {
        if (!this.recording) return;
        this.frames.push({ tick, posX, posY, angle });
    }

    stop(): void {
        this.recording = false;
    }

    isRecording(): boolean {
        return this.recording;
    }

    getReplay(): GhostReplay {
        return this.frames;
    }

    /** Pack replay into a flat number array for transmission: [tick,x,y,angle,...] */
    getPackedReplay(): number[] {
        const packed: number[] = [];
        for (const f of this.frames) {
            packed.push(f.tick, f.posX, f.posY, f.angle);
        }
        return packed;
    }

    /** Unpack a flat number array back into GhostReplay */
    static unpack(data: number[]): GhostReplay {
        const frames: GhostFrame[] = [];
        for (let i = 0; i + 3 < data.length; i += 4) {
            frames.push({
                tick: data[i],
                posX: data[i + 1],
                posY: data[i + 2],
                angle: data[i + 3],
            });
        }
        return frames;
    }
}
