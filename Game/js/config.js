(function (APP) {
    "use strict";

    var CFG = {
                world: {
                    baseGravity: 0.9,
                    moonGravityScale: 0.38,
                    moonDurationMs: 30000,
                    bootsDurationMs: 30000,
                    tickMs: 20,
                    cleanupBehind: 1400,
                    loseY: 1500,
                    chunkSpacing: 1900,
                    chunkTriggerOffset: 1000,
                    supportTolerance: 16,
                    overlapInset: 6
                },
                player: {
                    width: 45,
                    height: 90,
                    speed: 8,
                    jumpForce: -18,
                    dashDistance: 180,
                    dashCooldown: 1000,
                    attackCooldown: 250,
                    attackDuration: 250,
                    attackRange: 92,
                    fireCooldown: 650,
                    fireSpeed: 12,
                    fireRange: 1300,
                    startAmmo: 3,
                    maxLives: 3,
                    invulnMs: 900,
                    hitKnockbackX: 6.5,
                    hitKnockbackY: -7
                },
                enemy: {
                    width: 45,
                    height: 90,
                    speed: 2.5,
                    aggroRange: 320,
                    attackGapX: 54,
                    attackGapY: 42,
                    attackCooldown: 1000,
                    attackDuration: 250,
                    corpseDelay: 520,
                    cleanupDelay: 1100,
                    heartDropChance: 0.25,
                    fireDropChance: 0.25,
                    hitKnockbackX: 5.1,
                    hitKnockbackY: -5.8,
                    jumpForce: -14.5,
                    jumpCooldown: 760,
                    jumpHeight: 142,
                    jumpForward: 158,
                    jumpDecisionRange: 240,
                    dropSeekDepth: 220,
                    ledgeProbe: 18
                },
                physics: {
                    impulseDamping: 0.78,
                    minImpulse: 0.12
                },
                combat: {
                    playerTargetKnockback: 19.5,
                    enemyTargetKnockback: 15.5,
                    fireballKnockbackScale: 0.95,
                    meleeSpeedKnockbackFactor: 0.055,
                    meleeDownwardCritDy: 10,
                    meleeDownwardCritKnockbackBonus: 0.75,
                    enemyCenterReachScale: 0.78
                },
                camera: {
                    smooth: 0.1
                },
                pickup: {
                    heartSize: 20,
                    fireSize: 20,
                    moonSize: 40,
                    bootsSize: 40,
                    platformAnyChance: 0.02,
                    firePlatformShare: 0.58,
                    bootsPlatformShare: 0.24,
                    moonPlatformShare: 0.18,
                    bobAmount: 2.2
                },
                generator: {
                    minY: 42,
                    maxY: 548,
                    mainCount: 9,
                    baseGapMin: 150,
                    baseGapMax: 230,
                    enemyBaseChance: 0.2,
                    enemyMaxChance: 0.62
                }
            };

            var PLATFORM_STYLE = {
                stationary: { color: "#53c653", border: "#2e7d32" },
                horizontal: { color: "#29b6f6", border: "#0277bd" },
                vertical: { color: "#ffb300", border: "#ef6c00" },
                circle: { color: "#ab47bc", border: "#6a1b9a" }
            };

    APP.CFG = CFG;
    APP.PLATFORM_STYLE = PLATFORM_STYLE;
})(window.InfinityRunner);
