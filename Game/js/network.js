(function (APP) {
    "use strict";

    var state = APP.state;
    var dom = APP.dom;
    var platforms = APP.entities.platforms;
    var enemies = APP.entities.enemies;
    var pickups = APP.entities.pickups;
    var fireballs = APP.entities.fireballs;
    var players = APP.entities.players;
    var runtime = APP.runtime;
    var socket = null;
    var socketScriptLoading = false;
    var socketScriptLoaded = false;
    var hostSnapshotIntervalMs = 16;
    var hostSnapshotLastSentAt = 0;
    var guestLoopHandle = 0;
    var guestLoopTimer = 0;

    function $(id) {
        return document.getElementById(id);
    }

    function setOnlineStatus(message, isError) {
        state.online.message = message || "";
        if (dom.onlineStatus) {
            dom.onlineStatus.textContent = message || "";
            dom.onlineStatus.style.color = isError ? "#b00020" : "#111";
        }
    }

    function ensureOnlinePanelContainer() {
        var outer = $("online-panel");
        var duplicateButton = $("open-online-lobby-btn");
        if (outer) {
            outer.style.display = "block";
        }
        if (duplicateButton) {
            duplicateButton.style.display = "none";
        }
    }

    function resetOnlineState() {
        state.online.active = false;
        state.online.isHost = false;
        state.online.connected = !!socket;
        state.online.roomCode = "";
        state.online.mode = "coop";
        state.online.playerCount = 0;
        state.online.localPlayerId = 1;
        state.online.started = false;
        state.online.lobbyPlayers = [];
        state.online.lastSnapshotAt = 0;
        state.online.lastServerCamX = 0;
        state.online.lastServerCamY = 0;
        stopGuestLoop();
    }

    function getOnlineNickname() {
        var input = $("online-nickname");
        var value = input ? trimString(input.value) : "";
        if (!value) {
            value = "Spieler";
        }
        value = value.replace(/\s+/g, " ");
        if (value.length > 16) {
            value = value.slice(0, 16);
        }
        try {
            window.localStorage.setItem("infinity_runner_online_nickname", value);
        } catch (err) {
        }
        return value;
    }

    function restoreOnlineNickname() {
        var input = $("online-nickname");
        var saved = "";
        if (!input) {
            return;
        }
        try {
            saved = window.localStorage.getItem("infinity_runner_online_nickname") || "";
        } catch (err) {
            saved = "";
        }
        saved = trimString(saved);
        if (!saved) {
            saved = "Spieler";
        }
        input.value = saved.slice(0, 16);
    }

    function applyOnlinePlayerLabels(playerInfos) {
        var byId = {};
        var i;
        var info;
        var player;
        for (i = 0; i < (playerInfos || []).length; i++) {
            info = playerInfos[i];
            byId[info.playerId] = info.label;
        }
        for (i = 0; i < players.length; i++) {
            player = players[i];
            if (byId[player.id]) {
                player.label = byId[player.id];
                if (player.hud && player.hud.title) {
                    player.hud.title.textContent = player.label;
                }
            }
        }
    }

    function renderLobbyState(payload) {
        var list = $("online-room-player-list");
        var roomCodeDisplay = $("online-room-code-display");
        var roomModeDisplay = $("online-room-mode-display");
        var startButton = $("start-online-room-btn");
        var lobby = dom.onlineLobby || $("online-lobby");
        var i;
        var item;
        state.online.roomCode = payload.code;
        state.online.mode = payload.mode;
        state.online.lobbyPlayers = payload.players || [];
        if (roomCodeDisplay) {
            roomCodeDisplay.textContent = payload.code || "----";
        }
        if (roomModeDisplay) {
            roomModeDisplay.textContent = payload.mode === "versus" ? "PvP" : "Koop";
        }
        if (list) {
            list.innerHTML = "";
            for (i = 0; i < state.online.lobbyPlayers.length; i++) {
                item = document.createElement("li");
                item.textContent = state.online.lobbyPlayers[i].label + (state.online.lobbyPlayers[i].isHost ? " (Host)" : "");
                list.appendChild(item);
            }
        }
        if (lobby) {
            lobby.style.display = state.online.roomCode ? "block" : "none";
        }
        if (startButton) {
            startButton.disabled = !(payload.isHost && (payload.players || []).length >= 2 && !payload.started);
            startButton.style.display = payload.isHost ? "inline-block" : "inline-block";
        }
        if (dom.onlinePanel) {
            dom.onlinePanel.style.display = "block";
        }
        if (!payload.started) {
            setOnlineStatus(payload.isHost ? "Raum erstellt. Teile den PIN und starte, sobald mindestens 2 Spieler im Raum sind." : "Raum betreten. Warte auf den Host.", false);
        }
    }

    function closeStartOverlay() {
        if (dom.startScreen) {
            dom.startScreen.style.display = "none";
            dom.startScreen.style.pointerEvents = "none";
            dom.startScreen.setAttribute("aria-hidden", "true");
            if (dom.startScreen.parentNode) {
                dom.startScreen.parentNode.removeChild(dom.startScreen);
            }
            dom.startScreen = null;
        }
    }

    function getOnlineSpawnPoints(mode) {
        if (mode === "versus") {
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

    function prepareOnlineGuestGame(payload) {
        var i;
        var spawns = getOnlineSpawnPoints(payload.mode);
        resetRuntimeState(payload.mode, {
            onlineActive: true,
            isHost: false,
            playerCount: payload.players.length,
            localPlayerId: payload.localPlayerId,
            roomCode: payload.roomCode
        });
        clearWorldNodes();
        buildTutorial();
        players.length = 0;
        if (dom.uiPlayers) {
            dom.uiPlayers.innerHTML = "";
        }
        for (i = 0; i < payload.players.length; i++) {
            createPlayerState(payload.players[i].playerId, spawns[i].x, spawns[i].y);
        }
        applyOnlinePlayerLabels(payload.players);
        closeStartOverlay();
        if (dom.world) {
            applyGuestMotionStyle(dom.world, false);
        }
        runtime.loopRunning = false;
        state.online.lastSnapshotAt = 0;
        stopGuestLoop();
        if (window.syncTouchControlsForMode) {
            syncTouchControlsForMode();
        }
        updateHud(nowMs());
        updateHighscoreHud();
        setOnlineStatus("Online-Runde läuft.", false);
    }


    function applyGuestMotionStyle(el, includeBackground) {
        if (!el || el.getAttribute("data-guest-motion") === "1") {
            return;
        }
        el.setAttribute("data-guest-motion", "1");
        el.style.willChange = includeBackground ? "left, top, background-position" : "left, top";
        el.style.transition = "none";
    }

    function getLocalGuestPlayer() {
        var i;
        if (!(state.online && state.online.active && !state.online.isHost && state.online.started)) {
            return null;
        }
        for (i = 0; i < players.length; i++) {
            if (players[i].id === state.online.localPlayerId) {
                return players[i];
            }
        }
        return null;
    }

    function stepToward(current, target, factor, snapDistance) {
        if (typeof target !== "number" || isNaN(target)) {
            return current;
        }
        if (typeof current !== "number" || isNaN(current) || Math.abs(target - current) >= snapDistance) {
            return target;
        }
        return current + (target - current) * factor;
    }

    function reconcilePredictedPlayer(player) {
        if (!player) {
            return;
        }
        player.x = stepToward(player.x, player.netX, 0.24, 120);
        player.y = stepToward(player.y, player.netY, 0.30, 140);
        player.dy = stepToward(player.dy, player.netDy, 0.22, 18);
        player.kbx = stepToward(player.kbx, player.netKbx, 0.20, 12);
        if (typeof player.netFacing === "string") {
            player.facing = player.netFacing;
        }
        player.isMoving = !!player.netIsMoving || !!(player.inputState && (player.inputState.left || player.inputState.right));
        player.isAttacking = !!player.netIsAttacking || !!player.isAttacking;
        if (player.netAlive === false) {
            player.alive = false;
        }
    }

    function applyRemoteInterpolation(time) {
        var i;
        var player;
        var fireball;
        var frameY;
        var localPlayer = getLocalGuestPlayer();
        for (i = 0; i < players.length; i++) {
            player = players[i];
            if (!player) {
                continue;
            }
            if (localPlayer && player.id === localPlayer.id) {
                reconcilePredictedPlayer(player);
            } else {
                player.x = stepToward(player.x, player.netX, 0.38, 90);
                player.y = stepToward(player.y, player.netY, 0.42, 100);
                player.dy = stepToward(player.dy, player.netDy, 0.28, 18);
                player.kbx = stepToward(player.kbx, player.netKbx, 0.25, 12);
                if (typeof player.netFacing === "string") {
                    player.facing = player.netFacing;
                }
                player.isMoving = !!player.netIsMoving;
                player.isAttacking = !!player.netIsAttacking;
                player.alive = player.netAlive !== false;
            }
        }
        for (i = 0; i < platforms.length; i++) {
            platforms[i].x = stepToward(platforms[i].x, platforms[i].netX, 0.45, 80);
            platforms[i].y = stepToward(platforms[i].y, platforms[i].netY, 0.45, 80);
            platforms[i].el.style.left = platforms[i].x + "px";
            platforms[i].el.style.top = platforms[i].y + "px";
        }
        for (i = 0; i < enemies.length; i++) {
            enemies[i].x = stepToward(enemies[i].x, enemies[i].netX, 0.38, 90);
            enemies[i].y = stepToward(enemies[i].y, enemies[i].netY, 0.42, 100);
            enemies[i].el.style.left = enemies[i].x + "px";
            enemies[i].el.style.top = enemies[i].y + "px";
        }
        for (i = 0; i < pickups.length; i++) {
            pickups[i].x = stepToward(pickups[i].x, pickups[i].netX, 0.34, 60);
            pickups[i].y = stepToward(pickups[i].y, pickups[i].netY, 0.34, 60);
            pickups[i].el.style.left = pickups[i].x + "px";
            pickups[i].el.style.top = pickups[i].y + "px";
        }
        for (i = 0; i < fireballs.length; i++) {
            fireball = fireballs[i];
            fireball.x = stepToward(fireball.x, fireball.netX, 0.55, 120);
            fireball.y = stepToward(fireball.y, fireball.netY, 0.55, 120);
            frameY = Math.floor(time / 100) % 2 === 0 ? 0 : -20;
            fireball.el.style.left = Math.floor(fireball.x) + "px";
            fireball.el.style.top = Math.floor(fireball.y) + "px";
            fireball.el.style.backgroundPosition = (fireball.vx > 0 ? -20 : 0) + "px " + frameY + "px";
        }
    }

    function stopGuestLoop() {
        if (guestLoopHandle && window.cancelAnimationFrame) {
            window.cancelAnimationFrame(guestLoopHandle);
        }
        if (guestLoopTimer) {
            window.clearTimeout(guestLoopTimer);
        }
        guestLoopHandle = 0;
        guestLoopTimer = 0;
    }

    function guestTick() {
        var time = nowMs();
        var localPlayer;
        if (!(state.online && state.online.active && !state.online.isHost && state.online.started)) {
            stopGuestLoop();
            return;
        }
        localPlayer = getLocalGuestPlayer();
        if (localPlayer && localPlayer.alive) {
            updatePlayerPhysics(localPlayer, time);
        }
        applyRemoteInterpolation(time);
        refreshFocusMetrics();
        updateCamera();
        updatePlayerVisuals(time);
        updateHud(time);
        if (window.requestAnimationFrame) {
            guestLoopHandle = window.requestAnimationFrame(guestTick);
        } else {
            guestLoopTimer = window.setTimeout(guestTick, 16);
        }
    }

    function startGuestLoop() {
        stopGuestLoop();
        guestTick();
    }

    function createRemoteFireball(snapshotFireball) {
        var fireball = {
            ownerId: snapshotFireball.ownerId,
            x: snapshotFireball.x,
            y: snapshotFireball.y,
            vx: snapshotFireball.vx,
            w: snapshotFireball.w,
            h: snapshotFireball.h,
            el: null
        };
        var el = document.createElement("div");
        el.className = "fireball";
        dom.world.appendChild(el);
        applyGuestMotionStyle(el, true);
        fireball.el = el;
        fireballs.push(fireball);
        return fireball;
    }

    function syncPlatforms(list) {
        var i;
        var platform;
        var visual;
        while (platforms.length < list.length) {
            createPlatform(0, 0, 100, 20, "stationary", 0, 0, 0);
        }
        while (platforms.length > list.length) {
            removeElement(platforms[platforms.length - 1].el);
            platforms.pop();
        }
        for (i = 0; i < list.length; i++) {
            platform = platforms[i];
            applyGuestMotionStyle(platform.el, false);
            platform.netX = list[i].x;
            platform.netY = list[i].y;
            if (!state.online.lastSnapshotAt) {
                platform.x = platform.netX;
                platform.y = platform.netY;
            }
            platform.w = list[i].w;
            platform.h = list[i].h;
            platform.moveType = list[i].moveType;
            visual = getPlatformVisual(platform.moveType);
            platform.el.style.left = platform.x + "px";
            platform.el.style.top = platform.y + "px";
            platform.el.style.width = platform.w + "px";
            platform.el.style.height = platform.h + "px";
            platform.el.style.backgroundColor = visual.color;
            platform.el.style.borderColor = visual.border;
        }
    }

    function syncEnemies(list) {
        var i;
        var enemy;
        while (enemies.length < list.length) {
            createEnemy(0, 0, 1);
        }
        while (enemies.length > list.length) {
            removeElement(enemies[enemies.length - 1].el);
            enemies.pop();
        }
        for (i = 0; i < list.length; i++) {
            enemy = enemies[i];
            applyGuestMotionStyle(enemy.el, false);
            enemy.type = list[i].type;
            enemy.hp = list[i].hp;
            enemy.netX = list[i].x;
            enemy.netY = list[i].y;
            enemy.x = !state.online.lastSnapshotAt ? enemy.netX : enemy.x;
            enemy.y = !state.online.lastSnapshotAt ? enemy.netY : enemy.y;
            enemy.dy = list[i].dy;
            enemy.kbx = list[i].kbx;
            enemy.isAttacking = list[i].isAttacking;
            enemy.lastHit = list[i].lastHit;
            enemy.deathTime = list[i].deathTime;
            enemy.cleanupAt = list[i].cleanupAt;
            enemy.face = list[i].face;
            enemy.scored = list[i].scored;
            enemy.el.className = "enemy" + enemy.type;
            enemy.el.style.left = enemy.x + "px";
            enemy.el.style.top = enemy.y + "px";
            enemy.el.style.display = enemy.cleanupAt && list[i].removed ? "none" : "block";
        }
    }

    function syncPickups(list) {
        var i;
        var pickup;
        while (pickups.length < list.length) {
            createPickup("heart", 0, 0, null);
        }
        while (pickups.length > list.length) {
            removeElement(pickups[pickups.length - 1].el);
            pickups.pop();
        }
        for (i = 0; i < list.length; i++) {
            pickup = pickups[i];
            applyGuestMotionStyle(pickup.el, false);
            pickup.kind = list[i].kind;
            pickup.netX = list[i].x;
            pickup.netY = list[i].y;
            pickup.x = !state.online.lastSnapshotAt ? pickup.netX : pickup.x;
            pickup.y = !state.online.lastSnapshotAt ? pickup.netY : pickup.y;
            pickup.baseX = list[i].baseX;
            pickup.baseY = list[i].baseY;
            pickup.bobPhase = list[i].bobPhase;
            pickup.el.className = list[i].className;
            pickup.el.style.left = pickup.x + "px";
            pickup.el.style.top = pickup.y + "px";
        }
    }

    function syncFireballs(list, time) {
        var i;
        var fireball;
        var frameY;
        while (fireballs.length < list.length) {
            createRemoteFireball(list[fireballs.length]);
        }
        while (fireballs.length > list.length) {
            removeElement(fireballs[fireballs.length - 1].el);
            fireballs.pop();
        }
        for (i = 0; i < list.length; i++) {
            fireball = fireballs[i];
            applyGuestMotionStyle(fireball.el, true);
            fireball.ownerId = list[i].ownerId;
            fireball.netX = list[i].x;
            fireball.netY = list[i].y;
            fireball.x = !state.online.lastSnapshotAt ? fireball.netX : fireball.x;
            fireball.y = !state.online.lastSnapshotAt ? fireball.netY : fireball.y;
            fireball.vx = list[i].vx;
            fireball.w = list[i].w;
            fireball.h = list[i].h;
            frameY = Math.floor(nowMs() / 100) % 2 === 0 ? 0 : -20;
            fireball.el.style.left = Math.floor(fireball.x) + "px";
            fireball.el.style.top = Math.floor(fireball.y) + "px";
            fireball.el.style.backgroundPosition = (fireball.vx > 0 ? -20 : 0) + "px " + frameY + "px";
        }
    }

    function syncPlayers(list) {
        var i;
        var player;
        for (i = 0; i < list.length; i++) {
            player = players[i];
            if (!player || player.id !== list[i].id) {
                continue;
            }
            player.label = list[i].label;
            player.netX = list[i].x;
            player.netY = list[i].y;
            player.netDy = list[i].dy;
            player.netKbx = list[i].kbx;
            player.netFacing = list[i].facing;
            player.netIsMoving = list[i].isMoving;
            player.netIsAttacking = list[i].isAttacking;
            player.netAlive = list[i].alive;
            if (!state.online.lastSnapshotAt) {
                player.x = player.netX;
                player.y = player.netY;
                player.dy = player.netDy;
                player.kbx = player.netKbx;
                player.facing = player.netFacing;
            }
            if (player.id !== state.online.localPlayerId) {
                player.x = stepToward(player.x, player.netX, 0.60, 120);
                player.y = stepToward(player.y, player.netY, 0.60, 140);
                player.dy = player.netDy;
                player.kbx = player.netKbx;
                player.facing = player.netFacing;
            }
            player.spawnX = list[i].spawnX;
            player.spawnY = list[i].spawnY;
            player.onGround = list[i].onGround;
            player.extraJumpsLeft = list[i].extraJumpsLeft;
            player.isMoving = list[i].isMoving;
            player.isAttacking = list[i].isAttacking;
            player.lives = list[i].lives;
            player.fireAmmo = list[i].fireAmmo;
            player.lastHit = list[i].lastHit;
            player.lastDashTime = list[i].lastDashTime;
            player.lastAttackTime = list[i].lastAttackTime;
            player.lastFireTime = list[i].lastFireTime;
            player.bootsUntil = list[i].bootsUntil;
            player.lastMoveX = list[i].lastMoveX;
            if (player.id !== state.online.localPlayerId) {
                player.alive = list[i].alive;
            }
            player.waitingRespawn = list[i].waitingRespawn;
            player.respawnAt = list[i].respawnAt;
            player.deathTime = list[i].deathTime;
            player.baseSprite = list[i].baseSprite;
            player.bootsSprite = list[i].bootsSprite;
            applyGuestMotionStyle(player.el, false);
            applyGuestMotionStyle(player.swingEl, false);
            if (player.hud && player.hud.title) {
                player.hud.title.textContent = player.label;
            }
        }
    }

    function applySnapshot(snapshot) {
        var time = snapshot.time || nowMs();
        if (!(state.online && state.online.active) || state.online.isHost) {
            return;
        }
        state.mode = snapshot.mode;
        state.modePlayers = snapshot.players.length;
        state.score = snapshot.score;
        state.online.lastServerCamX = snapshot.camX;
        state.online.lastServerCamY = snapshot.camY;
        state.moonUntil = snapshot.moonUntil;
        state.gameOver = snapshot.gameOver;
        syncPlatforms(snapshot.platforms || []);
        syncEnemies(snapshot.enemies || []);
        syncPickups(snapshot.pickups || []);
        syncFireballs(snapshot.fireballs || [], time);
        syncPlayers(snapshot.players || []);
        state.online.lastSnapshotAt = time;
        if (!guestLoopHandle && !guestLoopTimer) {
            startGuestLoop();
        }
        refreshFocusMetrics();
        updatePlayerVisuals(time);
        updateHud(time);
        if (!guestLoopHandle && !guestLoopTimer) {
            updateCamera();
        }
        if (snapshot.overlay) {
            setText(dom.gameOverTitle, snapshot.overlay.title || "Runde beendet");
            setText(dom.gameOverScore, snapshot.overlay.score || "");
            setText(dom.gameOverRecord, snapshot.overlay.record || "");
            setText(dom.gameOverExtra, snapshot.overlay.extra || "");
            dom.gameOver.style.display = snapshot.overlay.visible ? "block" : "none";
        }
    }

    function captureSnapshot(time) {
        var i;
        return {
            roomCode: state.online.roomCode,
            mode: state.mode,
            score: state.score,
            camX: state.camX,
            camY: state.camY,
            moonUntil: state.moonUntil,
            gameOver: state.gameOver,
            time: time,
            players: players.map(function (player) {
                return {
                    id: player.id,
                    label: player.label,
                    x: player.x,
                    y: player.y,
                    spawnX: player.spawnX,
                    spawnY: player.spawnY,
                    dy: player.dy,
                    kbx: player.kbx,
                    facing: player.facing,
                    onGround: player.onGround,
                    extraJumpsLeft: player.extraJumpsLeft,
                    isMoving: player.isMoving,
                    isAttacking: player.isAttacking,
                    lives: player.lives,
                    fireAmmo: player.fireAmmo,
                    lastHit: player.lastHit,
                    lastDashTime: player.lastDashTime,
                    lastAttackTime: player.lastAttackTime,
                    lastFireTime: player.lastFireTime,
                    bootsUntil: player.bootsUntil,
                    lastMoveX: player.lastMoveX,
                    alive: player.alive,
                    waitingRespawn: player.waitingRespawn,
                    respawnAt: player.respawnAt,
                    deathTime: player.deathTime,
                    baseSprite: player.baseSprite,
                    bootsSprite: player.bootsSprite
                };
            }),
            platforms: platforms.map(function (platform) {
                return {
                    x: platform.x,
                    y: platform.y,
                    w: platform.w,
                    h: platform.h,
                    moveType: platform.moveType
                };
            }),
            enemies: enemies.map(function (enemy) {
                return {
                    x: enemy.x,
                    y: enemy.y,
                    dy: enemy.dy,
                    kbx: enemy.kbx,
                    type: enemy.type,
                    hp: enemy.hp,
                    isAttacking: enemy.isAttacking,
                    lastHit: enemy.lastHit,
                    deathTime: enemy.deathTime,
                    cleanupAt: enemy.cleanupAt,
                    scored: enemy.scored,
                    face: enemy.face
                };
            }),
            pickups: pickups.map(function (pickup) {
                return {
                    kind: pickup.kind,
                    x: pickup.x,
                    y: pickup.y,
                    baseX: pickup.baseX,
                    baseY: pickup.baseY,
                    bobPhase: pickup.bobPhase,
                    className: pickup.el ? pickup.el.className : "pickup-heart"
                };
            }),
            fireballs: fireballs.map(function (fireball) {
                return {
                    ownerId: fireball.ownerId,
                    x: fireball.x,
                    y: fireball.y,
                    vx: fireball.vx,
                    w: fireball.w,
                    h: fireball.h
                };
            }),
            overlay: {
                visible: !!(dom.gameOver && dom.gameOver.style.display === "block"),
                title: dom.gameOverTitle ? dom.gameOverTitle.textContent : "",
                score: dom.gameOverScore ? dom.gameOverScore.textContent : "",
                record: dom.gameOverRecord ? dom.gameOverRecord.textContent : "",
                extra: dom.gameOverExtra ? dom.gameOverExtra.textContent : ""
            }
        };
    }

    function afterGameLoopTick(time) {
        if (!socket || !(state.online && state.online.active && state.online.isHost && state.online.started)) {
            return;
        }
        if (time - hostSnapshotLastSentAt < hostSnapshotIntervalMs) {
            return;
        }
        hostSnapshotLastSentAt = time;
        socket.emit("host-snapshot", captureSnapshot(time));
    }

    function ensureSocketClient(callback) {
        if (window.io) {
            socketScriptLoaded = true;
            callback();
            return;
        }
        if (socketScriptLoading) {
            setOnlineStatus("Lade Online-Client ...", false);
            return;
        }
        socketScriptLoading = true;
        setOnlineStatus("Lade Online-Client ...", false);
        (function () {
            var script = document.createElement("script");
            script.src = "/socket.io/socket.io.js";
            script.onload = function () {
                socketScriptLoading = false;
                socketScriptLoaded = true;
                callback();
            };
            script.onerror = function () {
                socketScriptLoading = false;
                setOnlineStatus("Online-Modus benötigt den Node-Server. Starte die Seite über den Server, nicht direkt als Datei.", true);
            };
            document.head.appendChild(script);
        })();
    }

    function bindSocketEvents() {
        if (!socket || socket._infinityRunnerBound) {
            return;
        }
        socket._infinityRunnerBound = true;

        socket.on("connect", function () {
            state.online.connected = true;
            setOnlineStatus("Mit Online-Server verbunden.", false);
        });

        socket.on("disconnect", function () {
            state.online.connected = false;
            setOnlineStatus("Verbindung zum Online-Server getrennt.", true);
            stopGuestLoop();
            if (state.online.active && state.online.started) {
                setText(dom.gameOverTitle, "Verbindung getrennt");
                setText(dom.gameOverScore, "Die Online-Runde wurde beendet.");
                setText(dom.gameOverRecord, "");
                setText(dom.gameOverExtra, "Lade die Seite neu, um erneut beizutreten.");
                dom.gameOver.style.display = "block";
            }
        });

        socket.on("room-state", function (payload) {
            renderLobbyState(payload);
        });

        socket.on("room-error", function (payload) {
            setOnlineStatus(payload && payload.message ? payload.message : "Online-Fehler.", true);
        });

        socket.on("room-closed", function (payload) {
            setOnlineStatus(payload && payload.message ? payload.message : "Raum wurde geschlossen.", true);
            if (state.online.started) {
                setText(dom.gameOverTitle, "Online-Raum beendet");
                setText(dom.gameOverScore, payload && payload.message ? payload.message : "Der Raum ist nicht mehr verfügbar.");
                setText(dom.gameOverRecord, "");
                setText(dom.gameOverExtra, "Bitte Seite neu laden, um neu zu starten.");
                dom.gameOver.style.display = "block";
            }
        });

        socket.on("room-start", function (payload) {
            state.online.active = true;
            state.online.mode = payload.mode;
            state.online.playerCount = payload.players.length;
            state.online.localPlayerId = payload.localPlayerId;
            state.online.roomCode = payload.roomCode;
            state.online.started = true;
            state.online.lobbyPlayers = payload.players;
            if (payload.isHost) {
                startGame(payload.mode, {
                    onlineActive: true,
                    isHost: true,
                    playerCount: payload.players.length,
                    localPlayerId: payload.localPlayerId,
                    roomCode: payload.roomCode
                });
                applyOnlinePlayerLabels(payload.players);
                hostSnapshotLastSentAt = 0;
                if (socket) {
                    socket.emit("host-snapshot", captureSnapshot(nowMs()));
                }
                setOnlineStatus("Online-Runde gestartet. Du bist Host.", false);
            } else {
                prepareOnlineGuestGame(payload);
            }
        });

        socket.on("snapshot", function (payload) {
            applySnapshot(payload);
        });

        socket.on("remote-input-state", function (payload) {
            if (state.online.active && state.online.isHost) {
                setPlayerAction(payload.playerId, payload.action, payload.isPressed);
            }
        });

        socket.on("remote-input-trigger", function (payload) {
            if (state.online.active && state.online.isHost) {
                triggerPlayerAction(payload.playerId, payload.action, nowMs());
            }
        });
    }

    function ensureConnected(callback) {
        ensureSocketClient(function () {
            if (socket && socket.connected) {
                bindSocketEvents();
                callback();
                return;
            }
            if (!socket) {
                socket = window.io({ transports: ["websocket", "polling"] });
                bindSocketEvents();
            }
            if (socket.connected) {
                callback();
            } else {
                socket.once("connect", callback);
            }
        });
    }

    function toggleOnlinePanel() {
        var visible;
        var startPanel = $("start-panel");
        var startScreen = $("start-screen");
        ensureOnlinePanelContainer();
        if (!dom.onlinePanel) {
            dom.onlinePanel = $("online-card");
        }
        visible = dom.onlinePanel && dom.onlinePanel.style.display === "block";
        if (dom.onlinePanel) {
            dom.onlinePanel.style.display = visible ? "none" : "block";
        }
        if (startPanel) {
            if (visible) {
                startPanel.classList.remove("online-open");
            } else {
                startPanel.classList.add("online-open");
            }
        }
        if (startScreen) {
            if (visible) {
                startScreen.classList.remove("online-scroll");
                startScreen.scrollTop = 0;
            } else {
                startScreen.classList.add("online-scroll");
            }
        }
        if (!visible) {
            ensureConnected(function () {
                setOnlineStatus("Online-Menü bereit.", false);
            });
        }
    }

    function createOnlineRoom(mode) {
        ensureConnected(function () {
            socket.emit("create-room", {
                mode: mode,
                nickname: getOnlineNickname()
            });
        });
    }

    function joinOnlineRoom() {
        var codeInput = $("online-room-code");
        var code = codeInput ? trimString(codeInput.value).toUpperCase() : "";
        if (!/^\d{4}$/.test(code)) {
            setOnlineStatus("Bitte eine 4-stellige PIN eingeben.", true);
            return;
        }
        ensureConnected(function () {
            socket.emit("join-room", {
                code: code,
                nickname: getOnlineNickname()
            });
        });
    }

    function leaveOnlineRoom() {
        if (socket) {
            socket.emit("leave-room");
        }
        if (state.online.started) {
            window.location.reload();
            return;
        }
        resetOnlineState();
        if (dom.onlineLobby) {
            dom.onlineLobby.style.display = "none";
        }
        setOnlineStatus("Online-Raum verlassen.", false);
    }

    function startOnlineRoom() {
        if (!socket) {
            return;
        }
        socket.emit("start-room");
    }

    function sendOnlineActionState(playerId, action, isPressed) {
        if (!socket || !(state.online.active && !state.online.isHost && state.online.started)) {
            return;
        }
        socket.emit("online-input-state", {
            playerId: playerId,
            action: action,
            isPressed: !!isPressed
        });
    }

    function sendOnlineActionTrigger(playerId, action) {
        if (!socket || !(state.online.active && !state.online.isHost && state.online.started)) {
            return;
        }
        socket.emit("online-input-trigger", {
            playerId: playerId,
            action: action
        });
    }

    function initOnlineUi() {
        ensureOnlinePanelContainer();
        resetOnlineState();
        if ($("create-online-coop-btn")) {
            $("create-online-coop-btn").onclick = function () { createOnlineRoom("coop"); };
        }
        if ($("create-online-versus-btn")) {
            $("create-online-versus-btn").onclick = function () { createOnlineRoom("versus"); };
        }
        if ($("join-online-room-btn")) {
            $("join-online-room-btn").onclick = joinOnlineRoom;
        }
        if ($("leave-online-room-btn")) {
            $("leave-online-room-btn").onclick = leaveOnlineRoom;
        }
        if ($("start-online-room-btn")) {
            $("start-online-room-btn").onclick = startOnlineRoom;
        }
        if ($("online-room-code")) {
            $("online-room-code").addEventListener("input", function () {
                this.value = this.value.replace(/[^0-9]/g, "").slice(0, 4);
            });
        }
        if ($("online-nickname")) {
            restoreOnlineNickname();
            $("online-nickname").addEventListener("input", function () {
                this.value = this.value.replace(/\s+/g, " ").slice(0, 16);
            });
        }
        setOnlineStatus("", false);
    }

    APP.expose("toggleOnlinePanel", toggleOnlinePanel);
    APP.expose("initOnlineUi", initOnlineUi);
    APP.expose("afterGameLoopTick", afterGameLoopTick);
    APP.expose("sendOnlineActionState", sendOnlineActionState);
    APP.expose("sendOnlineActionTrigger", sendOnlineActionTrigger);
})(window.InfinityRunner);
