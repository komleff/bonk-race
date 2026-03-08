/**
 * Pure collision resolution functions — shared between server and client (BonkLab).
 * No Colyseus or framework dependencies.
 */

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface ICircleBody {
    x: number;
    y: number;
    vx: number;
    vy: number;
    radius: number;
    mass: number;
    restitution?: number;
}

export interface IStaticObstacle {
    x: number;
    y: number;
    radius: number;
    type: "pillar" | "spike" | "wall";
}

export interface IWallBounds {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
}

export interface ICircleBounds {
    centerX: number;
    centerY: number;
    radius: number;
}

export interface ICollisionConfig {
    /** Positional correction percentage (Baumgarte stabilization). Default 0.8 */
    correctionPercent: number;
    /** Penetration slop threshold. Default 0.001 */
    slop: number;
    /** Maximum positional correction per step. Default Infinity (no cap) */
    maxCorrection: number;
}

const DEFAULT_CONFIG: ICollisionConfig = {
    correctionPercent: 0.8,
    slop: 0.001,
    maxCorrection: Infinity,
};

// ─── Circle–Circle collision ────────────────────────────────────────────────

/**
 * Resolves impulse-based collision between two dynamic circle bodies.
 * Mutates a and b in-place (positions + velocities).
 * Returns true if a collision was detected and resolved.
 */
export function resolveCircleCircleCollision(
    a: ICircleBody,
    b: ICircleBody,
    restitution: number,
    config: ICollisionConfig = DEFAULT_CONFIG,
): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const minDist = a.radius + b.radius;
    const distSq = dx * dx + dy * dy;
    if (distSq >= minDist * minDist) return false;

    const dist = Math.sqrt(distSq);
    const nx = dist > 0 ? dx / dist : 1;
    const ny = dist > 0 ? dy / dist : 0;
    const penetration = minDist - (dist || 0);

    const invMass1 = a.mass > 0 ? 1 / a.mass : 0;
    const invMass2 = b.mass > 0 ? 1 / b.mass : 0;
    const invMassSum = invMass1 + invMass2;

    if (invMassSum <= 0) return true;

    // Positional correction (Baumgarte stabilization)
    const corrRaw = (Math.max(penetration - config.slop, 0) / invMassSum) * config.correctionPercent;
    const corrMag = Math.min(corrRaw, config.maxCorrection);
    const corrX = nx * corrMag;
    const corrY = ny * corrMag;
    a.x -= corrX * invMass1;
    a.y -= corrY * invMass1;
    b.x += corrX * invMass2;
    b.y += corrY * invMass2;

    // Impulse resolution (conservation of momentum)
    const rvx = b.vx - a.vx;
    const rvy = b.vy - a.vy;
    const velAlongNormal = rvx * nx + rvy * ny;
    if (velAlongNormal <= 0) {
        const jImpulse = (-(1 + restitution) * velAlongNormal) / invMassSum;
        const impulseX = nx * jImpulse;
        const impulseY = ny * jImpulse;
        a.vx -= impulseX * invMass1;
        a.vy -= impulseY * invMass1;
        b.vx += impulseX * invMass2;
        b.vy += impulseY * invMass2;
    }

    return true;
}

// ─── Circle–Static obstacle collision ───────────────────────────────────────

/**
 * Resolves collision between a dynamic circle body and a static circular obstacle.
 * The obstacle is treated as infinitely massive (does not move).
 * Mutates body in-place. Returns true if collision occurred.
 */
export function resolveCircleStaticCollision(
    body: ICircleBody,
    obstacle: IStaticObstacle,
    restitution: number,
    config: ICollisionConfig = DEFAULT_CONFIG,
): boolean {
    const dx = body.x - obstacle.x;
    const dy = body.y - obstacle.y;
    const minDist = body.radius + obstacle.radius;
    const distSq = dx * dx + dy * dy;
    if (distSq >= minDist * minDist) return false;

    const dist = Math.sqrt(distSq);
    const nx = dist > 0 ? dx / dist : 1;
    const ny = dist > 0 ? dy / dist : 0;
    const penetration = minDist - (dist || 0);

    // Positional correction — obstacle has infinite mass, so full correction goes to body
    const corrRaw = Math.max(penetration - config.slop, 0);
    const corrMag = Math.min(corrRaw, config.maxCorrection);
    body.x += nx * corrMag;
    body.y += ny * corrMag;

    // Impulse — reflect velocity along normal
    const velAlongNormal = body.vx * nx + body.vy * ny;
    if (velAlongNormal < 0) {
        const impulse = (1 + restitution) * velAlongNormal;
        body.vx -= impulse * nx;
        body.vy -= impulse * ny;
    }

    return true;
}

// ─── Rectangular wall collision ─────────────────────────────────────────────

/**
 * Resolves collision between a dynamic circle body and axis-aligned rectangular walls.
 * Mutates body in-place. Returns true if any wall was hit.
 */
export function resolveWallCollision(
    body: ICircleBody,
    wallBounds: IWallBounds,
    restitution: number,
): boolean {
    let hit = false;

    if (body.x - body.radius < wallBounds.minX) {
        body.x = wallBounds.minX + body.radius;
        body.vx = Math.abs(body.vx) * restitution;
        hit = true;
    } else if (body.x + body.radius > wallBounds.maxX) {
        body.x = wallBounds.maxX - body.radius;
        body.vx = -Math.abs(body.vx) * restitution;
        hit = true;
    }

    if (body.y - body.radius < wallBounds.minY) {
        body.y = wallBounds.minY + body.radius;
        body.vy = Math.abs(body.vy) * restitution;
        hit = true;
    } else if (body.y + body.radius > wallBounds.maxY) {
        body.y = wallBounds.maxY - body.radius;
        body.vy = -Math.abs(body.vy) * restitution;
        hit = true;
    }

    return hit;
}

// ─── Circular world boundary collision ──────────────────────────────────────

/**
 * Resolves collision between a dynamic circle body and a circular world boundary.
 * The body is pushed inward if it exceeds the boundary.
 * Mutates body in-place. Returns true if boundary was hit.
 */
export function resolveCircleBoundaryCollision(
    body: ICircleBody,
    bounds: ICircleBounds,
    restitution: number,
): boolean {
    const dx = body.x - bounds.centerX;
    const dy = body.y - bounds.centerY;
    const dist = Math.hypot(dx, dy);
    if (dist + body.radius <= bounds.radius) return false;

    const nx = dist > 1e-6 ? dx / dist : 1;
    const ny = dist > 1e-6 ? dy / dist : 0;
    body.x = bounds.centerX + nx * (bounds.radius - body.radius);
    body.y = bounds.centerY + ny * (bounds.radius - body.radius);

    const velAlongNormal = body.vx * nx + body.vy * ny;
    body.vx -= (1 + restitution) * velAlongNormal * nx;
    body.vy -= (1 + restitution) * velAlongNormal * ny;

    return true;
}
