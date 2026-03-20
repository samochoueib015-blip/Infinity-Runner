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

    function resetRuntimeState(mode, options) {
                var i;
                options = options || {};
                state.mode = mode || "solo";
                state.modePlayers = options.playerCount || (state.mode === "solo" ? 1 : 2);
                state.online.active = !!options.onlineActive;
                state.online.isHost = !!options.isHost;
                state.online.started = !!options.onlineActive;
                state.online.playerCount = state.modePlayers;
                state.online.localPlayerId = options.localPlayerId || 1;
                state.online.roomCode = options.roomCode || "";
                state.gameOver = false;
                state.started = true;
                state.camX = 0;
                state.camY = 0;
                state.score = 0;
                state.moonUntil = 0;
                state.leadX = 0;
                state.focusX = 0;
                state.focusY = 0;
                state.keys = {};
                if (window.resetInputs) {
                    resetInputs();
                }
                platforms.length = 0;
                enemies.length = 0;
                pickups.length = 0;
                fireballs.length = 0;
                for (i = 0; i < players.length; i++) {
                    if (window.releasePlayerActions) {
                        releasePlayerActions(players[i]);
                    }
                    removeElement(players[i].el);
                    removeElement(players[i].swingEl);
                }
                players.length = 0;
                if (dom.uiPlayers) {
                    dom.uiPlayers.innerHTML = "";
                }
                if (dom.gameOver) {
                    dom.gameOver.style.display = "none";
                }
            }

    function getSpawnPoints() {
                if (state.online && state.online.active) {
                    if (isVersusMode()) {
                        return [
                            { x: 140, y: 300 },
                            { x: 290, y: 300 },
                            { x: 440, y: 300 },
                            { x: 590, y: 300 }
                        ];
                    }
                    return [
                        { x: 36, y: 310 },
                        { x: 96, y: 310 },
                        { x: 156, y: 310 },
                        { x: 216, y: 310 }
                    ];
                }
                if (isVersusMode()) {
                    return [
                        { x: 182, y: 300 },
                        { x: 296, y: 300 }
                    ];
                }
                return [
                    { x: 36, y: 310 },
                    { x: 96, y: 310 },
                    { x: 156, y: 310 },
                    { x: 216, y: 310 }
                ];
            }

    function buildWorld() {
                var startPlatform;
                var startPlatform2;
                var startPlatform3;
                var startPlatform4;
                var startPlatform5;
                var startPlatform6;
                var startPlatform7;
                var firstChunkX = 1000;

                clearWorldNodes();
                buildTutorial();

                createPlatform(-620, 580, 2480, 62, "stationary", 0, 0, 0);
                startPlatform = createPlatform(120, 492, 192, 20, "stationary", 0, 0, 0);
                startPlatform2 = createPlatform(404, 386, 172, 20, "stationary", 0, 0, 0);
                startPlatform3 = createPlatform(694, 262, 156, 20, "stationary", 0, 0, 0);
                startPlatform4 = createPlatform(958, 144, 132, 20, "stationary", 0, 0, 0);
                startPlatform5 = createPlatform(584, 126, 116, 20, "stationary", 0, 0, 0);
                startPlatform6 = createPlatform(272, 252, 116, 20, "stationary", 0, 0, 0);
                startPlatform7 = createPlatform(820, 412, 124, 20, "stationary", 0, 0, 0);

                if (!isVersusMode()) {
                    spawnPickupOnPlatform("fire", startPlatform2, startPlatform2.x + Math.floor(startPlatform2.w / 2));
                }

                players.length = 0;
                dom.uiPlayers.innerHTML = "";

                (function () {
                    var spawnPoints = getSpawnPoints();
                    var i;
                    for (i = 0; i < state.modePlayers; i++) {
                        createPlayerState(i + 1, spawnPoints[i].x, spawnPoints[i].y);
                    }
                })();

                state.generatorY = isVersusMode() ? 360 : 404;
                state.chunkIndex = 0;
                generateChunk(firstChunkX);
                state.nextChunk = firstChunkX + CFG.world.chunkSpacing;
            }

    function startGame(mode, options) {
                if (runtime.loopRunning) {
                    return;
                }
                resetRuntimeState(mode, options);
                buildWorld();
                if (dom.startScreen) {
                    dom.startScreen.style.display = "none";
                    dom.startScreen.style.pointerEvents = "none";
                    dom.startScreen.setAttribute("aria-hidden", "true");
                    if (dom.startScreen.parentNode) {
                        dom.startScreen.parentNode.removeChild(dom.startScreen);
                    }
                    dom.startScreen = null;
                }
                updateHud(nowMs());
                updateHighscoreHud();
                if (window.syncTouchControlsForMode) {
                    syncTouchControlsForMode();
                }
                runtime.loopRunning = true;
                gameLoop();
            }

    function maybeSpawnEnemyForPlatform(platform, diff, guaranteedSafe) {
                var enemyChance;
                var typeRoll;
                var type;
                if (isVersusMode()) {
                    return;
                }
                if (guaranteedSafe || platform.w < 88) {
                    return;
                }
                enemyChance = CFG.generator.enemyBaseChance + diff * 0.08 + Math.min(0.14, state.chunkIndex * 0.02);
                if (enemyChance > CFG.generator.enemyMaxChance) {
                    enemyChance = CFG.generator.enemyMaxChance;
                }
                if (state.chunkIndex === 0 && platform.x < 1950) {
                    enemyChance = enemyChance * 0.24;
                }
                if (Math.random() >= enemyChance) {
                    return;
                }
                typeRoll = Math.random();
                if (typeRoll < 0.52 - diff * 0.08) {
                    type = 1;
                } else if (typeRoll < 0.83) {
                    type = 2;
                } else {
                    type = 3;
                }
                createEnemy(platform.x + clamp(Math.floor(platform.w / 2) - 22, 14, platform.w - CFG.enemy.width - 14), platform.y - CFG.enemy.height, type);
            }

    function getPlatformMovementBounds(platform) {
                return {
                    x: platform.baseX - (platform.moveRangeX || 0),
                    y: platform.baseY - (platform.moveRangeY || 0),
                    w: platform.w + (platform.moveRangeX || 0) * 2,
                    h: platform.h + (platform.moveRangeY || 0) * 2
                };
            }

    function canPlaceGeneratedPlatformAt(x, y, w, h, moveRangeX, moveRangeY) {
                var i;
                var p;
                var padX = 22;
                var padY = 44;
                var ax = x - moveRangeX - padX;
                var ay = y - moveRangeY - padY;
                var aw = w + (moveRangeX + padX) * 2;
                var ah = h + (moveRangeY + padY) * 2;
                var pb;
                for (i = 0; i < platforms.length; i++) {
                    p = platforms[i];
                    pb = getPlatformMovementBounds(p);
                    if (rectsOverlap(ax, ay, aw, ah, pb.x - padX, pb.y - padY, pb.w + padX * 2, pb.h + padY * 2)) {
                        return false;
                    }
                }
                return true;
            }

    function createGeneratedPlatform(x, y, w, moveType, diff) {
                var moveRangeX = 0;
                var moveRangeY = 0;
                var moveSpeed = 0;
                if (moveType === "horizontal") {
                    moveRangeX = randomRange(42, 108 + diff * 12);
                    moveSpeed = randomRange(0.018, 0.028 + diff * 0.002);
                } else if (moveType === "vertical") {
                    moveRangeY = randomRange(28, 74 + diff * 6);
                    moveSpeed = randomRange(0.018, 0.026 + diff * 0.002);
                } else if (moveType === "circle") {
                    moveRangeX = randomRange(28, 74 + diff * 8);
                    moveRangeY = randomRange(20, 56 + diff * 6);
                    moveSpeed = randomRange(0.018, 0.024 + diff * 0.002);
                }
                if (!canPlaceGeneratedPlatformAt(x, y, w, 20, moveRangeX, moveRangeY)) {
                    return null;
                }
                return createPlatform(x, y, w, 20, moveType, moveRangeX, moveRangeY, moveSpeed);
            }

    function tryCreateGeneratedPlatform(x, y, w, moveType, diff) {
                var yOffsets = [0, -160, 160, -84, 84, -236, 236, -308, 308];
                var xOffsets = [0, 18, -18, 36, -36, 54, -54];
                var i;
                var j;
                var candidate;
                var candidateW;
                for (i = 0; i < yOffsets.length; i++) {
                    for (j = 0; j < xOffsets.length; j++) {
                        candidateW = w - Math.max(0, i - 2) * 4;
                        if (candidateW < 74) {
                            candidateW = 74;
                        }
                        candidate = createGeneratedPlatform(
                            Math.floor(x + xOffsets[j]),
                            Math.floor(clamp(y + yOffsets[i], CFG.generator.minY, CFG.generator.maxY)),
                            Math.floor(candidateW),
                            moveType,
                            diff
                        );
                        if (candidate) {
                            return candidate;
                        }
                    }
                }
                return null;
            }

    function generateChunk(startX) {
                var diff = Math.min(state.score / 70, 4);
                var x = startX + 38;
                var y = state.generatorY;
                var i;
                var gap;
                var stepY;
                var width;
                var moveType;
                var main;
                var upper;
                var upper2;
                var lower;
                var cross;
                var safeEarly = state.chunkIndex < 2;
                var mainCount = CFG.generator.mainCount + (state.chunkIndex > 3 ? 1 : 0);
                var branchWidth;
                var branchX;
                var branchY;
                var lowerY;

                for (i = 0; i < mainCount; i++) {
                    if (safeEarly && i < 3) {
                        gap = randomRange(126, 176);
                        stepY = randomRange(-56, 30);
                    } else {
                        gap = randomRange(CFG.generator.baseGapMin + diff * 8, CFG.generator.baseGapMax + diff * 18);
                        stepY = randomRange(-184 - diff * 12, 132);
                        if (Math.random() < 0.58) {
                            stepY -= randomRange(18, 66 + diff * 12);
                        }
                    }

                    x += gap;
                    y = clamp(y + stepY, safeEarly ? 230 : 120, CFG.generator.maxY);
                    width = Math.floor(randomRange(safeEarly ? 142 : 106, 188 - diff * 8));
                    if (width < 98) {
                        width = 98;
                    }

                    moveType = chooseMoveType(i, mainCount, diff, false);
                    main = tryCreateGeneratedPlatform(x, y, width, moveType, diff);
                    if (!main) {
                        main = tryCreateGeneratedPlatform(x, clamp(y - 96, CFG.generator.minY, CFG.generator.maxY), width, "stationary", diff * 0.6);
                    }
                    if (!main) {
                        continue;
                    }

                    maybeSpawnEnemyForPlatform(main, diff, safeEarly && i < 2);
                    maybeSpawnPlatformPickup(main);

                    if (Math.random() < (safeEarly ? 0.38 : 0.84)) {
                        branchWidth = Math.floor(randomRange(84, 144));
                        branchY = clamp(main.y - randomRange(134, 238), CFG.generator.minY, CFG.generator.maxY - 140);
                        branchX = main.x + randomRange(-12, Math.max(12, main.w - branchWidth + 12));
                        upper = tryCreateGeneratedPlatform(branchX, branchY, branchWidth, chooseMoveType(i, mainCount, diff, true), diff * 0.76);
                        if (upper) {
                            maybeSpawnPlatformPickup(upper);
                            maybeSpawnEnemyForPlatform(upper, diff * 0.78, true);

                            if (!safeEarly && Math.random() < 0.36) {
                                upper2 = tryCreateGeneratedPlatform(
                                    upper.x + randomRange(-26, 34),
                                    upper.y - randomRange(124, 214),
                                    Math.floor(randomRange(74, 118)),
                                    chooseMoveType(i, mainCount, diff, true),
                                    diff * 0.62
                                );
                                if (upper2) {
                                    maybeSpawnPlatformPickup(upper2);
                                }
                            }
                        }
                    }

                    if (!safeEarly && Math.random() < 0.62) {
                        lowerY = clamp(main.y + randomRange(144, 244), CFG.generator.minY + 110, CFG.generator.maxY);
                        lower = tryCreateGeneratedPlatform(
                            main.x + randomRange(-24, Math.max(22, main.w - 92)),
                            lowerY,
                            Math.floor(randomRange(88, 144)),
                            chooseMoveType(i, mainCount, diff, true),
                            diff * 0.68
                        );
                        if (lower) {
                            maybeSpawnPlatformPickup(lower);
                            if (Math.random() < 0.18 + diff * 0.05) {
                                maybeSpawnEnemyForPlatform(lower, diff * 0.72, false);
                            }
                        }
                    }

                    if (!safeEarly && Math.random() < 0.32) {
                        cross = tryCreateGeneratedPlatform(
                            x + randomRange(20, Math.max(26, gap - 20)),
                            main.y + randomRange(-118, 118),
                            Math.floor(randomRange(72, 118)),
                            chooseMoveType(i, mainCount, diff, true),
                            diff * 0.54
                        );
                        if (cross) {
                            maybeSpawnPlatformPickup(cross);
                        }
                    }
                }

                state.generatorY = clamp(y + randomRange(-36, 42), 210, 490);
                state.chunkIndex++;
            }

    APP.expose("resetRuntimeState", resetRuntimeState);
    APP.expose("buildWorld", buildWorld);
    APP.expose("startGame", startGame);
    APP.expose("maybeSpawnEnemyForPlatform", maybeSpawnEnemyForPlatform);
    APP.expose("getPlatformMovementBounds", getPlatformMovementBounds);
    APP.expose("canPlaceGeneratedPlatformAt", canPlaceGeneratedPlatformAt);
    APP.expose("createGeneratedPlatform", createGeneratedPlatform);
    APP.expose("tryCreateGeneratedPlatform", tryCreateGeneratedPlatform);
    APP.expose("generateChunk", generateChunk);
})(window.InfinityRunner);
