(function (APP) {
    "use strict";

    var state = APP.state;
    var dom = APP.dom;
    var highscore = APP.highscore;
    var players = APP.entities.players;
    var PLATFORM_STYLE = APP.PLATFORM_STYLE;

    function getHighscoreStorageKey() {
                return "infinity_runner_highscore_v1";
            }

    function writeHighscoreFile() {
                if (!highscore.enabled) {
                    return;
                }
                try {
                    window.localStorage.setItem(getHighscoreStorageKey(), JSON.stringify({
                        name: highscore.name,
                        score: highscore.score
                    }));
                } catch (err) {
                    highscore.enabled = false;
                }
            }

    function parseHighscore(content) {
                var data;
                var lines;
                var i;
                var line;
                var compact = [];
                var foundName = false;
                var foundScore = false;

                highscore.name = "Niemand";
                highscore.score = 0;

                if (content === null || content === undefined || content === "") {
                    return;
                }

                if (typeof content !== "string") {
                    if (typeof content.name !== "undefined") {
                        highscore.name = normalizeName(content.name);
                        foundName = true;
                    }
                    if (typeof content.score !== "undefined") {
                        highscore.score = parseInt(content.score, 10);
                        if (isNaN(highscore.score) || highscore.score < 0) {
                            highscore.score = 0;
                        }
                        foundScore = true;
                    }
                    if (foundName || foundScore) {
                        return;
                    }
                }

                try {
                    data = JSON.parse(String(content));
                    if (data && typeof data === "object") {
                        parseHighscore(data);
                        return;
                    }
                } catch (jsonErr) {}

                lines = String(content).split(/\r\n|\n|\r/);

                for (i = 0; i < lines.length; i++) {
                    line = trimString(lines[i]);
                    if (line !== "") {
                        compact.push(line);
                    }
                    if (line.toUpperCase().indexOf("NAME=") === 0) {
                        highscore.name = normalizeName(line.substr(5));
                        foundName = true;
                    }
                    if (line.toUpperCase().indexOf("SCORE=") === 0) {
                        highscore.score = parseInt(trimString(line.substr(6)), 10);
                        if (isNaN(highscore.score) || highscore.score < 0) {
                            highscore.score = 0;
                        }
                        foundScore = true;
                    }
                }

                if (!foundName || !foundScore) {
                    if (compact.length >= 1) {
                        if (/^\d+$/.test(compact[0])) {
                            highscore.score = parseInt(compact[0], 10);
                        } else {
                            highscore.name = normalizeName(compact[0]);
                        }
                    }
                    if (compact.length >= 2) {
                        if (!/^\d+$/.test(compact[0])) {
                            highscore.name = normalizeName(compact[0]);
                        }
                        highscore.score = parseInt(compact[1], 10);
                        if (isNaN(highscore.score) || highscore.score < 0) {
                            highscore.score = 0;
                        }
                    }
                }
            }

    function loadHighscore() {
                var content = "";
                try {
                    if (!("localStorage" in window) || !window.localStorage) {
                        throw new Error("localStorage unavailable");
                    }
                    content = window.localStorage.getItem(getHighscoreStorageKey()) || "";
                    highscore.enabled = true;
                    parseHighscore(content);
                    highscore.filePath = "Browser-Speicher (localStorage)";
                    writeHighscoreFile();
                } catch (err) {
                    highscore.enabled = false;
                    highscore.name = "Browser-Speicher deaktiviert";
                    highscore.score = 0;
                    highscore.filePath = "";
                }
            }

    function renderHighscoreHud() {
                setText(dom.highscore, "Rekord: " + highscore.name + " - " + highscore.score);
            }

    function renderHighscoreFileStatus() {
                if (!dom.fileStatus) {
                    return;
                }
                if (highscore.enabled) {
                    setText(dom.fileStatus, "Highscore-Speicher: " + highscore.filePath);
                } else {
                    setText(dom.fileStatus, "Warnung: Browser-Speicher konnte nicht gelesen oder geschrieben werden.");
                }
            }

    function updateHighscoreHud() {
                renderHighscoreHud();
                renderHighscoreFileStatus();
            }

    function getGameplayStatusText() {
                var i;
                if (isCoopMode()) {
                    for (i = 0; i < players.length; i++) {
                        if (players[i].waitingRespawn && !players[i].alive) {
                            return players[i].label + " kommt zurück, solange der andere lebt.";
                        }
                    }
                    return "";
                }
                if (isVersusMode()) {
                    return "Friendly Fire nur im PvP aktiv.";
                }
                return "";
            }

    function getGlobalEffectHtml(time) {
                if (state.moonUntil > time) {
                    return "<span class='hud-group'><span class='hud-icon hud-icon-moon'></span><span class='hud-value'>" + ((state.moonUntil - time) / 1000).toFixed(1) + "s</span></span>";
                }
                return "";
            }

    function getPlatformVisual(type) {
                if (PLATFORM_STYLE[type]) {
                    return PLATFORM_STYLE[type];
                }
                return PLATFORM_STYLE.stationary;
            }

    APP.expose("getHighscoreStorageKey", getHighscoreStorageKey);
    APP.expose("writeHighscoreFile", writeHighscoreFile);
    APP.expose("parseHighscore", parseHighscore);
    APP.expose("loadHighscore", loadHighscore);
    APP.expose("renderHighscoreHud", renderHighscoreHud);
    APP.expose("renderHighscoreFileStatus", renderHighscoreFileStatus);
    APP.expose("updateHighscoreHud", updateHighscoreHud);
    APP.expose("getGameplayStatusText", getGameplayStatusText);
    APP.expose("getGlobalEffectHtml", getGlobalEffectHtml);
    APP.expose("getPlatformVisual", getPlatformVisual);
})(window.InfinityRunner);
