import { MatchPhaseId } from "@bonk-race/shared";

export function hungerSystem(room: any) {
    const phase = room.state.phase as MatchPhaseId;
    // GDD v3.3: Hunger активен в Hunt и Final
    if (phase !== "Hunt" && phase !== "Final") return;
    if (room.isSafeZoneActive() && room.state.safeZones.length > 0) return;
    if (room.state.hotZones.size === 0) return;

    const dt = 1 / room.balance.server.tickRate;
    for (const player of room.state.players.values()) {
        if (player.isDead) continue;
        const inHotZone = room.isInsideHotZone(player);
        if (inHotZone) continue;

        const drainPerSec = Math.min(
            room.balance.hunger.maxDrainPerSec,
            room.balance.hunger.baseDrainPerSec + room.balance.hunger.scalingPerMass * (player.mass / 100)
        );
        const drain = drainPerSec * dt;
        const minMass = Math.max(room.balance.hunger.minMass, room.balance.physics.minSlimeMass);
        const targetMass = Math.max(minMass, player.mass - drain);
        room.applyMassDelta(player, targetMass - player.mass);
    }
}
