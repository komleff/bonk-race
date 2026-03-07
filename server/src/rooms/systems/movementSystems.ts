import { FLAG_DASHING, scaleSlimeValue } from "@bonk-race/shared";

export function flightAssistSystem(room: any) {
    const dt = 1 / room.balance.server.tickRate;
    for (const player of room.state.players.values()) {
        if (player.isDead) {
            player.assistFx = 0;
            player.assistFy = 0;
            player.assistTorque = 0;
            continue;
        }

        const slimeConfig = room.getSlimeConfig(player);
        const classStats = room.getClassStats(player);
        const mass = Math.max(player.mass, room.balance.physics.minSlimeMass);
        const inertia = room.getSlimeInertiaForPlayer(player, slimeConfig, classStats);

        // Масштабируем параметры тяги по массе
        let thrustForward = scaleSlimeValue(
            slimeConfig.propulsion.thrustForwardN,
            mass,
            slimeConfig,
            slimeConfig.massScaling.thrustForwardN
        );
        let thrustReverse = scaleSlimeValue(
            slimeConfig.propulsion.thrustReverseN,
            mass,
            slimeConfig,
            slimeConfig.massScaling.thrustReverseN
        );
        let thrustLateral = scaleSlimeValue(
            slimeConfig.propulsion.thrustLateralN,
            mass,
            slimeConfig,
            slimeConfig.massScaling.thrustLateralN
        );
        const turnTorque = scaleSlimeValue(
            slimeConfig.propulsion.turnTorqueNm,
            mass,
            slimeConfig,
            slimeConfig.massScaling.turnTorqueNm
        );

        // Таланты: бонусы к тяге
        thrustForward *= 1 + player.mod_thrustForwardBonus;
        thrustReverse *= 1 + player.mod_thrustReverseBonus;
        thrustLateral *= 1 + player.mod_thrustLateralBonus;

        // Таланты: бонус к повороту
        const turnTorqueAdjusted = turnTorque * (1 + player.mod_turnBonus);

        // Масштабируем лимиты скорости по массе
        let speedLimitForward = scaleSlimeValue(
            slimeConfig.limits.speedLimitForwardMps,
            mass,
            slimeConfig,
            slimeConfig.massScaling.speedLimitForwardMps
        );
        let speedLimitReverse = scaleSlimeValue(
            slimeConfig.limits.speedLimitReverseMps,
            mass,
            slimeConfig,
            slimeConfig.massScaling.speedLimitReverseMps
        );
        let speedLimitLateral = scaleSlimeValue(
            slimeConfig.limits.speedLimitLateralMps,
            mass,
            slimeConfig,
            slimeConfig.massScaling.speedLimitLateralMps
        );
        const speedBonus = 1 + player.mod_speedLimitBonus + player.mod_lightningSpeedBonus;
        const hasteMultiplier = room.getHasteSpeedMultiplier(player);
        const zoneSpeedMultiplier = room.getZoneSpeedMultiplier(player);
        const totalSpeedMultiplier = speedBonus * hasteMultiplier * zoneSpeedMultiplier;
        speedLimitForward *= totalSpeedMultiplier;
        speedLimitReverse *= totalSpeedMultiplier;
        speedLimitLateral *= totalSpeedMultiplier;
        let angularLimit = scaleSlimeValue(
            slimeConfig.limits.angularSpeedLimitRadps,
            mass,
            slimeConfig,
            slimeConfig.massScaling.angularSpeedLimitRadps
        );

        // Штраф last-breath применяется ко всем лимитам
        if (player.isLastBreath) {
            const penalty = room.balance.combat.lastBreathSpeedPenalty;
            thrustForward *= penalty;
            thrustReverse *= penalty;
            thrustLateral *= penalty;
            speedLimitForward *= penalty;
            speedLimitReverse *= penalty;
            speedLimitLateral *= penalty;
            angularLimit *= penalty;
        }

        // Замедление от эффектов (SlowZone/Frost/Toxic)
        if (player.slowPct > 0) {
            const slowMult = 1 - player.slowPct;
            speedLimitForward *= slowMult;
            speedLimitReverse *= slowMult;
            speedLimitLateral *= slowMult;
        }

        // Максимальное угловое ускорение из ТТХ
        const maxAngularAccel = turnTorqueAdjusted / inertia;

        // Читаем ввод джойстика
        const inputX = player.inputX;
        const inputY = player.inputY;
        const inputMag = Math.hypot(inputX, inputY);
        const hasInput = inputMag > slimeConfig.assist.inputMagnitudeThreshold;

        // Локальные оси слайма
        const forwardX = Math.cos(player.angle);
        const forwardY = Math.sin(player.angle);
        const rightX = -forwardY;
        const rightY = forwardX;

        // === ПОВОРОТ (fly-by-wire с честной физикой) ===
        let yawCmd = 0;
        let predictiveBraking = false; // Флаг опережающего торможения

        if (hasInput) {
            const targetAngle = Math.atan2(inputY, inputX);
            const angleDelta = room.normalizeAngle(targetAngle - player.angle);

            const angularDeadzone = slimeConfig.assist.angularDeadzoneRad;
            if (Math.abs(angleDelta) > angularDeadzone) {
                const yawFull = slimeConfig.assist.yawFullDeflectionAngleRad;
                if (yawFull > 1e-6) {
                    // Опережающее торможение (U2 FA:ON стиль):
                    // Учитываем пассивное демпфирование angularDragK при расчёте stoppingAngle
                    // effectiveDecel = maxAngularAccel + angularDragK * |angVel| (примерно)
                    const angularDragK = room.balance.worldPhysics.angularDragK;
                    const effectiveDecel = maxAngularAccel + angularDragK * Math.abs(player.angVel);
                    const stoppingAngle = (player.angVel * player.angVel) / (2 * effectiveDecel + 1e-6);
                    const movingTowardsTarget =
                        (player.angVel > 0 && angleDelta > 0) || (player.angVel < 0 && angleDelta < 0);

                    if (movingTowardsTarget && stoppingAngle >= Math.abs(angleDelta)) {
                        // Перелёт неизбежен  тормозим
                        predictiveBraking = true;
                        yawCmd = 0;
                        // Очищаем историю осцилляций при торможении
                        player.yawSignHistory.length = 0;
                    } else {
                        yawCmd = room.clamp(angleDelta / yawFull, -1, 1);
                        yawCmd = room.clamp(yawCmd * slimeConfig.assist.yawRateGain, -1, 1);
                        yawCmd = room.applyYawOscillationDamping(player, yawCmd, slimeConfig);
                    }
                }
            } else {
                player.yawSignHistory.length = 0;
            }
        } else {
            player.yawSignHistory.length = 0;
        }

        const hasYawInput = hasInput && Math.abs(yawCmd) >= slimeConfig.assist.yawCmdEps && !predictiveBraking;
        let torque = 0;
        if (hasYawInput) {
            const desiredAngVel = yawCmd * angularLimit;
            const angVelError = desiredAngVel - player.angVel;
            // Минимум 1мс для избежания деления на слишком малое значение
            const reactionTime = Math.max(slimeConfig.assist.reactionTimeS, 0.001);
            const desiredAlpha = angVelError / reactionTime;
            const clampedAlpha = room.clamp(desiredAlpha, -maxAngularAccel, maxAngularAccel);
            torque = inertia * clampedAlpha;
        } else if (Math.abs(player.angVel) > 1e-3) {
            // Brake boost: торможение быстрее при отсутствии ввода (как в U2 FA:ON)
            // При опережающем торможении используем максимальное ускорение
            const boostFactor = predictiveBraking ? 1.0 : (slimeConfig.assist.angularBrakeBoostFactor || 1.0);
            const brakeTime = predictiveBraking
                ? dt // Максимально быстрое торможение при опережающем
                : Math.max(slimeConfig.assist.angularStopTimeS / boostFactor, dt);
            const desiredAlpha = -player.angVel / brakeTime;
            const clampedAlpha = room.clamp(desiredAlpha, -maxAngularAccel, maxAngularAccel);
            torque = inertia * clampedAlpha;
        }

        // === ДВИЖЕНИЕ (fly-by-wire с честной физикой) ===
        // Проецируем желаемую скорость на локальные оси слайма
        let desiredVx = 0;
        let desiredVy = 0;

        if (hasInput) {
            const inputDirX = inputX / inputMag;
            const inputDirY = inputY / inputMag;

            // Проекция направления ввода на оси слайма
            const inputForward = inputDirX * forwardX + inputDirY * forwardY;
            const inputRight = inputDirX * rightX + inputDirY * rightY;

            // Желаемая скорость по каждой оси с учётом лимитов
            const desiredForwardSpeed =
                inputForward >= 0
                    ? inputForward * inputMag * speedLimitForward
                    : inputForward * inputMag * speedLimitReverse;
            const desiredLateralSpeed = inputRight * inputMag * speedLimitLateral;

            // Переводим обратно в мировые координаты
            desiredVx = forwardX * desiredForwardSpeed + rightX * desiredLateralSpeed;
            desiredVy = forwardY * desiredForwardSpeed + rightY * desiredLateralSpeed;
        }

        // Ошибка скорости в мировых координатах
        const vErrorX = desiredVx - player.vx;
        const vErrorY = desiredVy - player.vy;

        // Проецируем ошибку на локальные оси
        const errorForward = vErrorX * forwardX + vErrorY * forwardY;
        const errorRight = vErrorX * rightX + vErrorY * rightY;

        let forceForward = 0;
        let forceRight = 0;

        // Время разгона/торможения
        const accelTime = hasInput ? slimeConfig.assist.accelTimeS : slimeConfig.assist.comfortableBrakingTimeS;

        // Сила по оси forward (вперёд/назад)
        if (Math.abs(errorForward) > slimeConfig.assist.velocityErrorThreshold) {
            const desiredAccelForward = errorForward / Math.max(accelTime, dt);
            // Выбираем лимит тяги в зависимости от направления
            const thrustLimit = errorForward >= 0 ? thrustForward : thrustReverse;
            const maxAccelForward = thrustLimit / mass;
            const clampedAccelForward = room.clamp(desiredAccelForward, -maxAccelForward, maxAccelForward);
            forceForward = mass * clampedAccelForward;
        }

        // Сила по оси right (боковое движение)
        if (Math.abs(errorRight) > slimeConfig.assist.velocityErrorThreshold) {
            const desiredAccelRight = errorRight / Math.max(accelTime, dt);
            const maxAccelRight = thrustLateral / mass;
            const clampedAccelRight = room.clamp(desiredAccelRight, -maxAccelRight, maxAccelRight);
            forceRight = mass * clampedAccelRight;
        }

        // === КОНТР-УСКОРЕНИЕ (counter-acceleration) ===
        // При резкой смене направления активно гасим перпендикулярную составляющую скорости
        if (slimeConfig.assist.counterAccelEnabled && hasInput) {
            const currentSpeed = Math.hypot(player.vx, player.vy);
            const desiredSpeed = Math.hypot(desiredVx, desiredVy);
            
            // Проверяем минимальную скорость для активации контр-ускорения
            if (currentSpeed >= slimeConfig.assist.counterAccelMinSpeedMps && desiredSpeed > 1e-3) {
                // Вычисляем угол между текущей и желаемой скоростью
                const currentVelAngle = Math.atan2(player.vy, player.vx);
                const desiredVelAngle = Math.atan2(desiredVy, desiredVx);
                const angleDiff = Math.abs(room.normalizeAngle(desiredVelAngle - currentVelAngle));
                
                // Порог угла в радианах
                const thresholdRad = (slimeConfig.assist.counterAccelDirectionThresholdDeg * Math.PI) / 180;
                
                // Если угол превышает порог — применяем контр-ускорение
                if (angleDiff > thresholdRad) {
                    // Направление желаемой скорости (единичный вектор)
                    const desiredDirX = desiredVx / desiredSpeed;
                    const desiredDirY = desiredVy / desiredSpeed;
                    
                    // Проекция текущей скорости на желаемое направление
                    const vParallel = player.vx * desiredDirX + player.vy * desiredDirY;
                    
                    // Перпендикулярная составляющая скорости (drift)
                    const vPerpX = player.vx - vParallel * desiredDirX;
                    const vPerpY = player.vy - vParallel * desiredDirY;
                    const vPerpMag = Math.hypot(vPerpX, vPerpY);
                    
                    // Гасим перпендикулярную скорость за counterAccelTimeS
                    if (vPerpMag > 1e-3) {
                        // Минимальное время 1мс для избежания нестабильности
                        const counterAccelTime = Math.max(slimeConfig.assist.counterAccelTimeS, 0.001);
                        const desiredPerpAccel = -vPerpMag / counterAccelTime;
                        
                        // Направление торможения
                        const perpDirX = vPerpX / vPerpMag;
                        const perpDirY = vPerpY / vPerpMag;
                        
                        // Проецируем на локальные оси слайма
                        const perpForward = perpDirX * forwardX + perpDirY * forwardY;
                        const perpRight = perpDirX * rightX + perpDirY * rightY;
                        
                        // Рассчитываем силы контр-ускорения
                        const counterForceForward = mass * desiredPerpAccel * perpForward;
                        const counterForceRight = mass * desiredPerpAccel * perpRight;
                        
                        // Ограничиваем силы доступной тягой с учётом направления
                        const limitedForward = counterForceForward >= 0 
                            ? Math.min(counterForceForward, thrustForward)
                            : Math.max(counterForceForward, -thrustReverse);
                        const limitedRight = counterForceRight >= 0
                            ? Math.min(counterForceRight, thrustLateral)
                            : Math.max(counterForceRight, -thrustLateral);
                        
                        // Добавляем контр-ускорение к общей силе
                        forceForward += limitedForward;
                        forceRight += limitedRight;
                    }
                }
            }
        }

        const overspeedRate = slimeConfig.assist.overspeedDampingRate;
        if (overspeedRate > 0) {
            const vForward = player.vx * forwardX + player.vy * forwardY;
            const forwardLimit = vForward >= 0 ? speedLimitForward : speedLimitReverse;
            const forwardExcess = Math.abs(vForward) - forwardLimit;
            if (forwardExcess > 0) {
                const dvTarget = -Math.sign(vForward) * forwardExcess * overspeedRate;
                const desiredAccelForward = dvTarget / dt;
                const thrustLimit = vForward >= 0 ? thrustReverse : thrustForward;
                const maxAccelForward = thrustLimit / mass;
                let brakeForce = mass * room.clamp(desiredAccelForward, -maxAccelForward, maxAccelForward);
                if (!hasInput) {
                    brakeForce *= slimeConfig.assist.autoBrakeMaxThrustFraction;
                }
                forceForward += brakeForce;
            }

            const vRight = player.vx * rightX + player.vy * rightY;
            const lateralExcess = Math.abs(vRight) - speedLimitLateral;
            if (lateralExcess > 0) {
                const dvTarget = -Math.sign(vRight) * lateralExcess * overspeedRate;
                const desiredAccelRight = dvTarget / dt;
                const maxAccelRight = thrustLateral / mass;
                let brakeForce = mass * room.clamp(desiredAccelRight, -maxAccelRight, maxAccelRight);
                if (!hasInput) {
                    brakeForce *= slimeConfig.assist.autoBrakeMaxThrustFraction;
                }
                forceRight += brakeForce;
            }
        }

        forceForward = room.clamp(forceForward, -thrustReverse, thrustForward);
        forceRight = room.clamp(forceRight, -thrustLateral, thrustLateral);

        // Переводим силу в мировые координаты
        const forceX = forwardX * forceForward + rightX * forceRight;
        const forceY = forwardY * forceForward + rightY * forceRight;

        player.assistFx = forceX;
        player.assistFy = forceY;
        player.assistTorque = torque;
    }
}

