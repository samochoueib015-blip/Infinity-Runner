(function (APP) {
    "use strict";

    var state = {
        camX: 0,
        camY: 0,
        score: 0,
        gameOver: false,
        moonUntil: 0,
        keys: {},
        input: {
            keyboard: {},
            players: {}
        },
        touch: {
            preference: "auto",
            visible: false
        },
        online: {
            active: false,
            isHost: false,
            connected: false,
            roomCode: "",
            mode: "coop",
            playerCount: 0,
            localPlayerId: 1,
            started: false,
            lobbyPlayers: [],
            message: "",
            lastSnapshotAt: 0
        },
        display: {
            active: false,
            scale: 1,
            baseWidth: 1600,
            baseHeight: 900,
            virtualWidth: 1280,
            virtualHeight: 720
        },
        nextChunk: 1000,
        generatorY: 452,
        chunkIndex: 0,
        started: false,
        mode: "solo",
        modePlayers: 1,
        leadX: 0,
        focusX: 0,
        focusY: 0
    };

    var dom = {
        appRoot: null,
        world: null,
        uiPlayers: null,
        score: null,
        highscore: null,
        effect: null,
        status: null,
        fileStatus: null,
        parallax: null,
        touchToggle: null,
        touchControls: null,
        onlinePanel: null,
        onlineStatus: null,
        onlineLobby: null,
        startScreen: null,
        gameOver: null,
        gameOverTitle: null,
        gameOverScore: null,
        gameOverRecord: null,
        gameOverExtra: null
    };

    var entities = {
        platforms: [],
        enemies: [],
        pickups: [],
        fireballs: [],
        players: []
    };

    var highscore = {
        name: "Niemand",
        score: 0,
        filePath: "",
        enabled: false,
        fso: null
    };

    var runtime = {
        loopRunning: false
    };

    APP.state = state;
    APP.dom = dom;
    APP.entities = entities;
    APP.highscore = highscore;
    APP.runtime = runtime;
})(window.InfinityRunner);
