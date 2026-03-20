(function (APP) {
    "use strict";

    var CFG = APP.CFG;
    var state = APP.state;
    var dom = APP.dom;
    var display = state.display;
    var players = APP.entities.players;
    var touchBindingsInitialized = false;
    var activeTouchPointers = {};
    var activeTouchActions = {};

    var ACTIONS = {
        left: true,
        right: true,
        jump: true,
        attack: true,
        fire: true,
        dash: true
    };

    function ensureInputContainers() {
                if (!state.input) {
                    state.input = { keyboard: {}, players: {} };
                }
                if (!state.input.keyboard) {
                    state.input.keyboard = {};
                }
                if (!state.input.players) {
                    state.input.players = {};
                }
            }

    function createEmptyActionState() {
                return {
                    left: false,
                    right: false,
                    jump: false,
                    attack: false,
                    fire: false,
                    dash: false
                };
            }

    function normalizePlayerId(playerOrId) {
                return typeof playerOrId === "object" ? playerOrId.id : playerOrId;
            }

    function getPlayerById(playerId) {
                var i;
                for (i = 0; i < players.length; i++) {
                    if (players[i].id === playerId) {
                        return players[i];
                    }
                }
                return null;
            }

    function ensurePlayerActionState(playerOrId) {
                var playerId = normalizePlayerId(playerOrId);
                ensureInputContainers();
                if (!state.input.players[playerId]) {
                    state.input.players[playerId] = createEmptyActionState();
                }
                return state.input.players[playerId];
            }

    function getPlayerActionState(playerOrId) {
                return ensurePlayerActionState(playerOrId);
            }

    function resetInputs() {
                state.keys = {};
                ensureInputContainers();
                state.input.keyboard = {};
                state.input.players = {};
            }

    function setPlayerAction(playerOrId, action, isPressed) {
                var playerId = normalizePlayerId(playerOrId);
                var actionState;
                if (!ACTIONS[action]) {
                    return false;
                }
                actionState = ensurePlayerActionState(playerId);
                actionState[action] = !!isPressed;
                return true;
            }

    function releasePlayerActions(playerOrId) {
                var actionState = ensurePlayerActionState(playerOrId);
                var action;
                for (action in ACTIONS) {
                    if (ACTIONS.hasOwnProperty(action)) {
                        actionState[action] = false;
                    }
                }
            }

    function findBindingMatch(code) {
                var i;
                var player;
                var action;
                for (i = 0; i < players.length; i++) {
                    player = players[i];
                    if (!player.controls) {
                        continue;
                    }
                    for (action in ACTIONS) {
                        if (ACTIONS.hasOwnProperty(action) && player.controls[action] === code) {
                            return { player: player, action: action };
                        }
                    }
                }
                return null;
            }

    function startAttack(player, time) {
                player.isAttacking = true;
                player.lastAttackTime = time;
                runMeleeAttack(player, time);
                (function (ref) {
                    setTimeout(function () {
                        ref.isAttacking = false;
                    }, CFG.player.attackDuration);
                })(player);
            }

    function tryJump(player, time) {
                if (!player.alive) {
                    return;
                }
                if (player.onGround) {
                    player.dy = CFG.player.jumpForce;
                    player.onGround = false;
                    player.supportPlatform = null;
                } else if (player.extraJumpsLeft > 0) {
                    player.dy = CFG.player.jumpForce;
                    player.extraJumpsLeft--;
                    player.supportPlatform = null;
                }
            }

    function triggerPlayerAction(playerOrId, action, time) {
                var player = typeof playerOrId === "object" ? playerOrId : getPlayerById(playerOrId);
                if (!player || !player.alive) {
                    return false;
                }
                if (action === "jump") {
                    tryJump(player, time);
                    return true;
                }
                if (action === "dash" && time - player.lastDashTime >= CFG.player.dashCooldown) {
                    player.x = getSafeDashX(player, player.facing === "left" ? -CFG.player.dashDistance : CFG.player.dashDistance);
                    player.lastDashTime = time;
                    return true;
                }
                if (action === "attack" && time - player.lastAttackTime >= CFG.player.attackCooldown) {
                    startAttack(player, time);
                    return true;
                }
                if (action === "fire" && time - player.lastFireTime >= CFG.player.fireCooldown && player.fireAmmo > 0) {
                    spawnFireball(player, time);
                    return true;
                }
                return false;
            }

    function handleKeyDown(evt) {
                var code = evt.code;
                var time = nowMs();
                var isRepeat;
                var binding;
                var consumed = false;
                var preventCodes = {
                    ArrowLeft: true,
                    ArrowUp: true,
                    ArrowRight: true,
                    ArrowDown: true,
                    Space: true
                };

                if (state.gameOver || !state.started) {
                    return;
                }

                ensureInputContainers();
                isRepeat = state.input.keyboard[code] === true;
                binding = findBindingMatch(code);

                state.input.keyboard[code] = true;
                state.keys[code] = true;

                if (binding) {
                    if (state.online && state.online.active && !state.online.isHost) {
                        if (binding.player.id !== state.online.localPlayerId) {
                            evt.preventDefault();
                            return;
                        }
                        if (binding.action === "left" || binding.action === "right") {
                            setPlayerAction(binding.player, binding.action, true);
                            if (window.sendOnlineActionState) {
                                sendOnlineActionState(binding.player.id, binding.action, true);
                            }
                        } else if (!isRepeat && window.sendOnlineActionTrigger) {
                            sendOnlineActionTrigger(binding.player.id, binding.action);
                        }
                        consumed = true;
                    } else {
                        setPlayerAction(binding.player, binding.action, true);
                        if (!isRepeat && (binding.action === "jump" || binding.action === "dash" || binding.action === "attack" || binding.action === "fire")) {
                            consumed = triggerPlayerAction(binding.player, binding.action, time) || consumed;
                        }
                    }
                }

                if (consumed || preventCodes[code]) {
                    evt.preventDefault();
                }
            }

    function handleKeyUp(evt) {
                var code = evt.code;
                var binding = findBindingMatch(code);
                ensureInputContainers();
                state.input.keyboard[code] = false;
                state.keys[code] = false;
                if (binding) {
                    setPlayerAction(binding.player, binding.action, false);
                    if (state.online && state.online.active && !state.online.isHost && (binding.action === "left" || binding.action === "right") && binding.player.id === state.online.localPlayerId) {
                        if (window.sendOnlineActionState) {
                            sendOnlineActionState(binding.player.id, binding.action, false);
                        }
                    }
                }
            }

    function getTouchActionKey(playerId, action) {
                return String(playerId) + ":" + action;
            }

    function isTouchPrimaryDevice() {
                return !!((window.matchMedia && window.matchMedia("(pointer: coarse)").matches)
                    || navigator.maxTouchPoints > 0
                    || ("ontouchstart" in window));
            }

    function updateTouchToggleLabel() {
                if (!dom.touchToggle) {
                    return;
                }
                dom.touchToggle.innerText = state.touch && state.touch.visible ? "Touch: AN" : "Touch: AUS";
            }

    function updateTouchPanelVisibility() {
                var player1Panel;
                var player2Panel;
                var buttons;
                var label;
                if (!dom.touchControls) {
                    return;
                }
                player1Panel = dom.touchControls.querySelector(".touch-panel-p1");
                player2Panel = dom.touchControls.querySelector(".touch-panel-p2");
                if (state.online && state.online.active) {
                    if (player1Panel) {
                        player1Panel.style.display = "flex";
                        label = player1Panel.querySelector(".touch-player-label");
                        if (label) {
                            label.innerText = "P" + state.online.localPlayerId;
                        }
                        buttons = player1Panel.querySelectorAll("[data-player]");
                        Array.prototype.forEach.call(buttons, function (button) {
                            button.setAttribute("data-player", String(state.online.localPlayerId));
                        });
                    }
                    if (player2Panel) {
                        player2Panel.style.display = "none";
                    }
                    return;
                }
                if (player1Panel) {
                    label = player1Panel.querySelector(".touch-player-label");
                    if (label) {
                        label.innerText = "Spieler 1";
                    }
                    buttons = player1Panel.querySelectorAll("[data-player]");
                    Array.prototype.forEach.call(buttons, function (button) {
                        button.setAttribute("data-player", "1");
                    });
                    player1Panel.style.display = "flex";
                }
                if (player2Panel) {
                    player2Panel.style.display = state.modePlayers === 2 ? "flex" : "none";
                    label = player2Panel.querySelector(".touch-player-label");
                    if (label) {
                        label.innerText = "Spieler 2";
                    }
                    buttons = player2Panel.querySelectorAll("[data-player]");
                    Array.prototype.forEach.call(buttons, function (button) {
                        button.setAttribute("data-player", "2");
                    });
                }
            }

    function setTouchControlsVisible(isVisible) {
                if (!state.touch) {
                    state.touch = { preference: "auto", visible: false };
                }
                state.touch.visible = !!isVisible;
                if (dom.touchControls) {
                    dom.touchControls.style.display = state.started && state.touch.visible ? "block" : "none";
                    dom.touchControls.setAttribute("aria-hidden", state.touch.visible ? "false" : "true");
                }
                if (dom.touchToggle) {
                    dom.touchToggle.style.display = state.started ? "block" : "none";
                }
                updateTouchToggleLabel();
            }

    function syncTouchControlsForMode() {
                var shouldShow;
                if (!state.touch) {
                    state.touch = { preference: "auto", visible: false };
                }
                updateTouchPanelVisibility();
                if (!state.started) {
                    setTouchControlsVisible(false);
                    if (dom.touchToggle) {
                        dom.touchToggle.style.display = "none";
                    }
                    return;
                }
                shouldShow = state.touch.preference === "shown"
                    || (state.touch.preference === "auto" && isTouchPrimaryDevice());
                setTouchControlsVisible(shouldShow);
            }

    function toggleTouchControls() {
                var nextVisible = !(state.touch && state.touch.visible);
                if (!state.touch) {
                    state.touch = { preference: "auto", visible: false };
                }
                state.touch.preference = nextVisible ? "shown" : "hidden";
                setTouchControlsVisible(nextVisible);
            }

    function bumpTouchActionCount(playerId, action, delta) {
                var key = getTouchActionKey(playerId, action);
                activeTouchActions[key] = (activeTouchActions[key] || 0) + delta;
                if (activeTouchActions[key] < 0) {
                    activeTouchActions[key] = 0;
                }
                setPlayerAction(playerId, action, activeTouchActions[key] > 0);
            }

    function releaseTouchPointer(pointerId) {
                var binding = activeTouchPointers[pointerId];
                if (!binding) {
                    return;
                }
                bumpTouchActionCount(binding.playerId, binding.action, -1);
                if (binding.button) {
                    binding.button.classList.remove("is-active");
                }
                delete activeTouchPointers[pointerId];
            }

    function releaseAllTouchInputs() {
                var pointerId;
                var buttons;
                activeTouchActions = {};
                for (pointerId in activeTouchPointers) {
                    if (activeTouchPointers.hasOwnProperty(pointerId)) {
                        releaseTouchPointer(pointerId);
                    }
                }
                if (dom.touchControls) {
                    buttons = dom.touchControls.querySelectorAll(".touch-btn.is-active");
                    Array.prototype.forEach.call(buttons, function (button) {
                        button.classList.remove("is-active");
                    });
                }
                releasePlayerActions(1);
                releasePlayerActions(2);
            }

    function handleTouchPointerDown(evt) {
                var button = evt.currentTarget;
                var playerId;
                var action;
                if (state.gameOver || !state.started) {
                    return;
                }
                playerId = parseInt(button.getAttribute("data-player"), 10);
                action = button.getAttribute("data-action");
                evt.preventDefault();
                if (button.setPointerCapture) {
                    try {
                        button.setPointerCapture(evt.pointerId);
                    } catch (err) {
                    }
                }
                if (activeTouchPointers[evt.pointerId]) {
                    releaseTouchPointer(evt.pointerId);
                }
                activeTouchPointers[evt.pointerId] = {
                    button: button,
                    playerId: playerId,
                    action: action
                };
                bumpTouchActionCount(playerId, action, 1);
                button.classList.add("is-active");
                if (state.online && state.online.active && !state.online.isHost) {
                    if (action === "left" || action === "right") {
                        if (window.sendOnlineActionState) {
                            sendOnlineActionState(playerId, action, true);
                        }
                    } else if (window.sendOnlineActionTrigger) {
                        sendOnlineActionTrigger(playerId, action);
                    }
                } else if (action !== "left" && action !== "right") {
                    triggerPlayerAction(playerId, action, nowMs());
                }
            }

    function handleTouchPointerUp(evt) {
                var binding = activeTouchPointers[evt.pointerId];
                evt.preventDefault();
                if (binding && state.online && state.online.active && !state.online.isHost && (binding.action === "left" || binding.action === "right")) {
                    if (window.sendOnlineActionState) {
                        sendOnlineActionState(binding.playerId, binding.action, false);
                    }
                }
                releaseTouchPointer(evt.pointerId);
            }

    function bindTouchButton(button) {
                if (!button || button.getAttribute("data-touch-bound") === "1") {
                    return;
                }
                button.setAttribute("data-touch-bound", "1");
                button.addEventListener("pointerdown", handleTouchPointerDown, { passive: false });
                button.addEventListener("pointerup", handleTouchPointerUp, { passive: false });
                button.addEventListener("pointercancel", handleTouchPointerUp, { passive: false });
                button.addEventListener("lostpointercapture", handleTouchPointerUp, { passive: false });
                button.addEventListener("contextmenu", function (evt) {
                    evt.preventDefault();
                });
            }

    function initTouchControls() {
                var buttons;
                if (touchBindingsInitialized || !dom.touchControls) {
                    syncTouchControlsForMode();
                    return;
                }
                buttons = dom.touchControls.querySelectorAll(".touch-btn");
                Array.prototype.forEach.call(buttons, function (button) {
                    bindTouchButton(button);
                });
                touchBindingsInitialized = true;
                syncTouchControlsForMode();
            }

    function isCoopMode() {
                return state.mode === "coop";
            }

    function isVersusMode() {
                return state.mode === "versus";
            }

    function getViewportWidth() {
                if (display && display.active) {
                    return display.virtualWidth;
                }
                return window.innerWidth || document.body.clientWidth || 1280;
            }

    function getViewportHeight() {
                if (display && display.active) {
                    return display.virtualHeight;
                }
                return window.innerHeight || document.body.clientHeight || 720;
            }

    APP.expose("ensurePlayerActionState", ensurePlayerActionState);
    APP.expose("getPlayerActionState", getPlayerActionState);
    APP.expose("setPlayerAction", setPlayerAction);
    APP.expose("releasePlayerActions", releasePlayerActions);
    APP.expose("resetInputs", resetInputs);
    APP.expose("triggerPlayerAction", triggerPlayerAction);
    APP.expose("startAttack", startAttack);
    APP.expose("tryJump", tryJump);
    APP.expose("handleKeyDown", handleKeyDown);
    APP.expose("handleKeyUp", handleKeyUp);
    APP.expose("isCoopMode", isCoopMode);
    APP.expose("isVersusMode", isVersusMode);
    APP.expose("getViewportWidth", getViewportWidth);
    APP.expose("getViewportHeight", getViewportHeight);
    APP.expose("initTouchControls", initTouchControls);
    APP.expose("toggleTouchControls", toggleTouchControls);
    APP.expose("setTouchControlsVisible", setTouchControlsVisible);
    APP.expose("syncTouchControlsForMode", syncTouchControlsForMode);
    APP.expose("releaseAllTouchInputs", releaseAllTouchInputs);
    APP.expose("isTouchPrimaryDevice", isTouchPrimaryDevice);
})(window.InfinityRunner);