export function physicsSystem(room: any) {
    const dt = 1 / room.balance.server.tickRate;
    const world = room.balance.worldPhysics;
    for (const player of room.state.players.values()) {
        if (player.isDead) continue;

        // Dash movement: линейная интерполяция к цели
        if ((player.flags & FLAG_DASHING) !== 0 && player.dashEndTick > 0) {
            const dashLevel = room.getAbilityLevelForAbility(player, "dash") || 1;
            const dashConfig = room.getAbilityConfigById("dash", dashLevel);
            const dashDurationTicks = Math.round(dashConfig.durationSec * room.balance.server.tickRate);
            const ticksRemaining = player.dashEndTick - room.tick;
            const progress = 1 - ticksRemaining / dashDurationTicks;

            // Линейное движение к цели
            const startX = player.dashTargetX - Math.cos(player.angle) * dashConfig.distanceM;
            const startY = player.dashTargetY - Math.sin(player.angle) * dashConfig.distanceM;
            player.x = startX + (player.dashTargetX - startX) * progress;
            player.y = startY + (player.dashTargetY - startY) * progress;

            // Обнуляем скорость во время рывка, потом восстановим в направлении
            const dashSpeed = dashConfig.distanceM / dashConfig.durationSec;
            player.vx = Math.cos(player.angle) * dashSpeed;
            player.vy = Math.sin(player.angle) * dashSpeed;
            continue;
        }

        const slimeConfig = room.getSlimeConfig(player);
        const classStats = room.getClassStats(player);
        const mass = Math.max(player.mass, room.balance.physics.minSlimeMass);
        const inertia = room.getSlimeInertiaForPlayer(player, slimeConfig, classStats);
        const zoneFrictionMultiplier = room.getZoneFrictionMultiplier(player);

        const dragFx = -mass * world.linearDragK * zoneFrictionMultiplier * player.vx;
        const dragFy = -mass * world.linearDragK * zoneFrictionMultiplier * player.vy;
        const dragTorque = -inertia * world.angularDragK * zoneFrictionMultiplier * player.angVel;

        const totalFx = player.assistFx + dragFx;
        const totalFy = player.assistFy + dragFy;
        player.vx += (totalFx / mass) * dt;
        player.vy += (totalFy / mass) * dt;
        player.x += player.vx * dt;
        player.y += player.vy * dt;

        const totalTorque = player.assistTorque + dragTorque;
        player.angVel += (totalTorque / Math.max(inertia, 1e-6)) * dt;
        let angularLimit = scaleSlimeValue(
            slimeConfig.limits.angularSpeedLimitRadps,
            mass,
            slimeConfig,
            slimeConfig.massScaling.angularSpeedLimitRadps
        );
        // Штраф last-breath применяется и к угловому лимиту
        if (player.isLastBreath) {
            angularLimit *= room.balance.combat.lastBreathSpeedPenalty;
        }
        if (angularLimit > 0 && Math.abs(player.angVel) > angularLimit) {
            player.angVel = Math.sign(player.angVel) * angularLimit;
        }
        player.angle = room.normalizeAngle(player.angle + player.angVel * dt);
    }
}
