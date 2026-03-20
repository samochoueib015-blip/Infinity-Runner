(function (APP) {
    "use strict";

    var CFG = APP.CFG;
    var state = APP.state;
    var dom = APP.dom;
    var appRoot;
    var players = APP.entities.players;
    var highscore = APP.highscore;
    var runtime = APP.runtime;

    function clearWorldNodes() {
                while (dom.world.firstChild) {
                    dom.world.removeChild(dom.world.firstChild);
                }
            }

    function createLifeRow(parent, store) {
                var i;
                var life;
                store.length = 0;
                for (i = 0; i < CFG.player.maxLives; i++) {
                    life = document.createElement("div");
                    life.className = "life";
                    parent.appendChild(life);
                    store.push(life);
                }
            }

    function createPlayerHud(player) {
                var panel = document.createElement("div");
                var title = document.createElement("div");
                var lifeRow = document.createElement("div");
                var ammo = document.createElement("div");
                var effects = document.createElement("div");
                var status = document.createElement("div");
                var lives = [];

                panel.className = "player-panel";
                title.className = "player-title";
                title.innerText = player.label;
                panel.appendChild(title);

                lifeRow.className = "player-life-row";
                panel.appendChild(lifeRow);
                createLifeRow(lifeRow, lives);

                ammo.className = "player-ammo";
                panel.appendChild(ammo);

                effects.className = "player-effects";
                panel.appendChild(effects);

                status.className = "player-status";
                panel.appendChild(status);

                dom.uiPlayers.appendChild(panel);

                player.hud = {
                    panel: panel,
                    title: title,
                    lives: lives,
                    ammo: ammo,
                    effects: effects,
                    status: status
                };
            }

    function createPlayerState(index, x, y) {
                var localControls = {
                    left: "KeyA",
                    right: "KeyD",
                    jump: "Space",
                    attack: "KeyW",
                    fire: "KeyS",
                    dash: "ShiftLeft"
                };
                var secondaryControls = {
                    left: "ArrowLeft",
                    right: "ArrowRight",
                    jump: "KeyK",
                    attack: "ArrowUp",
                    fire: "ArrowDown",
                    dash: "KeyL"
                };
                var spriteMap = {
                    1: { base: "../Sprites/sprite.png", boots: "../Sprites/sprite_boots.png" },
                    2: { base: "../Sprites/sprite2.png", boots: "../Sprites/sprite_boots2.png" },
                    3: { base: "../Sprites/sprite3.png", boots: "../Sprites/sprite_boots3.png" },
                    4: { base: "../Sprites/sprite4.png", boots: "../Sprites/sprite_boots4.png" }
                };
                var spriteSet = spriteMap[index] || spriteMap[1];
                var controls = null;
                if (state.online && state.online.active) {
                    if (index === state.online.localPlayerId) {
                        controls = localControls;
                    }
                } else if (state.mode === "coop" || state.mode === "versus") {
                    controls = index === 1 ? localControls : secondaryControls;
                } else {
                    controls = localControls;
                }
                var player = {
                    id: index,
                    label: "P" + index,
                    x: x,
                    y: y,
                    spawnX: x,
                    spawnY: y,
                    dy: 0,
                    kbx: 0,
                    facing: "right",
                    onGround: false,
                    extraJumpsLeft: 1,
                    isMoving: false,
                    isAttacking: false,
                    lives: CFG.player.maxLives,
                    fireAmmo: CFG.player.startAmmo,
                    lastHit: 0,
                    lastDashTime: 0,
                    lastAttackTime: 0,
                    lastFireTime: 0,
                    bootsUntil: 0,
                    supportPlatform: null,
                    lastMoveX: 0,
                    alive: true,
                    waitingRespawn: false,
                    respawnAt: 0,
                    deathTime: 0,
                    el: null,
                    swingEl: null,
                    hud: null,
                    inputState: {
                        left: false,
                        right: false,
                        jump: false,
                        attack: false,
                        fire: false,
                        dash: false
                    },
                    controls: controls,
                    baseSprite: spriteSet.base,
                    bootsSprite: spriteSet.boots
                };
                player.el = document.createElement("div");
                player.el.className = "player p" + index;
                player.el.style.left = x + "px";
                player.el.style.top = y + "px";
                dom.world.appendChild(player.el);

                player.swingEl = document.createElement("div");
                player.swingEl.className = "swing";
                dom.world.appendChild(player.swingEl);

                createPlayerHud(player);
                if (window.ensurePlayerActionState) {
                    player.inputState = ensurePlayerActionState(player);
                }
                players.push(player);
                return player;
            }

    function getAlivePlayersCount() {
                var i;
                var count = 0;
                for (i = 0; i < players.length; i++) {
                    if (players[i].alive) {
                        count++;
                    }
                }
                return count;
            }

    function getFirstAlivePlayer() {
                var i;
                for (i = 0; i < players.length; i++) {
                    if (players[i].alive) {
                        return players[i];
                    }
                }
                return null;
            }

    function getNearestAlivePlayer(x, y) {
                var i;
                var player;
                var best = null;
                var score;
                for (i = 0; i < players.length; i++) {
                    player = players[i];
                    if (!player.alive) {
                        continue;
                    }
                    score = Math.abs((player.x + CFG.player.width / 2) - x) + Math.abs((player.y + CFG.player.height / 2) - y) * 0.55;
                    if (!best || score < best.score) {
                        best = { player: player, score: score };
                    }
                }
                return best ? best.player : null;
            }

    function refreshFocusMetrics() {
                var i;
                var player;
                var aliveCount = 0;
                var sumX = 0;
                var sumY = 0;
                var maxX = -999999;
                var fallback = null;

                for (i = 0; i < players.length; i++) {
                    player = players[i];
                    if (player.alive) {
                        aliveCount++;
                        sumX += player.x;
                        sumY += player.y;
                        if (player.x > maxX) {
                            maxX = player.x;
                        }
                        if (!fallback) {
                            fallback = player;
                        }
                    }
                }

                if (aliveCount === 0) {
                    for (i = 0; i < players.length; i++) {
                        if (players[i].waitingRespawn) {
                            fallback = players[i];
                            break;
                        }
                    }
                }

                if (aliveCount > 0) {
                    state.focusX = sumX / aliveCount;
                    state.focusY = sumY / aliveCount;
                    state.leadX = maxX;
                    return;
                }

                if (fallback) {
                    state.focusX = fallback.x;
                    state.focusY = fallback.y;
                    state.leadX = fallback.x;
                    return;
                }

                state.focusX = 0;
                state.focusY = 0;
                state.leadX = 0;
            }

    function updatePlayerVisuals(time) {
                var i;
                var player;
                var xPos;
                var yPos;
                var blink;
                var swingFrame;
                var swingX;
                var swingY;
                for (i = 0; i < players.length; i++) {
                    player = players[i];
                    if (!player.alive) {
                        player.el.style.display = "none";
                        player.swingEl.style.display = "none";
                        continue;
                    }
                    xPos = player.facing === "left" ? 0 : -45;
                    yPos = player.isAttacking ? -180 : ((player.isMoving && Math.floor(time / 150) % 2 === 1) ? -90 : 0);
                    blink = (time - player.lastHit < 250 && Math.floor(time / 50) % 2 === 0);

                    player.el.style.display = "block";
                    player.el.style.left = Math.floor(player.x) + "px";
                    player.el.style.top = Math.floor(player.y) + "px";
                    player.el.style.visibility = blink ? "hidden" : "visible";
                    player.el.style.backgroundImage = "url('" + (hasBoots(player, time) ? player.bootsSprite : player.baseSprite) + "')";
                    player.el.style.backgroundPosition = xPos + "px " + yPos + "px";

                    if (player.isAttacking) {
                        swingFrame = Math.floor((time - player.lastAttackTime) / 83);
                        if (swingFrame > 2) {
                            swingFrame = 2;
                        }
                        swingX = player.facing === "left" ? 0 : -45;
                        swingY = swingFrame * -90;
                        player.swingEl.style.display = "block";
                        player.swingEl.style.left = Math.floor(player.facing === "left" ? player.x - 45 : player.x + 45) + "px";
                        player.swingEl.style.top = Math.floor(player.y) + "px";
                        player.swingEl.style.backgroundPosition = swingX + "px " + swingY + "px";
                    } else {
                        player.swingEl.style.display = "none";
                    }
                }
            }

    function updateParallax() {
                if (!dom.parallax) {
                    return;
                }
                dom.parallax.style.backgroundPosition = Math.floor(state.camX * 0.28) + "px center";
            }

    function buildTouchPanel(playerId, label) {
                return ""
                    + "<div class='touch-panel touch-panel-p" + playerId + "' data-player='" + playerId + "'>"
                    + "<div class='touch-player-label'>" + label + "</div>"
                    + "<div class='touch-move-group' aria-label='Bewegung'>"
                    + "<button type='button' class='touch-btn touch-btn-move' data-player='" + playerId + "' data-action='left' aria-label='Links'>◀</button>"
                    + "<button type='button' class='touch-btn touch-btn-move' data-player='" + playerId + "' data-action='right' aria-label='Rechts'>▶</button>"
                    + "</div>"
                    + "<div class='touch-action-grid' aria-label='Aktionen'>"
                    + "<button type='button' class='touch-btn touch-btn-action touch-btn-jump' data-player='" + playerId + "' data-action='jump'>SPRUNG</button>"
                    + "<button type='button' class='touch-btn touch-btn-action touch-btn-fire' data-player='" + playerId + "' data-action='fire'>FEUER</button>"
                    + "<button type='button' class='touch-btn touch-btn-action touch-btn-dash' data-player='" + playerId + "' data-action='dash'>DASH</button>"
                    + "<button type='button' class='touch-btn touch-btn-action touch-btn-attack' data-player='" + playerId + "' data-action='attack'>ANGRIFF</button>"
                    + "</div>"
                    + "</div>";
            }

    function buildDom() {
                var ui;
                var content;
                var buttons;
                var btn1;
                var btn2;
                var btn3;
                var btn4;

                dom.appRoot = document.createElement("div");
                dom.appRoot.id = "app-root";
                document.body.appendChild(dom.appRoot);
                appRoot = dom.appRoot;

                dom.parallax = document.createElement("div");
                dom.parallax.id = "parallax";
                dom.parallax.style.position = "absolute";
                dom.parallax.style.top = "0";
                dom.parallax.style.left = "0";
                dom.parallax.style.width = "100%";
                dom.parallax.style.height = "100%";
                dom.parallax.style.zIndex = "0";
                dom.parallax.style.pointerEvents = "none";
                dom.parallax.style.backgroundImage = "url('../Sprites/background.png')";
                dom.parallax.style.backgroundRepeat = "repeat-x";
                dom.parallax.style.backgroundSize = "1920px 1080px";
                dom.parallax.style.backgroundPosition = "0 center";
                appRoot.appendChild(dom.parallax);

                dom.world = document.createElement("div");
                dom.world.id = "world";
                dom.world.style.zIndex = "1";
                appRoot.appendChild(dom.world);

                ui = document.createElement("div");
                ui.id = "ui";
                ui.style.zIndex = "20";
                appRoot.appendChild(ui);

                dom.uiPlayers = document.createElement("div");
                dom.uiPlayers.id = "ui-players";
                ui.appendChild(dom.uiPlayers);

                dom.score = document.createElement("div");
                dom.score.id = "score-display";
                ui.appendChild(dom.score);

                dom.highscore = document.createElement("div");
                dom.highscore.id = "highscore-display";
                ui.appendChild(dom.highscore);

                dom.effect = document.createElement("div");
                dom.effect.id = "effect-display";
                ui.appendChild(dom.effect);

                dom.status = document.createElement("div");
                dom.status.id = "status-display";
                ui.appendChild(dom.status);

                dom.fileStatus = document.createElement("div");
                dom.fileStatus.id = "file-status-display";
                ui.appendChild(dom.fileStatus);

                dom.touchToggle = document.createElement("button");
                dom.touchToggle.id = "touch-toggle";
                dom.touchToggle.type = "button";
                dom.touchToggle.innerText = "Touch: AUS";
                dom.touchToggle.onclick = function () {
                    if (window.toggleTouchControls) {
                        window.toggleTouchControls();
                    }
                };
                document.body.appendChild(dom.touchToggle);

                dom.touchControls = document.createElement("div");
                dom.touchControls.id = "touch-controls";
                dom.touchControls.innerHTML = buildTouchPanel(1, "Spieler 1") + buildTouchPanel(2, "Spieler 2");
                document.body.appendChild(dom.touchControls);

                dom.startScreen = document.createElement("div");
                dom.startScreen.id = "start-screen";
                dom.startScreen.innerHTML = ""
                    + "<div id='start-panel'>"
                    + "<h1>Infinity Runner</h1>"
                    + "<p>Standardmäßig startest du lokal. Online ist ein eigener Modus mit Räumen und 4-stelligem PIN.</p>"
                    + "<div id='start-buttons'></div>"
                    + "<div id='online-panel' style='display:none'>"
                    + "<div class='online-actions'>"
                    + "<button type='button' class='menu-button menu-button-online' id='open-online-lobby-btn'>Online-Modus</button>"
                    + "</div>"
                    + "<div id='online-card' style='display:none'>"
                    + "<div class='online-layout'>"
                    + "<div class='online-left'>"
                    + "<p class='online-copy'>Online = 1 Spieler pro Gerät. Lokal zu zweit bleibt nur im lokalen Modus.</p>"
                    + "<div class='online-name-row'>"
                    + "<label for='online-nickname'><strong>Nickname:</strong></label>"
                    + "<input id='online-nickname' maxlength='16' autocomplete='nickname' placeholder='Dein Nickname'>"
                    + "</div>"
                    + "<div class='online-create-row'>"
                    + "<button type='button' class='menu-button menu-button-small' id='create-online-coop-btn'>Raum erstellen: Koop</button>"
                    + "<button type='button' class='menu-button menu-button-small' id='create-online-versus-btn'>Raum erstellen: PvP</button>"
                    + "</div>"
                    + "<div class='online-join-row'>"
                    + "<input id='online-room-code' maxlength='4' inputmode='numeric' autocomplete='off' placeholder='PIN eingeben'>"
                    + "<button type='button' class='menu-button menu-button-small' id='join-online-room-btn'>Raum beitreten</button>"
                    + "</div>"
                    + "<div id='online-status'></div>"
                    + "</div>"
                    + "<div class='online-right'>"
                    + "<div id='online-lobby' style='display:none'>"
                    + "<p><strong>Raum:</strong> <span id='online-room-code-display'>----</span></p>"
                    + "<p><strong>Modus:</strong> <span id='online-room-mode-display'>-</span></p>"
                    + "<p><strong>Spieler:</strong></p>"
                    + "<ul id='online-room-player-list'></ul>"
                    + "<div class='online-lobby-actions'>"
                    + "<button type='button' class='menu-button menu-button-small' id='start-online-room-btn' disabled>Spiel starten</button>"
                    + "<button type='button' class='menu-button menu-button-small' id='leave-online-room-btn'>Raum verlassen</button>"
                    + "</div>"
                    + "</div>"
                    + "</div>"
                    + "</div>"
                    + "</div>"
                    + "</div>"
                    + "<p class='start-hint'>Lokal: Spieler 1 = A/D, Leertaste, W, S, Shift</p>"
                    + "<p class='start-hint'>Lokal: Spieler 2 = ←/→, K, ↑, ↓, L</p>"
                    + "</div>";
                appRoot.appendChild(dom.startScreen);

                buttons = document.getElementById("start-buttons");

                btn1 = document.createElement("button");
                btn1.className = "menu-button";
                btn1.innerText = "1 Spieler";
                btn1.onclick = function () {
                    window.startGame("solo");
                };
                buttons.appendChild(btn1);

                btn2 = document.createElement("button");
                btn2.className = "menu-button";
                btn2.innerText = "2 Spieler";
                btn2.onclick = function () {
                    window.startGame("coop");
                };
                buttons.appendChild(btn2);

                btn3 = document.createElement("button");
                btn3.className = "menu-button";
                btn3.innerText = "1v1 Modus";
                btn3.onclick = function () {
                    window.startGame("versus");
                };
                buttons.appendChild(btn3);

                btn4 = document.createElement("button");
                btn4.className = "menu-button";
                btn4.innerText = "Online";
                btn4.onclick = function () {
                    if (window.toggleOnlinePanel) {
                        window.toggleOnlinePanel();
                    }
                };
                buttons.appendChild(btn4);

                dom.onlinePanel = document.getElementById("online-card");
                dom.onlineStatus = document.getElementById("online-status");
                dom.onlineLobby = document.getElementById("online-lobby");
                dom.gameOver = document.createElement("div");
                dom.gameOver.id = "gameover";
                dom.gameOver.onclick = function () {
                    window.location.reload();
                };

                content = document.createElement("div");
                content.id = "gameover-content";
                content.innerHTML = ""
                    + "<h1 id='gameover-title'>Runde beendet</h1>"
                    + "<p id='gameover-score'></p>"
                    + "<p id='gameover-record'></p>"
                    + "<p id='gameover-extra'></p>"
                    + "<p>Klicke, um das Spiel neu zu starten.</p>";
                dom.gameOver.appendChild(content);
                appRoot.appendChild(dom.gameOver);

                dom.gameOverTitle = document.getElementById("gameover-title");
                dom.gameOverScore = document.getElementById("gameover-score");
                dom.gameOverRecord = document.getElementById("gameover-record");
                dom.gameOverExtra = document.getElementById("gameover-extra");
            }

    function buildTutorial() {
                var tutorial = document.createElement("div");
                tutorial.id = "tutorial";
                if (isVersusMode()) {
                    tutorial.innerText = "1v1: Spieler 1 nutzt A/D, Leertaste, W, S und Shift. Spieler 2 nutzt ←/→, K, ↑, ↓ und L. Besiege den anderen Spieler.";
                } else if (isCoopMode()) {
                    tutorial.innerText = "Koop: Spieler 1 nutzt A/D, Leertaste, W, S und Shift. Spieler 2 nutzt ←/→, K, ↑, ↓ und L. Stirbt jemand, kann er zurückkehren, solange der andere 5 Sekunden überlebt.";
                } else {
                    tutorial.innerText = "Steuerung: A/D = Laufen, Leertaste = Springen, W = Nahkampf, Shift = Dash, S = Feuerball.";
                }
                dom.world.appendChild(tutorial);
            }

    function renderPlayerHud(player, time) {
                var html = "";
                var livesIndex;
                for (livesIndex = 0; livesIndex < player.hud.lives.length; livesIndex++) {
                    player.hud.lives[livesIndex].style.backgroundPosition = livesIndex < player.lives ? "0 0" : "0 -20px";
                }
                player.hud.ammo.innerHTML = "<span class='hud-group'><span class='hud-icon hud-icon-fire'></span><span class='hud-value'>" + player.fireAmmo + "</span></span>";
                if (player.bootsUntil > time) {
                    html += "<span class='hud-group'><span class='hud-icon hud-icon-boots'></span><span class='hud-value'>" + ((player.bootsUntil - time) / 1000).toFixed(1) + "s</span></span>";
                }
                player.hud.effects.innerHTML = html;
                if (player.alive) {
                    player.hud.status.innerText = "";
                } else if (player.waitingRespawn) {
                    player.hud.status.innerText = "Respawn in " + Math.max(0, ((player.respawnAt - time) / 1000)).toFixed(1) + "s";
                } else {
                    player.hud.status.innerText = "Ausgeschaltet";
                }
            }

    function updateHud(time) {
                var i;
                var player;
                for (i = 0; i < players.length; i++) {
                    player = players[i];
                    renderPlayerHud(player, time);
                }

                if (isVersusMode()) {
                    setText(dom.score, "1v1 Modus");
                    setText(dom.highscore, "");
                } else {
                    setText(dom.score, "Score: " + state.score);
                    renderHighscoreHud();
                }

                dom.effect.innerHTML = getGlobalEffectHtml(time);
                dom.status.innerText = getGameplayStatusText();
                renderHighscoreFileStatus();
            }

    function endGame(winnerLabel) {
                var newRecord = false;
                var enteredName;
                if (state.gameOver) {
                    return;
                }
                state.gameOver = true;
                runtime.loopRunning = false;

                if (isVersusMode()) {
                    setText(dom.gameOverTitle, winnerLabel ? (winnerLabel + " gewinnt!") : "Unentschieden!");
                    setText(dom.gameOverScore, "1v1 beendet");
                    setText(dom.gameOverRecord, "");
                    setText(dom.gameOverExtra, "Klicken zum Neustart");
                    dom.gameOver.style.display = "block";
                    return;
                }

                setText(dom.gameOverTitle, "GAME OVER");
                if (state.score > highscore.score) {
                    newRecord = true;
                    enteredName = window.prompt("Neuer Highscore! Bitte verewige dich:", "");
                    highscore.name = normalizeName(enteredName);
                    highscore.score = state.score;
                    writeHighscoreFile();
                }
                updateHighscoreHud();
                setText(dom.gameOverScore, "Final Score: " + state.score);
                setText(dom.gameOverRecord, "Rekord: " + highscore.name + " - " + highscore.score);
                setText(dom.gameOverExtra, newRecord ? (highscore.name + " hat sich verewigt.") : ("Rekordhalter bleibt: " + highscore.name + "."));
                dom.gameOver.style.display = "block";
            }

    APP.expose("clearWorldNodes", clearWorldNodes);
    APP.expose("createLifeRow", createLifeRow);
    APP.expose("createPlayerHud", createPlayerHud);
    APP.expose("createPlayerState", createPlayerState);
    APP.expose("getAlivePlayersCount", getAlivePlayersCount);
    APP.expose("getFirstAlivePlayer", getFirstAlivePlayer);
    APP.expose("getNearestAlivePlayer", getNearestAlivePlayer);
    APP.expose("refreshFocusMetrics", refreshFocusMetrics);
    APP.expose("updatePlayerVisuals", updatePlayerVisuals);
    APP.expose("updateParallax", updateParallax);
    APP.expose("buildDom", buildDom);
    APP.expose("buildTutorial", buildTutorial);
    APP.expose("renderPlayerHud", renderPlayerHud);
    APP.expose("updateHud", updateHud);
    APP.expose("endGame", endGame);
})(window.InfinityRunner);
