(function (APP) {
    "use strict";

    var CFG = APP.CFG;
    var state = APP.state;
    var dom = APP.dom;
    var platforms = APP.entities.platforms;
    var enemies = APP.entities.enemies;
    var pickups = APP.entities.pickups;
    var fireballs = APP.entities.fireballs;
    var players = APP.entities.players;
    var runtime = APP.runtime;

    function updatePlatforms() {
                var i;
                var p;
                for (i = 0; i < platforms.length; i++) {
                    p = platforms[i];
                    p.lastX = p.x;
                    p.lastY = p.y;
                    if (p.moveSpeed > 0) {
                        p.phase += p.moveSpeed;
                        if (p.moveType === "horizontal") {
                            p.x = p.baseX + Math.sin(p.phase) * p.moveRangeX;
                            p.y = p.baseY;
                        } else if (p.moveType === "vertical") {
                            p.x = p.baseX;
                            p.y = p.baseY + Math.cos(p.phase) * p.moveRangeY;
                        } else if (p.moveType === "circle") {
                            p.x = p.baseX + Math.sin(p.phase) * p.moveRangeX;
                            p.y = p.baseY + Math.cos(p.phase) * p.moveRangeY;
                        } else {
                            p.x = p.baseX;
                            p.y = p.baseY;
                        }
                        p.el.style.left = p.x + "px";
                        p.el.style.top = p.y + "px";
                    }
                }
            }

    function wasStandingOnPlatform(ex, ey, ew, eh, platform) {
                if (!platform) {
                    return false;
                }
                if (!hasSupportOverlapAt(ex, ew, platform.lastX, platform.w)) {
                    return false;
                }
                return Math.abs((ey + eh) - platform.lastY) <= CFG.world.supportTolerance;
            }

    function carryPlayerWithPlatform(player) {
                var p = player.supportPlatform;
                if (!wasStandingOnPlatform(player.x, player.y, CFG.player.width, CFG.player.height, p)) {
                    player.supportPlatform = null;
                    return;
                }
                player.x += p.x - p.lastX;
                player.y += p.y - p.lastY;
            }

    function carryEnemyWithPlatform(enemy) {
                var p = enemy.supportPlatform;
                if (!wasStandingOnPlatform(enemy.x, enemy.y, CFG.enemy.width, CFG.enemy.height, p)) {
                    enemy.supportPlatform = null;
                    return;
                }
                enemy.x += p.x - p.lastX;
                enemy.y += p.y - p.lastY;
            }

    function findTopLandingPlatform(x, prevY, newY, w, h) {
                var i;
                var p;
                var prevBottom = prevY + h;
                var newBottom = newY + h;
                var landing = null;

                if (newY <= prevY) {
                    return null;
                }

                for (i = 0; i < platforms.length; i++) {
                    p = platforms[i];
                    if (!hasSupportOverlapAt(x, w, p.x, p.w)) {
                        continue;
                    }
                    if (prevBottom <= p.y + CFG.world.supportTolerance && newBottom >= p.y) {
                        if (!landing || p.y < landing.y) {
                            landing = p;
                        }
                    }
                }
                return landing;
            }

    function applyPlayerVerticalMotion(player, time) {
                var prevY = player.y;
                var landing;
                player.onGround = false;
                player.supportPlatform = null;
                player.dy += currentGravity(time);
                player.y += player.dy;
                if (player.dy >= 0) {
                    landing = findTopLandingPlatform(player.x, prevY, player.y, CFG.player.width, CFG.player.height);
                    if (landing) {
                        player.y = landing.y - CFG.player.height;
                        player.dy = 0;
                        player.onGround = true;
                        player.extraJumpsLeft = getPlayerExtraJumpCount(player, time);
                        player.supportPlatform = landing;
                    }
                }
            }

    function applyEnemyVerticalMotion(enemy, time) {
                var prevY = enemy.y;
                var landing;
                enemy.supportPlatform = null;
                enemy.dy += currentGravity(time);
                enemy.y += enemy.dy;
                if (enemy.dy >= 0) {
                    landing = findTopLandingPlatform(enemy.x, prevY, enemy.y, CFG.enemy.width, CFG.enemy.height);
                    if (landing) {
                        enemy.y = landing.y - CFG.enemy.height;
                        enemy.dy = 0;
                        enemy.supportPlatform = landing;
                    }
                }
            }

    function computePlayerInputX(player) {
                var inputState = player.inputState || getPlayerActionState(player);
                player.isMoving = false;
                if (!player.alive) {
                    return 0;
                }
                if (inputState.left && !inputState.right) {
                    player.facing = "left";
                    player.isMoving = true;
                    return -CFG.player.speed;
                }
                if (inputState.right && !inputState.left) {
                    player.facing = "right";
                    player.isMoving = true;
                    return CFG.player.speed;
                }
                return 0;
            }

    function playerCanTakeDamage(player, time) {
                return player.alive && time - player.lastHit >= CFG.player.invulnMs;
            }

    function damagePlayer(player, amount, time, sourceX) {
                var playerCenter;
                if (!playerCanTakeDamage(player, time)) {
                    return false;
                }
                player.lives -= amount;
                if (player.lives < 0) {
                    player.lives = 0;
                }
                player.lastHit = time;
                playerCenter = player.x + (CFG.player.width / 2);
                if (sourceX <= playerCenter) {
                    player.kbx = CFG.player.hitKnockbackX;
                } else {
                    player.kbx = -CFG.player.hitKnockbackX;
                }
                player.dy = CFG.player.hitKnockbackY;
                player.supportPlatform = null;
                player.onGround = false;
                if (player.lives <= 0) {
                    killPlayer(player, time);
                }
                return true;
            }

    function attackEnemy(enemy, damage, time, sourceX) {
                var enemyCenter;
                if (enemy.hp <= 0) {
                    return;
                }
                enemy.hp -= damage;
                enemy.lastHit = time;
                enemyCenter = enemy.x + (CFG.enemy.width / 2);
                if (sourceX <= enemyCenter) {
                    enemy.kbx = CFG.enemy.hitKnockbackX;
                } else {
                    enemy.kbx = -CFG.enemy.hitKnockbackX;
                }
                enemy.dy = CFG.enemy.hitKnockbackY;
                enemy.supportPlatform = null;
                if (enemy.hp <= 0) {
                    enemy.hp = 0;
                    enemy.deathTime = time;
                    enemy.cleanupAt = time + CFG.enemy.cleanupDelay;
                    if (!enemy.scored) {
                        state.score += enemy.type;
                        enemy.scored = true;
                    }
                    if (Math.random() < CFG.enemy.heartDropChance) {
                        spawnEnemyDrop(enemy, "heart");
                    }
                    if (Math.random() < CFG.enemy.fireDropChance) {
                        spawnEnemyDrop(enemy, "fire");
                    }
                }
            }

    function createFireball(player) {
                var fireball = {
                    ownerId: player.id,
                    x: player.x + (player.facing === "left" ? -10 : 35),
                    y: player.y + 35,
                    vx: player.facing === "left" ? -CFG.player.fireSpeed : CFG.player.fireSpeed,
                    w: 20,
                    h: 20,
                    el: null
                };
                var el = document.createElement("div");
                el.className = "fireball";
                el.style.left = fireball.x + "px";
                el.style.top = fireball.y + "px";
                dom.world.appendChild(el);
                fireball.el = el;
                fireballs.push(fireball);
                return fireball;
            }

    function spawnFireball(player, time) {
                if (!player.alive || player.fireAmmo <= 0) {
                    return;
                }
                player.lastFireTime = time;
                player.fireAmmo--;
                createFireball(player);
            }

    function getPlatformCollisionAt(x, y, w, h) {
                var i;
                var p;
                for (i = 0; i < platforms.length; i++) {
                    p = platforms[i];
                    if (rectsOverlap(x, y, w, h, p.x, p.y, p.w, p.h)) {
                        return p;
                    }
                }
                return null;
            }

    function applyPickupToPlayer(player, pickup, time) {
                if (pickup.kind === "heart") {
                    if (player.lives >= CFG.player.maxLives) {
                        return false;
                    }
                    player.lives++;
                    return true;
                }
                if (pickup.kind === "fire") {
                    player.fireAmmo++;
                    return true;
                }
                if (pickup.kind === "moon") {
                    state.moonUntil = time + CFG.world.moonDurationMs;
                    return true;
                }
                if (pickup.kind === "boots") {
                    player.bootsUntil = time + CFG.world.bootsDurationMs;
                    if (player.extraJumpsLeft < 2) {
                        player.extraJumpsLeft = 2;
                    }
                    return true;
                }
                return false;
            }

    function updatePickups(time) {
                var i;
                var pickup;
                var bobOffset;
                var j;
                var player;
                for (i = pickups.length - 1; i >= 0; i--) {
                    pickup = pickups[i];
                    if (pickup.supportPlatform && pickup.supportPlatform.el) {
                        pickup.baseX = pickup.supportPlatform.x + pickup.offsetX;
                        pickup.baseY = pickup.supportPlatform.y + pickup.offsetY;
                    }
                    bobOffset = Math.sin((time + pickup.bobPhase) / 180) * CFG.pickup.bobAmount;
                    pickup.x = pickup.baseX;
                    pickup.y = pickup.baseY + bobOffset;
                    pickup.el.style.left = Math.floor(pickup.x) + "px";
                    pickup.el.style.top = Math.floor(pickup.y) + "px";
                    if (pickup.kind === "fire") {
                        pickup.el.style.backgroundPosition = ((Math.floor(time / 120) % 2 === 0) ? "0 0" : "-20px 0");
                    } else if (pickup.kind === "heart") {
                        pickup.el.style.backgroundPosition = "0 0";
                    }
                    for (j = 0; j < players.length; j++) {
                        player = players[j];
                        if (!player.alive) {
                            continue;
                        }
                        if (rectsOverlap(player.x, player.y, CFG.player.width, CFG.player.height, pickup.x, pickup.y, pickup.w, pickup.h)) {
                            if (applyPickupToPlayer(player, pickup, time)) {
                                removeElement(pickup.el);
                                pickups.splice(i, 1);
                                break;
                            }
                        }
                    }
                }
            }

    function enemyHasGroundAhead(enemy, probeX) {
                var i;
                var p;
                for (i = 0; i < platforms.length; i++) {
                    p = platforms[i];
                    if (probeX > p.x && probeX < p.x + p.w && enemy.y + CFG.enemy.height >= p.y - 5 && enemy.y + CFG.enemy.height <= p.y + p.h + 15) {
                        return true;
                    }
                }
                return false;
            }

    function enemyFindJumpTarget(enemy, dir, target) {
                var i;
                var p;
                var feetY = enemy.y + CFG.enemy.height;
                var best = null;
                var heightDiff;
                var aheadLeft;
                var aheadRight;
                var score;
                var playerBiasX = target.x + (CFG.player.width / 2);
                var playerBiasY = target.y + (CFG.player.height / 2);
                for (i = 0; i < platforms.length; i++) {
                    p = platforms[i];
                    if (p === enemy.supportPlatform) {
                        continue;
                    }
                    heightDiff = feetY - p.y;
                    if (heightDiff < -32 || heightDiff > CFG.enemy.jumpHeight) {
                        continue;
                    }
                    if (dir > 0) {
                        aheadLeft = enemy.x + CFG.enemy.width - 10;
                        aheadRight = enemy.x + CFG.enemy.width + CFG.enemy.jumpForward;
                        if (p.x > aheadRight || p.x + p.w < aheadLeft) {
                            continue;
                        }
                    } else {
                        aheadLeft = enemy.x - CFG.enemy.jumpForward;
                        aheadRight = enemy.x + 10;
                        if (p.x > aheadRight || p.x + p.w < aheadLeft) {
                            continue;
                        }
                    }
                    score = Math.abs((p.x + p.w / 2) - playerBiasX) + Math.abs((p.y + p.h / 2) - playerBiasY) * 0.5 + Math.abs((p.x + p.w / 2) - (enemy.x + CFG.enemy.width / 2 + dir * 72)) * 0.38;
                    if (heightDiff < 0) {
                        score += 12;
                    }
                    if (!best || score < best.score) {
                        best = { platform: p, score: score };
                    }
                }
                return best ? best.platform : null;
            }

    function enemyFindDropTarget(enemy, dir, target) {
                var i;
                var p;
                var feetY = enemy.y + CFG.enemy.height;
                var best = null;
                var aheadLeft;
                var aheadRight;
                var drop;
                var score;
                if (!enemy.supportPlatform) {
                    return null;
                }
                if (dir > 0) {
                    aheadLeft = enemy.x + CFG.enemy.width - 8;
                    aheadRight = enemy.x + CFG.enemy.width + CFG.enemy.jumpForward;
                } else {
                    aheadLeft = enemy.x - CFG.enemy.jumpForward;
                    aheadRight = enemy.x + 8;
                }
                for (i = 0; i < platforms.length; i++) {
                    p = platforms[i];
                    if (p === enemy.supportPlatform) {
                        continue;
                    }
                    if (p.x > aheadRight || p.x + p.w < aheadLeft) {
                        continue;
                    }
                    drop = p.y - feetY;
                    if (drop < 18 || drop > CFG.enemy.dropSeekDepth) {
                        continue;
                    }
                    score = drop * 0.35 + Math.abs((p.x + p.w / 2) - (target.x + CFG.player.width / 2));
                    if (!best || score < best.score) {
                        best = { platform: p, score: score };
                    }
                }
                return best ? best.platform : null;
            }

    function tryEnemyJump(enemy, time, target, distX, groundAhead) {
                var dir;
                var targetAbove;
                var targetBelow;
                var absX;
                var jumpTarget;
                if (!target) {
                    return false;
                }
                if (!enemy.supportPlatform || enemy.dy !== 0 || time - enemy.lastJump < CFG.enemy.jumpCooldown) {
                    return false;
                }
                dir = distX > 0 ? -1 : 1;
                absX = Math.abs(distX);
                targetAbove = target.y + CFG.player.height < enemy.y + CFG.enemy.height - 18;
                targetBelow = target.y > enemy.y + 36;

                if (absX > CFG.enemy.jumpDecisionRange + 36 && !targetAbove && !targetBelow) {
                    return false;
                }

                if (!groundAhead && absX <= CFG.enemy.jumpDecisionRange + 46) {
                    jumpTarget = enemyFindJumpTarget(enemy, dir, target);
                    if (jumpTarget) {
                        enemy.lastJump = time;
                        enemy.dy = CFG.enemy.jumpForce;
                        enemy.supportPlatform = null;
                        enemy.y -= 2;
                        enemy.x += dir * 4;
                        return true;
                    }
                }

                if (targetAbove && absX <= CFG.enemy.jumpDecisionRange + 28) {
                    jumpTarget = enemyFindJumpTarget(enemy, dir, target);
                    if (jumpTarget) {
                        enemy.lastJump = time;
                        enemy.dy = CFG.enemy.jumpForce;
                        enemy.supportPlatform = null;
                        enemy.y -= 2;
                        enemy.x += dir * 4;
                        return true;
                    }
                }

                if (targetBelow && absX <= 180 && !groundAhead) {
                    jumpTarget = enemyFindJumpTarget(enemy, dir, target);
                    if (jumpTarget) {
                        enemy.lastJump = time;
                        enemy.dy = CFG.enemy.jumpForce;
                        enemy.supportPlatform = null;
                        enemy.y -= 2;
                        enemy.x += dir * 4;
                        return true;
                    }
                }

                return false;
            }

    function updateEnemies(time) {
                var i;
                var enemy;
                var target;
                var distX;
                var desiredX;
                var probeX;
                var animY;
                var flickerOn;
                var groundAhead;
                var jumped;
                var dropTarget;
                for (i = enemies.length - 1; i >= 0; i--) {
                    enemy = enemies[i];
                    if (enemy.hp <= 0) {
                        if (enemy.el) {
                            if (time - enemy.deathTime < CFG.enemy.corpseDelay) {
                                flickerOn = (Math.floor((time - enemy.deathTime) / 60) % 2 === 0);
                                enemy.el.style.display = "block";
                                enemy.el.style.left = Math.floor(enemy.x) + "px";
                                enemy.el.style.top = Math.floor(enemy.y) + "px";
                                enemy.el.style.visibility = flickerOn ? "visible" : "hidden";
                                enemy.el.style.backgroundPosition = (enemy.face === "left" ? 0 : -45) + "px -180px";
                            } else {
                                enemy.el.style.display = "none";
                            }
                        }
                        if (time >= enemy.cleanupAt) {
                            removeElement(enemy.el);
                            enemies.splice(i, 1);
                        }
                        continue;
                    }

                    carryEnemyWithPlatform(enemy);
                    target = getNearestAlivePlayer(enemy.x + CFG.enemy.width / 2, enemy.y + CFG.enemy.height / 2);
                    if (!target) {
                        enemy.lastMoveX = enemy.kbx;
                        enemy.x += enemy.lastMoveX;
                        enemy.kbx = dampImpulse(enemy.kbx);
                        applyEnemyVerticalMotion(enemy, time);
                        continue;
                    }

                    distX = enemy.x - target.x;
                    enemy.face = distX > 0 ? "left" : "right";

                    if (enemyCanAttackTarget(enemy, target) && time - enemy.lastAttack >= CFG.enemy.attackCooldown) {
                        enemy.isAttacking = true;
                        enemy.lastAttack = time;
                        damagePlayer(target, 1, time, enemy.x + (CFG.enemy.width / 2));
                        (function (ref) {
                            setTimeout(function () {
                                ref.isAttacking = false;
                            }, CFG.enemy.attackDuration);
                        })(enemy);
                    }

                    desiredX = 0;
                    probeX = enemy.x + (distX > 0 ? -CFG.enemy.ledgeProbe : CFG.enemy.width + CFG.enemy.ledgeProbe);
                    groundAhead = enemyHasGroundAhead(enemy, probeX);
                    jumped = tryEnemyJump(enemy, time, target, distX, groundAhead);

                    if (Math.abs(distX) < CFG.enemy.aggroRange) {
                        if (!groundAhead) {
                            dropTarget = enemyFindDropTarget(enemy, distX > 0 ? -1 : 1, target);
                            if (dropTarget && target.y > enemy.y + 24) {
                                groundAhead = true;
                            }
                        }
                        if (enemy.dy !== 0 || groundAhead || jumped) {
                            desiredX = distX > 0 ? -CFG.enemy.speed : CFG.enemy.speed;
                        }
                    }

                    enemy.lastMoveX = desiredX + enemy.kbx;
                    enemy.x += enemy.lastMoveX;
                    enemy.kbx = dampImpulse(enemy.kbx);
                    applyEnemyVerticalMotion(enemy, time);

                    if (enemy.el) {
                        enemy.el.style.display = "block";
                        enemy.el.style.left = Math.floor(enemy.x) + "px";
                        enemy.el.style.top = Math.floor(enemy.y) + "px";
                        enemy.el.style.visibility = (time - enemy.lastHit < 250 && Math.floor(time / 50) % 2 === 0) ? "hidden" : "visible";
                        animY = enemy.isAttacking ? -180 : ((Math.abs(desiredX) > 0.1 && Math.floor(time / 150) % 2 === 1) ? -90 : 0);
                        enemy.el.style.backgroundPosition = (enemy.face === "left" ? 0 : -45) + "px " + animY + "px";
                    }
                }
            }

    function resolveEnemyEnemyOverlaps() {
                var pass;
                var i;
                var j;
                var a;
                var b;
                var overlapX;
                var overlapY;
                var direction;
                var separation;
                var centerA;
                var centerB;
                var impulse;
                for (pass = 0; pass < 2; pass++) {
                    for (i = 0; i < enemies.length; i++) {
                        a = enemies[i];
                        if (a.hp <= 0) {
                            continue;
                        }
                        for (j = i + 1; j < enemies.length; j++) {
                            b = enemies[j];
                            if (b.hp <= 0) {
                                continue;
                            }
                            overlapX = horizontalOverlapAmount(a.x, CFG.enemy.width, b.x, CFG.enemy.width);
                            overlapY = verticalOverlapAmount(a.y, CFG.enemy.height, b.y, CFG.enemy.height);
                            if (overlapX > 0 && overlapY > 12) {
                                centerA = a.x + (CFG.enemy.width / 2);
                                centerB = b.x + (CFG.enemy.width / 2);
                                direction = centerA <= centerB ? 1 : -1;
                                separation = (overlapX + 0.01) / 2;
                                a.x -= direction * separation;
                                b.x += direction * separation;
                                impulse = Math.min(1.4, separation * 0.05);
                                a.kbx -= direction * impulse;
                                b.kbx += direction * impulse;
                            }
                        }
                    }
                }
            }

    function resolvePlayerEnemyOverlaps() {
                var pass;
                var i;
                var j;
                var player;
                var enemy;
                var overlapX;
                var overlapY;
                var direction;
                var separation;
                var playerShare;
                var enemyShare;
                var playerCenter;
                var enemyCenter;
                var playerMoveDir;
                var enemyMoveDir;
                for (pass = 0; pass < 3; pass++) {
                    for (j = 0; j < players.length; j++) {
                        player = players[j];
                        if (!player.alive) {
                            continue;
                        }
                        for (i = 0; i < enemies.length; i++) {
                            enemy = enemies[i];
                            if (enemy.hp <= 0) {
                                continue;
                            }
                            overlapX = horizontalOverlapAmount(player.x, CFG.player.width, enemy.x, CFG.enemy.width);
                            overlapY = verticalOverlapAmount(player.y, CFG.player.height, enemy.y, CFG.enemy.height);
                            if (overlapX > 0 && overlapY > 14) {
                                playerCenter = player.x + (CFG.player.width / 2);
                                enemyCenter = enemy.x + (CFG.enemy.width / 2);
                                direction = playerCenter <= enemyCenter ? 1 : -1;
                                separation = overlapX + 0.01;
                                playerMoveDir = signOf(player.lastMoveX);
                                enemyMoveDir = signOf(enemy.lastMoveX);
                                if (playerMoveDir === direction) {
                                    playerShare = 0.16;
                                    enemyShare = 0.84;
                                } else if (enemyMoveDir === -direction) {
                                    playerShare = 0.58;
                                    enemyShare = 0.42;
                                } else {
                                    playerShare = 0.26;
                                    enemyShare = 0.74;
                                }
                                player.x -= direction * separation * playerShare;
                                enemy.x += direction * separation * enemyShare;
                                enemy.kbx += direction * Math.min(2.6, separation * 0.06);
                            }
                        }
                    }
                }
            }

    function resolvePlayerPlayerOverlaps() {
                var i;
                var j;
                var a;
                var b;
                var overlapX;
                var overlapY;
                var direction;
                var separation;
                if (players.length < 2) {
                    return;
                }
                for (i = 0; i < players.length; i++) {
                    a = players[i];
                    if (!a.alive) {
                        continue;
                    }
                    for (j = i + 1; j < players.length; j++) {
                        b = players[j];
                        if (!b.alive) {
                            continue;
                        }
                        overlapX = horizontalOverlapAmount(a.x, CFG.player.width, b.x, CFG.player.width);
                        overlapY = verticalOverlapAmount(a.y, CFG.player.height, b.y, CFG.player.height);
                        if (overlapX > 0 && overlapY > 18) {
                            direction = (a.x + CFG.player.width / 2) <= (b.x + CFG.player.width / 2) ? 1 : -1;
                            separation = (overlapX + 0.01) / 2;
                            a.x -= direction * separation;
                            b.x += direction * separation;
                        }
                    }
                }
            }

    function updatePlayerPhysics(player, time) {
                var inputX;
                if (!player.alive) {
                    return;
                }
                carryPlayerWithPlatform(player);
                inputX = computePlayerInputX(player);
                player.lastMoveX = inputX + player.kbx;
                player.x += player.lastMoveX;
                player.kbx = dampImpulse(player.kbx);
                applyPlayerVerticalMotion(player, time);
                if (player.y > CFG.world.loseY) {
                    player.lives = 0;
                    killPlayer(player, time);
                }
            }

    function cleanupPlatforms() {
                var i;
                for (i = platforms.length - 1; i >= 0; i--) {
                    if (platforms[i].x + platforms[i].w < state.leadX - CFG.world.cleanupBehind && platforms[i].el) {
                        removeElement(platforms[i].el);
                        platforms.splice(i, 1);
                    }
                }
            }

    function cleanupEnemiesBehindPlayers() {
                var i;
                var enemy;
                for (i = enemies.length - 1; i >= 0; i--) {
                    enemy = enemies[i];
                    if (enemy.hp > 0 && enemy.x + CFG.enemy.width < state.leadX - CFG.world.cleanupBehind) {
                        removeElement(enemy.el);
                        enemies.splice(i, 1);
                    }
                }
            }

    function cleanupPickups() {
                var i;
                for (i = pickups.length - 1; i >= 0; i--) {
                    if (pickups[i].x + pickups[i].w < state.leadX - CFG.world.cleanupBehind) {
                        removeElement(pickups[i].el);
                        pickups.splice(i, 1);
                    }
                }
            }

    function getSafeDashX(player, distance) {
                return player.x + distance;
            }

    function runMeleeAttack(player, time) {
                var hitX = player.facing === "left" ? player.x - CFG.player.attackRange : player.x + CFG.player.width;
                var hitY = player.y + 8;
                var hitW = CFG.player.attackRange;
                var hitH = CFG.player.height - 16;
                var i;
                var enemy;
                var other;
                var sourceX = player.x + (CFG.player.width / 2);
                for (i = 0; i < enemies.length; i++) {
                    enemy = enemies[i];
                    if (enemy.hp > 0 && rectsOverlap(hitX, hitY, hitW, hitH, enemy.x, enemy.y, CFG.enemy.width, CFG.enemy.height)) {
                        attackEnemy(enemy, 1, time, sourceX);
                    }
                }
                if (isVersusMode()) {
                    for (i = 0; i < players.length; i++) {
                        other = players[i];
                        if (other.id !== player.id && other.alive && rectsOverlap(hitX, hitY, hitW, hitH, other.x, other.y, CFG.player.width, CFG.player.height)) {
                            damagePlayer(other, 1, time, sourceX);
                        }
                    }
                }
            }

    function updateFireballs(time) {
                var i;
                var j;
                var fireball;
                var enemy;
                var frameY;
                var originPlayer = null;
                var playerTarget;
                for (i = fireballs.length - 1; i >= 0; i--) {
                    fireball = fireballs[i];
                    fireball.x += fireball.vx;
                    if (getPlatformCollisionAt(fireball.x, fireball.y, fireball.w, fireball.h)) {
                        removeElement(fireball.el);
                        fireballs.splice(i, 1);
                        continue;
                    }
                    frameY = Math.floor(time / 100) % 2 === 0 ? 0 : -20;
                    fireball.el.style.left = fireball.x + "px";
                    fireball.el.style.top = fireball.y + "px";
                    fireball.el.style.backgroundPosition = (fireball.vx > 0 ? -20 : 0) + "px " + frameY + "px";

                    if (isVersusMode()) {
                        for (j = 0; j < players.length; j++) {
                            playerTarget = players[j];
                            if (!playerTarget.alive || playerTarget.id === fireball.ownerId) {
                                continue;
                            }
                            if (rectsOverlap(fireball.x, fireball.y, fireball.w, fireball.h, playerTarget.x, playerTarget.y, CFG.player.width, CFG.player.height)) {
                                damagePlayer(playerTarget, 1, time, fireball.x + (fireball.w / 2));
                                removeElement(fireball.el);
                                fireballs.splice(i, 1);
                                fireball = null;
                                break;
                            }
                        }
                    } else {
                        for (j = 0; j < enemies.length; j++) {
                            enemy = enemies[j];
                            if (enemy.hp > 0 && rectsOverlap(fireball.x, fireball.y, fireball.w, fireball.h, enemy.x, enemy.y, CFG.enemy.width, CFG.enemy.height)) {
                                attackEnemy(enemy, 2, time, fireball.x + (fireball.w / 2));
                                removeElement(fireball.el);
                                fireballs.splice(i, 1);
                                fireball = null;
                                break;
                            }
                        }
                    }

                    if (fireball) {
                        originPlayer = null;
                        for (j = 0; j < players.length; j++) {
                            if (players[j].id === fireball.ownerId) {
                                originPlayer = players[j];
                                break;
                            }
                        }
                        if (!originPlayer) {
                            originPlayer = players[0];
                        }
                        if (originPlayer && Math.abs(fireball.x - originPlayer.x) > CFG.player.fireRange) {
                            removeElement(fireball.el);
                            fireballs.splice(i, 1);
                        }
                    }
                }
            }

    function enemyCanAttackTarget(enemy, player) {
                var gapX = horizontalGap(enemy.x, CFG.enemy.width, player.x, CFG.player.width);
                var gapY = verticalGap(enemy.y, CFG.enemy.height, player.y, CFG.player.height);
                var centerGap = Math.abs((enemy.x + (CFG.enemy.width / 2)) - (player.x + (CFG.player.width / 2)));
                return gapY <= CFG.enemy.attackGapY && (gapX <= CFG.enemy.attackGapX || centerGap <= CFG.enemy.width + 6);
            }

    function killPlayer(player, time) {
                var i;
                var winner = "";
                if (!player.alive) {
                    return;
                }
                player.alive = false;
                player.isAttacking = false;
                player.supportPlatform = null;
                player.kbx = 0;
                player.dy = 0;
                player.el.style.display = "none";
                player.swingEl.style.display = "none";

                if (isVersusMode()) {
                    player.waitingRespawn = false;
                    for (i = 0; i < players.length; i++) {
                        if (players[i].id !== player.id && players[i].alive) {
                            winner = players[i].label;
                            break;
                        }
                    }
                    endGame(winner);
                    return;
                }

                if (isCoopMode()) {
                    player.waitingRespawn = true;
                    player.respawnAt = time + 5000;
                    player.deathTime = time;
                    if (getAlivePlayersCount() === 0) {
                        endGame("");
                    }
                    return;
                }

                player.waitingRespawn = false;
                endGame("");
            }

    function updateRespawns(time) {
                var i;
                var player;
                var teammate;
                var platform;
                if (!isCoopMode()) {
                    return;
                }
                for (i = 0; i < players.length; i++) {
                    player = players[i];
                    if (!player.waitingRespawn || player.alive) {
                        continue;
                    }
                    if (getAlivePlayersCount() === 0) {
                        endGame("");
                        return;
                    }
                    if (time >= player.respawnAt) {
                        teammate = getFirstAlivePlayer();
                        if (!teammate) {
                            endGame("");
                            return;
                        }
                        player.alive = true;
                        player.waitingRespawn = false;
                        player.lives = CFG.player.maxLives;
                        player.isAttacking = false;
                        player.kbx = 0;
                        player.dy = 0;
                        player.extraJumpsLeft = getPlayerExtraJumpCount(player, time);
                        player.lastHit = time;
                        player.x = teammate.x + (player.id === 1 ? -70 : 70);
                        player.y = teammate.y - 120;
                        platform = findPlatformBelowEntity(player.x + CFG.player.width / 2, player.y + CFG.player.height - 12, 220);
                        if (platform) {
                            player.y = platform.y - CFG.player.height;
                            player.supportPlatform = platform;
                            player.onGround = true;
                        } else {
                            player.supportPlatform = null;
                            player.onGround = false;
                        }
                        player.el.style.display = "block";
                    }
                }
            }

    function constrainPlayersToView() {
                var i;
                var player;
                var width;
                var maxGap;
                var leftMost = null;
                var rightMost = null;
                var leftCenter;
                var rightCenter;
                var centerX;
                var gap;
                var overflow;
                var safeHalf;
                var minCenter;
                var maxCenter;
                var playerCenter;
                var clampedCenter;
                if (players.length < 2) {
                    return;
                }
                for (i = 0; i < players.length; i++) {
                    player = players[i];
                    if (!player.alive) {
                        continue;
                    }
                    if (!leftMost || player.x < leftMost.x) {
                        leftMost = player;
                    }
                    if (!rightMost || player.x > rightMost.x) {
                        rightMost = player;
                    }
                }
                if (!leftMost || !rightMost || leftMost.id === rightMost.id) {
                    return;
                }
                width = getViewportWidth();
                maxGap = Math.max(260, Math.floor(width * 0.46));
                leftCenter = leftMost.x + CFG.player.width / 2;
                rightCenter = rightMost.x + CFG.player.width / 2;
                gap = rightCenter - leftCenter;
                if (gap > maxGap) {
                    overflow = gap - maxGap;
                    leftMost.x += overflow * 0.5;
                    rightMost.x -= overflow * 0.5;
                    leftMost.kbx *= 0.5;
                    rightMost.kbx *= 0.5;
                    leftCenter = leftMost.x + CFG.player.width / 2;
                    rightCenter = rightMost.x + CFG.player.width / 2;
                }
                centerX = (leftCenter + rightCenter) * 0.5;
                safeHalf = Math.max(120, Math.floor(maxGap * 0.5));
                minCenter = centerX - safeHalf;
                maxCenter = centerX + safeHalf;
                for (i = 0; i < players.length; i++) {
                    player = players[i];
                    if (!player.alive) {
                        continue;
                    }
                    playerCenter = player.x + CFG.player.width / 2;
                    clampedCenter = clamp(playerCenter, minCenter, maxCenter);
                    if (clampedCenter !== playerCenter) {
                        player.x += clampedCenter - playerCenter;
                        player.kbx *= 0.5;
                    }
                }
            }

    function updateCamera() {
                var width = getViewportWidth();
                var height = getViewportHeight();
                var targetX = -state.focusX + (width / 2 - Math.floor(CFG.player.width / 2));
                var targetY = -state.focusY + (height / 2 - Math.floor(CFG.player.height / 2));
                state.camX += (targetX - state.camX) * CFG.camera.smooth;
                state.camY += (targetY - state.camY) * CFG.camera.smooth;
                dom.world.style.left = Math.floor(state.camX) + "px";
                dom.world.style.top = Math.floor(state.camY) + "px";
                updateParallax();
            }

    function gameLoop() {
                var time;
                var i;
                if (state.gameOver || !runtime.loopRunning) {
                    return;
                }
                time = nowMs();
                syncTimedEffects(time);
                updateRespawns(time);
                refreshFocusMetrics();
                cleanupPlatforms();
                cleanupEnemiesBehindPlayers();
                cleanupPickups();
                if (state.leadX > state.nextChunk - CFG.world.chunkTriggerOffset) {
                    generateChunk(state.nextChunk);
                    state.nextChunk += CFG.world.chunkSpacing;
                }
                updatePlatforms();
                updateFireballs(time);
                for (i = 0; i < players.length; i++) {
                    updatePlayerPhysics(players[i], time);
                }
                constrainPlayersToView();
                updateEnemies(time);
                resolveEnemyEnemyOverlaps();
                resolvePlayerEnemyOverlaps();
                resolvePlayerPlayerOverlaps();
                constrainPlayersToView();
                updatePickups(time);
                refreshFocusMetrics();
                updateCamera();
                updatePlayerVisuals(time);
                updateHud(time);
                if (window.afterGameLoopTick) {
                    afterGameLoopTick(time);
                }
                setTimeout(gameLoop, CFG.world.tickMs);
            }

    APP.expose("updatePlatforms", updatePlatforms);
    APP.expose("wasStandingOnPlatform", wasStandingOnPlatform);
    APP.expose("carryPlayerWithPlatform", carryPlayerWithPlatform);
    APP.expose("carryEnemyWithPlatform", carryEnemyWithPlatform);
    APP.expose("findTopLandingPlatform", findTopLandingPlatform);
    APP.expose("applyPlayerVerticalMotion", applyPlayerVerticalMotion);
    APP.expose("applyEnemyVerticalMotion", applyEnemyVerticalMotion);
    APP.expose("computePlayerInputX", computePlayerInputX);
    APP.expose("playerCanTakeDamage", playerCanTakeDamage);
    APP.expose("damagePlayer", damagePlayer);
    APP.expose("attackEnemy", attackEnemy);
    APP.expose("createFireball", createFireball);
    APP.expose("spawnFireball", spawnFireball);
    APP.expose("getPlatformCollisionAt", getPlatformCollisionAt);
    APP.expose("applyPickupToPlayer", applyPickupToPlayer);
    APP.expose("updatePickups", updatePickups);
    APP.expose("enemyHasGroundAhead", enemyHasGroundAhead);
    APP.expose("enemyFindJumpTarget", enemyFindJumpTarget);
    APP.expose("enemyFindDropTarget", enemyFindDropTarget);
    APP.expose("tryEnemyJump", tryEnemyJump);
    APP.expose("updateEnemies", updateEnemies);
    APP.expose("resolveEnemyEnemyOverlaps", resolveEnemyEnemyOverlaps);
    APP.expose("resolvePlayerEnemyOverlaps", resolvePlayerEnemyOverlaps);
    APP.expose("resolvePlayerPlayerOverlaps", resolvePlayerPlayerOverlaps);
    APP.expose("updatePlayerPhysics", updatePlayerPhysics);
    APP.expose("cleanupPlatforms", cleanupPlatforms);
    APP.expose("cleanupEnemiesBehindPlayers", cleanupEnemiesBehindPlayers);
    APP.expose("cleanupPickups", cleanupPickups);
    APP.expose("getSafeDashX", getSafeDashX);
    APP.expose("runMeleeAttack", runMeleeAttack);
    APP.expose("updateFireballs", updateFireballs);
    APP.expose("enemyCanAttackTarget", enemyCanAttackTarget);
    APP.expose("killPlayer", killPlayer);
    APP.expose("updateRespawns", updateRespawns);
    APP.expose("constrainPlayersToView", constrainPlayersToView);
    APP.expose("updateCamera", updateCamera);
    APP.expose("gameLoop", gameLoop);
})(window.InfinityRunner);
