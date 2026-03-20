(function (APP) {
    "use strict";

    var CFG = APP.CFG;
    var state = APP.state;
    var dom = APP.dom;
    var platforms = APP.entities.platforms;
    var enemies = APP.entities.enemies;
    var pickups = APP.entities.pickups;
    var players = APP.entities.players;

    function createPlatform(x, y, w, h, moveType, moveRangeX, moveRangeY, moveSpeed) {
                var visual = getPlatformVisual(moveType);
                var platform = {
                    x: x,
                    y: y,
                    lastX: x,
                    lastY: y,
                    baseX: x,
                    baseY: y,
                    w: w,
                    h: h,
                    moveType: moveType,
                    moveRangeX: moveRangeX || 0,
                    moveRangeY: moveRangeY || 0,
                    moveSpeed: moveSpeed || 0,
                    phase: Math.random() * 100,
                    el: null
                };
                var el = document.createElement("div");
                el.className = "platform";
                el.style.left = x + "px";
                el.style.top = y + "px";
                el.style.width = w + "px";
                el.style.height = h + "px";
                el.style.backgroundColor = visual.color;
                el.style.borderColor = visual.border;
                dom.world.appendChild(el);
                platform.el = el;
                platforms.push(platform);
                return platform;
            }

    function createEnemy(x, y, type) {
                var enemy = {
                    x: x,
                    y: y,
                    dy: 0,
                    kbx: 0,
                    type: type,
                    hp: type === 3 ? 3 : (type === 2 ? 2 : 1),
                    isAttacking: false,
                    lastAttack: 0,
                    lastHit: 0,
                    deathTime: 0,
                    cleanupAt: 0,
                    scored: false,
                    face: "left",
                    supportPlatform: null,
                    lastMoveX: 0,
                    lastJump: 0,
                    el: null
                };
                var el = document.createElement("div");
                el.className = "enemy" + type;
                el.style.left = x + "px";
                el.style.top = y + "px";
                dom.world.appendChild(el);
                enemy.el = el;
                enemies.push(enemy);
                return enemy;
            }

    function getPickupSize(kind) {
                if (kind === "heart") {
                    return CFG.pickup.heartSize;
                }
                if (kind === "fire") {
                    return CFG.pickup.fireSize;
                }
                if (kind === "boots") {
                    return CFG.pickup.bootsSize;
                }
                return CFG.pickup.moonSize;
            }

    function getPickupClass(kind) {
                if (kind === "heart") {
                    return "pickup-heart";
                }
                if (kind === "fire") {
                    return "pickup-fire";
                }
                if (kind === "boots") {
                    return "pickup-boots";
                }
                return "pickup-moon";
            }

    function createPickup(kind, x, y, platform) {
                var size = getPickupSize(kind);
                var pickup = {
                    kind: kind,
                    x: x,
                    y: y,
                    baseX: x,
                    baseY: y,
                    w: size,
                    h: size,
                    bobPhase: Math.random() * 1000,
                    supportPlatform: platform || null,
                    offsetX: 0,
                    offsetY: 0,
                    el: null
                };
                var el = document.createElement("div");
                el.className = getPickupClass(kind);
                el.style.left = x + "px";
                el.style.top = y + "px";
                dom.world.appendChild(el);
                pickup.el = el;

                if (platform) {
                    pickup.offsetX = x - platform.x;
                    pickup.offsetY = y - platform.y;
                }

                pickups.push(pickup);
                return pickup;
            }

    function spawnPickupOnPlatform(kind, platform, centerX) {
                var size = getPickupSize(kind);
                var x = centerX - Math.floor(size / 2);
                x = clamp(x, platform.x + 8, platform.x + platform.w - size - 8);
                return createPickup(kind, x, platform.y - size, platform);
            }

    function findPlatformBelowEntity(centerX, minY, maxDrop) {
                var i;
                var p;
                var best = null;

                for (i = 0; i < platforms.length; i++) {
                    p = platforms[i];
                    if (centerX >= p.x + 4 && centerX <= p.x + p.w - 4 && p.y >= minY && p.y <= minY + maxDrop) {
                        if (!best || p.y < best.y) {
                            best = p;
                        }
                    }
                }
                return best;
            }

    function spawnEnemyDrop(enemy, kind) {
                var centerX = enemy.x + Math.floor(CFG.enemy.width / 2);
                var platform = enemy.supportPlatform;
                if (!platform) {
                    platform = findPlatformBelowEntity(centerX, enemy.y + CFG.enemy.height - 4, 180);
                }
                if (platform) {
                    spawnPickupOnPlatform(kind, platform, centerX);
                } else {
                    createPickup(kind, centerX - Math.floor(getPickupSize(kind) / 2), enemy.y + CFG.enemy.height - getPickupSize(kind), null);
                }
            }

    function currentGravity(time) {
                if (time < state.moonUntil) {
                    return CFG.world.baseGravity * CFG.world.moonGravityScale;
                }
                return CFG.world.baseGravity;
            }

    function hasBoots(player, time) {
                return time < player.bootsUntil;
            }

    function getPlayerExtraJumpCount(player, time) {
                return hasBoots(player, time) ? 2 : 1;
            }

    function syncTimedEffects(time) {
                var i;
                var player;
                if (time > state.moonUntil) {
                    state.moonUntil = 0;
                }
                for (i = 0; i < players.length; i++) {
                    player = players[i];
                    if (time > player.bootsUntil) {
                        player.bootsUntil = 0;
                        if (player.extraJumpsLeft > 1) {
                            player.extraJumpsLeft = 1;
                        }
                    }
                }
            }

    function chooseMoveType(index, count, diff, bonus) {
                var roll;
                if (index === 0 || index === count - 1) {
                    return "stationary";
                }
                if (state.chunkIndex === 0 && index < 4) {
                    return "stationary";
                }
                roll = Math.random();
                if (bonus) {
                    if (roll < 0.52) {
                        return "stationary";
                    }
                    if (roll < 0.74) {
                        return "horizontal";
                    }
                    if (roll < 0.9) {
                        return "vertical";
                    }
                    return "circle";
                }
                if (state.chunkIndex < 2) {
                    if (roll < 0.68) {
                        return "stationary";
                    }
                    if (roll < 0.86) {
                        return "horizontal";
                    }
                    if (roll < 0.95) {
                        return "vertical";
                    }
                    return "circle";
                }
                if (roll < 0.48 - diff * 0.03) {
                    return "stationary";
                }
                if (roll < 0.72) {
                    return "horizontal";
                }
                if (roll < 0.89) {
                    return "vertical";
                }
                return "circle";
            }

    function maybeSpawnPlatformPickup(platform) {
                var roll;
                var centerX;
                if (platform.w < 88) {
                    return;
                }
                if (Math.random() >= CFG.pickup.platformAnyChance) {
                    return;
                }
                centerX = platform.x + Math.floor(platform.w / 2);
                roll = Math.random();
                if (roll < CFG.pickup.moonPlatformShare) {
                    spawnPickupOnPlatform("moon", platform, centerX);
                    return;
                }
                if (roll < CFG.pickup.moonPlatformShare + CFG.pickup.bootsPlatformShare) {
                    spawnPickupOnPlatform("boots", platform, centerX);
                    return;
                }
                spawnPickupOnPlatform("fire", platform, centerX);
            }

    APP.expose("createPlatform", createPlatform);
    APP.expose("createEnemy", createEnemy);
    APP.expose("getPickupSize", getPickupSize);
    APP.expose("getPickupClass", getPickupClass);
    APP.expose("createPickup", createPickup);
    APP.expose("spawnPickupOnPlatform", spawnPickupOnPlatform);
    APP.expose("findPlatformBelowEntity", findPlatformBelowEntity);
    APP.expose("spawnEnemyDrop", spawnEnemyDrop);
    APP.expose("currentGravity", currentGravity);
    APP.expose("hasBoots", hasBoots);
    APP.expose("getPlayerExtraJumpCount", getPlayerExtraJumpCount);
    APP.expose("syncTimedEffects", syncTimedEffects);
    APP.expose("chooseMoveType", chooseMoveType);
    APP.expose("maybeSpawnPlatformPickup", maybeSpawnPlatformPickup);
})(window.InfinityRunner);
