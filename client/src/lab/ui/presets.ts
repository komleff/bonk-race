// ─── Presets ──────────────────────────────────────────────────────────────────

export interface Preset {
    label: string;
    values: Record<string, number | boolean | string>;
}

export const PRESETS: Preset[] = [
    {
        label: "Ультралёгкий",
        values: {
            "mass": 20,
            "geometry.inertiaFactor": 0.05,
            "propulsion.thrustForwardN": 80000,
            "propulsion.thrustReverseN": 25000,
            "propulsion.thrustLateralN": 30000,
            "propulsion.turnTorqueNm": 60000,
            "limits.speedLimitForwardMps": 500,
            "worldPhysics.forwardDragK": 0.001,
            "worldPhysics.lateralGripMultiplier": 20.0,
        },
    },
    {
        label: "Slime Arena",
        values: {}, // empty = reset to defaults (grip=1.0, isotropic)
    },
    {
        label: "BonkRace v0.1",
        values: {
            "mass": 40,
            "geometry.inertiaFactor": 0.50,
            "propulsion.thrustForwardN": 50000,
            "propulsion.thrustReverseN": 18000,
            "propulsion.thrustLateralN": 22000,
            "propulsion.turnTorqueNm": 40000,
            "limits.speedLimitForwardMps": 400,
            "worldPhysics.forwardDragK": 0.005,
            "worldPhysics.lateralGripMultiplier": 1.0,
        },
    },
    {
        // Казуальные аркадные гонки: мгновенный поворот, лёгкая масса, высокая тяга.
        // Блоб-гонки: стрейфы разрешены (слаймы не машины!), но слабее основной тяги.
        // Grip 25 — цепкий на низкой скорости, лёгкий дрифт на высокой.
        label: "BonkRace v0.3",
        values: {
            "mass": 40,
            "geometry.inertiaFactor": 0.05,
            "propulsion.thrustForwardN": 70000,
            "propulsion.thrustReverseN": 30000,
            "propulsion.thrustLateralN": 25000,
            "propulsion.turnTorqueNm": 80000,
            "limits.speedLimitForwardMps": 380,
            "worldPhysics.forwardDragK": 0.05,
            "worldPhysics.lateralGripMultiplier": 25.0,
            "worldPhysics.angularDragK": 0.15,
            "worldPhysics.restitution": 0.80,
            "trail.enabled": true,
            "trail.maxAge": 1.0,
            "trail.baseAlpha": 0.6,
            "trail.pattern": "drift",
            "trail.primaryColor": "#44aaff",
            "trail.driftColor": "#ffff00",
            "trail.rainbowPeriodSec": 2.0,
        },
    },
    {
        label: "Грузовик",
        values: {
            "mass": 350,
            "geometry.inertiaFactor": 0.80,
            "propulsion.thrustForwardN": 15000,
            "propulsion.thrustReverseN": 5000,
            "propulsion.thrustLateralN": 0,
            "propulsion.turnTorqueNm": 12000,
            "limits.speedLimitForwardMps": 280,
            "worldPhysics.forwardDragK": 0.04,
            "worldPhysics.lateralGripMultiplier": 12.0,
            "worldPhysics.angularDragK": 0.12,
        },
    },
    {
        label: "Дрифт (без FA)",
        values: {
            "mass": 80,
            "geometry.inertiaFactor": 0.30,
            "propulsion.thrustForwardN": 60000,
            "propulsion.thrustLateralN": 0,
            "propulsion.turnTorqueNm": 50000,
            "worldPhysics.forwardDragK": 0.03,
            "worldPhysics.lateralGripMultiplier": 6.0,
            "assist.counterAccelEnabled": false,
            "assist.autoBrakeMaxThrustFraction": 0.1,
            "assist.overspeedDampingRate": 0,
            "assist.yawDampingBoostFactor": 1,
            "assist.angularBrakeBoostFactor": 1,
        },
    },
    {
        // Elite Dangerous FA-On: вакуум (нулевое трение), но Flight Assist активен —
        // автоторможение двигателями, стабилизация вращения. Латеральные RCS-двигатели.
        // Нет среды → drag=0, grip=0. FA компенсирует через assist (counterAccel, autoBrake).
        label: "Космос (FA-On)",
        values: {
            "mass": 150,
            "geometry.inertiaFactor": 0.60,
            "propulsion.thrustForwardN": 50000,
            "propulsion.thrustReverseN": 20000,
            "propulsion.thrustLateralN": 15000,
            "propulsion.turnTorqueNm": 30000,
            "limits.speedLimitForwardMps": 500,
            "worldPhysics.forwardDragK": 0,
            "worldPhysics.lateralGripMultiplier": 0,
            "worldPhysics.angularDragK": 0,
            "worldPhysics.restitution": 0.3,
        },
    },
    {
        // Elite Dangerous FA-Off: полный Ньютон. Нет автоторможения, нет стабилизации.
        // Корабль сохраняет скорость и вращение до ручной коррекции.
        // Небольшой angularDrag=0.05 имитирует демпфирование reaction wheels.
        label: "Космос (FA-Off)",
        values: {
            "mass": 150,
            "geometry.inertiaFactor": 0.60,
            "propulsion.thrustForwardN": 50000,
            "propulsion.thrustReverseN": 20000,
            "propulsion.thrustLateralN": 15000,
            "propulsion.turnTorqueNm": 30000,
            "limits.speedLimitForwardMps": 500,
            "worldPhysics.forwardDragK": 0,
            "worldPhysics.lateralGripMultiplier": 0,
            "worldPhysics.angularDragK": 0.05,
            "worldPhysics.restitution": 0.3,
            "assist.counterAccelEnabled": false,
            "assist.autoBrakeMaxThrustFraction": 0,
            "assist.overspeedDampingRate": 0,
        },
    },
    {
        label: "Ралли",
        values: {
            "mass": 120,
            "geometry.inertiaFactor": 0.40,
            "propulsion.thrustForwardN": 55000,
            "propulsion.thrustLateralN": 0,
            "propulsion.turnTorqueNm": 45000,
            "limits.speedLimitForwardMps": 350,
            "worldPhysics.forwardDragK": 0.06,
            "worldPhysics.lateralGripMultiplier": 30.0,
            "worldPhysics.angularDragK": 0.10,
            "worldPhysics.restitution": 0.8,
        },
    },
    {
        label: "Бампер-кар",
        values: {
            "mass": 100,
            "geometry.inertiaFactor": 0.50,
            "propulsion.thrustForwardN": 45000,
            "propulsion.thrustLateralN": 5000,
            "propulsion.turnTorqueNm": 35000,
            "limits.speedLimitForwardMps": 300,
            "worldPhysics.forwardDragK": 0.07,
            "worldPhysics.lateralGripMultiplier": 54.0,
            "worldPhysics.angularDragK": 0.08,
            "worldPhysics.restitution": 0.95,
        },
    },
    {
        label: "Картинг",
        values: {
            "mass": 80,
            "geometry.inertiaFactor": 0.20,
            "propulsion.thrustForwardN": 50000,
            "propulsion.thrustLateralN": 0,
            "propulsion.turnTorqueNm": 50000,
            "limits.speedLimitForwardMps": 400,
            "worldPhysics.forwardDragK": 0.08,
            "worldPhysics.lateralGripMultiplier": 40.0,
            "worldPhysics.angularDragK": 0.15,
            "worldPhysics.restitution": 0.7,
        },
    },
    {
        label: "Формула",
        values: {
            "mass": 60,
            "geometry.inertiaFactor": 0.30,
            "propulsion.thrustForwardN": 65000,
            "propulsion.thrustLateralN": 0,
            "propulsion.turnTorqueNm": 60000,
            "limits.speedLimitForwardMps": 450,
            "worldPhysics.forwardDragK": 0.12,
            "worldPhysics.lateralGripMultiplier": 80.0,
            "worldPhysics.angularDragK": 0.20,
            "worldPhysics.restitution": 0.6,
        },
    },
];

export const DEFAULT_PRESET_IDX = 3;
