const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*'
  }
});

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const GAME_DIR = path.join(ROOT_DIR, 'Game');
const SPRITES_DIR = path.join(ROOT_DIR, 'Sprites');
const spritesDirOnDisk = require('fs').existsSync(SPRITES_DIR) ? SPRITES_DIR : path.join(ROOT_DIR, 'sprites');

const CFG = {
  world: {
    baseGravity: 0.9,
    moonDurationMs: 30000,
    bootsDurationMs: 30000,
    tickMs: 20,
    loseY: 1500,
    supportTolerance: 16
  },
  player: {
    width: 45,
    height: 90,
    speed: 8,
    jumpForce: -18,
    dashDistance: 180,
    dashCooldown: 1000,
    maxLives: 3,
    startAmmo: 3
  },
  physics: {
    impulseDamping: 0.78,
    minImpulse: 0.12
  }
};

const rooms = new Map();
const socketRoom = new Map();

function nowMs() {
  return Date.now();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dampImpulse(value) {
  const damped = value * CFG.physics.impulseDamping;
  if (Math.abs(damped) < CFG.physics.minImpulse) {
    return 0;
  }
  return damped;
}

function horizontalOverlap(aX, aW, bX, bW) {
  return Math.max(0, Math.min(aX + aW, bX + bW) - Math.max(aX, bX));
}

function overlapsRect(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function randomCode() {
  return String(Math.floor(Math.random() * 10000)).padStart(4, '0');
}

function createUniqueCode() {
  let code = randomCode();
  while (rooms.has(code)) {
    code = randomCode();
  }
  return code;
}

function sanitizeNickname(raw, fallbackBase) {
  let name = String(raw || '').replace(/\s+/g, ' ').trim();
  if (!name) {
    name = fallbackBase || 'Spieler';
  }
  if (name.length > 16) {
    name = name.slice(0, 16);
  }
  return name;
}

function buildUniqueNickname(room, raw, fallbackBase) {
  const base = sanitizeNickname(raw, fallbackBase);
  const used = new Set(room.players.map((player) => String(player.nickname || '').toLowerCase()));
  let name = base;
  let counter = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ' ' + counter;
    name = base.slice(0, Math.max(1, 16 - suffix.length)) + suffix;
    counter += 1;
  }
  return name;
}

function getSpawnPoints(mode) {
  if (mode === 'versus') {
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

function createInputState() {
  return {
    left: false,
    right: false
  };
}

function createSimPlayer(playerInfo, spawn) {
  return {
    id: playerInfo.playerId,
    socketId: playerInfo.socketId,
    x: spawn.x,
    y: spawn.y,
    spawnX: spawn.x,
    spawnY: spawn.y,
    dy: 0,
    kbx: 0,
    facing: 'right',
    onGround: false,
    extraJumpsLeft: 1,
    isMoving: false,
    lastMoveX: 0,
    alive: true,
    waitingRespawn: false,
    respawnAt: 0,
    lives: CFG.player.maxLives,
    fireAmmo: CFG.player.startAmmo,
    bootsUntil: 0,
    lastDashTime: 0,
    lastAttackTime: 0,
    lastFireTime: 0,
    lastHit: 0,
    supportPlatform: null,
    input: createInputState()
  };
}

function createRoomSimulation(room) {
  const simPlayers = new Map();
  const spawnPoints = getSpawnPoints(room.mode);
  room.players.forEach((player, idx) => {
    simPlayers.set(player.playerId, createSimPlayer(player, spawnPoints[idx] || spawnPoints[0]));
  });
  room.sim = {
    platforms: [],
    players: simPlayers,
    lastSnapshot: null,
    lastTickAt: nowMs()
  };
}

function buildRoomSummary(room, socketId) {
  return room.players.map((player) => ({
    socketId: player.socketId,
    playerId: player.playerId,
    label: player.nickname || ('P' + player.playerId),
    isHost: player.socketId === room.hostSocketId,
    isSelf: player.socketId === socketId
  }));
}

function emitRoomState(room) {
  room.players.forEach((player) => {
    io.to(player.socketId).emit('room-state', {
      code: room.code,
      mode: room.mode,
      started: room.started,
      isHost: player.socketId === room.hostSocketId,
      players: buildRoomSummary(room, player.socketId)
    });
  });
}

function buildAuthoritativePlayerPayload(room) {
  const payload = [];
  room.players.forEach((roomPlayer) => {
    if (roomPlayer.socketId === room.hostSocketId) {
      return;
    }
    const simPlayer = room.sim && room.sim.players.get(roomPlayer.playerId);
    if (!simPlayer) {
      return;
    }
    payload.push({
      id: simPlayer.id,
      x: simPlayer.x,
      y: simPlayer.y,
      spawnX: simPlayer.spawnX,
      spawnY: simPlayer.spawnY,
      dy: simPlayer.dy,
      kbx: simPlayer.kbx,
      facing: simPlayer.facing,
      onGround: simPlayer.onGround,
      extraJumpsLeft: simPlayer.extraJumpsLeft,
      isMoving: simPlayer.isMoving,
      lastMoveX: simPlayer.lastMoveX,
      alive: simPlayer.alive,
      waitingRespawn: simPlayer.waitingRespawn,
      respawnAt: simPlayer.respawnAt,
      lives: simPlayer.lives,
      fireAmmo: simPlayer.fireAmmo,
      bootsUntil: simPlayer.bootsUntil,
      lastDashTime: simPlayer.lastDashTime,
      lastAttackTime: simPlayer.lastAttackTime,
      lastFireTime: simPlayer.lastFireTime,
      lastHit: simPlayer.lastHit
    });
  });
  return payload;
}

function emitAuthoritativePlayers(room) {
  if (!room.started || !room.sim) {
    return;
  }
  const players = buildAuthoritativePlayerPayload(room);
  if (!players.length) {
    return;
  }
  io.to(room.code).emit('authoritative-players', {
    players,
    time: nowMs()
  });
}

function buildMergedSnapshot(room, snapshot) {
  if (!room.sim || !snapshot) {
    return snapshot;
  }
  const authoritative = buildAuthoritativePlayerPayload(room);
  if (!authoritative.length) {
    return snapshot;
  }
  const byId = new Map(authoritative.map((entry) => [entry.id, entry]));
  const mergedPlayers = (snapshot.players || []).map((player) => {
    const auth = byId.get(player.id);
    if (!auth) {
      return player;
    }
    return {
      ...player,
      x: auth.x,
      y: auth.y,
      spawnX: auth.spawnX,
      spawnY: auth.spawnY,
      dy: auth.dy,
      kbx: auth.kbx,
      facing: auth.facing,
      onGround: auth.onGround,
      extraJumpsLeft: auth.extraJumpsLeft,
      isMoving: auth.isMoving,
      lastMoveX: auth.lastMoveX,
      alive: auth.alive,
      waitingRespawn: auth.waitingRespawn,
      respawnAt: auth.respawnAt,
      lives: auth.lives,
      fireAmmo: auth.fireAmmo,
      bootsUntil: auth.bootsUntil,
      lastDashTime: auth.lastDashTime,
      lastAttackTime: auth.lastAttackTime,
      lastFireTime: auth.lastFireTime,
      lastHit: auth.lastHit
    };
  });
  return {
    ...snapshot,
    players: mergedPlayers
  };
}

function getRoomBySocketId(socketId) {
  const code = socketRoom.get(socketId);
  return code ? rooms.get(code) : null;
}

function removeRoom(code, message) {
  const room = rooms.get(code);
  if (!room) {
    return;
  }
  room.players.forEach((player) => {
    socketRoom.delete(player.socketId);
    io.to(player.socketId).emit('room-closed', { message: message || 'Der Raum wurde geschlossen.' });
  });
  rooms.delete(code);
}

function detachSocketFromRoom(socket) {
  const room = getRoomBySocketId(socket.id);
  let index;
  if (!room) {
    return;
  }

  index = room.players.findIndex((player) => player.socketId === socket.id);
  if (index === -1) {
    socketRoom.delete(socket.id);
    return;
  }

  if (room.started) {
    removeRoom(room.code, socket.id === room.hostSocketId ? 'Der Host hat die Verbindung getrennt.' : 'Ein Spieler hat die Verbindung getrennt.');
    return;
  }

  room.players.splice(index, 1);
  socketRoom.delete(socket.id);
  if (room.players.length === 0) {
    rooms.delete(room.code);
    return;
  }

  if (socket.id === room.hostSocketId) {
    room.hostSocketId = room.players[0].socketId;
  }

  room.players.forEach((player, idx) => {
    player.playerId = idx + 1;
  });

  createRoomSimulation(room);
  emitRoomState(room);
}

function syncRoomSimulationFromHost(room, snapshot) {
  if (!room.sim) {
    createRoomSimulation(room);
  }
  room.sim.lastSnapshot = snapshot;
  room.sim.platforms = Array.isArray(snapshot.platforms) ? snapshot.platforms.map((platform) => ({
    x: platform.x,
    y: platform.y,
    w: platform.w,
    h: platform.h,
    moveType: platform.moveType
  })) : [];

  (snapshot.players || []).forEach((playerSnapshot) => {
    const roomPlayer = room.players.find((entry) => entry.playerId === playerSnapshot.id);
    if (!roomPlayer) {
      return;
    }
    let simPlayer = room.sim.players.get(playerSnapshot.id);
    if (!simPlayer) {
      simPlayer = createSimPlayer(roomPlayer, {
        x: playerSnapshot.spawnX || playerSnapshot.x || 36,
        y: playerSnapshot.spawnY || playerSnapshot.y || 310
      });
      room.sim.players.set(playerSnapshot.id, simPlayer);
    }

    simPlayer.spawnX = playerSnapshot.spawnX;
    simPlayer.spawnY = playerSnapshot.spawnY;
    simPlayer.lives = playerSnapshot.lives;
    simPlayer.fireAmmo = playerSnapshot.fireAmmo;
    simPlayer.bootsUntil = playerSnapshot.bootsUntil;
    simPlayer.lastAttackTime = playerSnapshot.lastAttackTime;
    simPlayer.lastFireTime = playerSnapshot.lastFireTime;
    simPlayer.lastHit = playerSnapshot.lastHit;
    simPlayer.alive = playerSnapshot.alive;
    simPlayer.waitingRespawn = playerSnapshot.waitingRespawn;
    simPlayer.respawnAt = playerSnapshot.respawnAt;

    if (roomPlayer.socketId === room.hostSocketId) {
      simPlayer.x = playerSnapshot.x;
      simPlayer.y = playerSnapshot.y;
      simPlayer.dy = playerSnapshot.dy;
      simPlayer.kbx = playerSnapshot.kbx;
      simPlayer.onGround = playerSnapshot.onGround;
      simPlayer.extraJumpsLeft = playerSnapshot.extraJumpsLeft;
      simPlayer.facing = playerSnapshot.facing;
      simPlayer.isMoving = playerSnapshot.isMoving;
      simPlayer.lastMoveX = playerSnapshot.lastMoveX;
      simPlayer.lastDashTime = playerSnapshot.lastDashTime;
      simPlayer.input = createInputState();
      return;
    }

    // Host remains the authority for non-movement gameplay state, while the server keeps movement authoritative.
    simPlayer.extraJumpsLeft = playerSnapshot.extraJumpsLeft;
    if (!simPlayer.alive) {
      simPlayer.dy = 0;
      simPlayer.kbx = 0;
    }
    if (simPlayer.waitingRespawn) {
      simPlayer.x = playerSnapshot.x;
      simPlayer.y = playerSnapshot.y;
      simPlayer.dy = playerSnapshot.dy;
      simPlayer.onGround = playerSnapshot.onGround;
    }
  });
}

function getGravity(room) {
  if (!room.sim || !room.sim.lastSnapshot) {
    return CFG.world.baseGravity;
  }
  return room.sim.lastSnapshot.moonUntil > nowMs() ? CFG.world.baseGravity * 0.38 : CFG.world.baseGravity;
}

function findLandingPlatform(platforms, player, nextX, prevY, nextY) {
  const feetPrev = prevY + CFG.player.height;
  const feetNext = nextY + CFG.player.height;
  let best = null;
  for (const platform of platforms) {
    const overlap = horizontalOverlap(nextX, CFG.player.width, platform.x, platform.w);
    if (overlap < 8) {
      continue;
    }
    if (feetPrev <= platform.y + CFG.world.supportTolerance && feetNext >= platform.y) {
      if (!best || platform.y < best.y) {
        best = platform;
      }
    }
  }
  return best;
}

function applyServerJump(room, simPlayer, time) {
  if (!simPlayer.alive) {
    return;
  }
  if (simPlayer.onGround) {
    simPlayer.dy = CFG.player.jumpForce;
    simPlayer.onGround = false;
    simPlayer.supportPlatform = null;
    return;
  }
  if (simPlayer.extraJumpsLeft > 0) {
    simPlayer.dy = CFG.player.jumpForce;
    simPlayer.extraJumpsLeft -= 1;
    simPlayer.supportPlatform = null;
  }
}

function applyServerDash(simPlayer, time) {
  if (!simPlayer.alive) {
    return;
  }
  if (time - simPlayer.lastDashTime < CFG.player.dashCooldown) {
    return;
  }
  simPlayer.x += simPlayer.facing === 'left' ? -CFG.player.dashDistance : CFG.player.dashDistance;
  simPlayer.lastDashTime = time;
}

function updateSimPlayer(room, simPlayer, time) {
  const input = simPlayer.input || createInputState();
  const prevY = simPlayer.y;
  let inputX = 0;
  let nextX;
  let landing;

  if (!simPlayer.alive || simPlayer.waitingRespawn) {
    return;
  }

  if (input.left && !input.right) {
    inputX = -CFG.player.speed;
    simPlayer.facing = 'left';
    simPlayer.isMoving = true;
  } else if (input.right && !input.left) {
    inputX = CFG.player.speed;
    simPlayer.facing = 'right';
    simPlayer.isMoving = true;
  } else {
    simPlayer.isMoving = false;
  }

  simPlayer.lastMoveX = inputX + simPlayer.kbx;
  nextX = simPlayer.x + simPlayer.lastMoveX;
  simPlayer.x = nextX;
  simPlayer.kbx = dampImpulse(simPlayer.kbx);

  simPlayer.dy += getGravity(room);
  simPlayer.y += simPlayer.dy;
  landing = findLandingPlatform(room.sim.platforms, simPlayer, simPlayer.x, prevY, simPlayer.y);
  if (landing && simPlayer.dy >= 0) {
    simPlayer.y = landing.y - CFG.player.height;
    simPlayer.dy = 0;
    simPlayer.onGround = true;
    simPlayer.supportPlatform = landing;
    simPlayer.extraJumpsLeft = simPlayer.bootsUntil > time ? 2 : 1;
  } else {
    simPlayer.onGround = false;
    simPlayer.supportPlatform = null;
  }

  if (simPlayer.y > CFG.world.loseY) {
    simPlayer.alive = false;
    simPlayer.waitingRespawn = true;
    simPlayer.dy = 0;
  }
}

function tickRooms() {
  const time = nowMs();
  rooms.forEach((room) => {
    if (!room.started || !room.sim) {
      return;
    }
    room.players.forEach((roomPlayer) => {
      if (roomPlayer.socketId === room.hostSocketId) {
        return;
      }
      const simPlayer = room.sim.players.get(roomPlayer.playerId);
      if (!simPlayer) {
        return;
      }
      updateSimPlayer(room, simPlayer, time);
    });
    emitAuthoritativePlayers(room);
  });
}

setInterval(tickRooms, CFG.world.tickMs);

app.use(express.static(GAME_DIR));
app.use('/Game', express.static(GAME_DIR));
app.use('/Sprites', express.static(spritesDirOnDisk));
app.get('/', (req, res) => {
  res.sendFile(path.join(GAME_DIR, 'index.html'));
});

io.on('connection', (socket) => {
  socket.on('create-room', (payload = {}) => {
    const mode = payload.mode === 'versus' ? 'versus' : 'coop';
    const code = createUniqueCode();
    const room = {
      code,
      mode,
      hostSocketId: socket.id,
      started: false,
      players: [
        {
          socketId: socket.id,
          playerId: 1,
          nickname: sanitizeNickname(payload.nickname, 'Spieler 1')
        }
      ],
      sim: null
    };

    detachSocketFromRoom(socket);
    rooms.set(code, room);
    socketRoom.set(socket.id, code);
    socket.join(code);
    createRoomSimulation(room);
    emitRoomState(room);
  });

  socket.on('join-room', (payload = {}) => {
    const code = String(payload.code || '').trim();
    const room = rooms.get(code);

    if (!/^\d{4}$/.test(code)) {
      socket.emit('room-error', { message: 'Bitte eine gültige 4-stellige PIN eingeben.' });
      return;
    }
    if (!room) {
      socket.emit('room-error', { message: 'Raum nicht gefunden.' });
      return;
    }
    if (room.started) {
      socket.emit('room-error', { message: 'Der Raum läuft bereits.' });
      return;
    }
    if (room.players.length >= 4) {
      socket.emit('room-error', { message: 'Der Raum ist bereits voll.' });
      return;
    }

    detachSocketFromRoom(socket);
    room.players.push({
      socketId: socket.id,
      playerId: room.players.length + 1,
      nickname: buildUniqueNickname(room, payload.nickname, 'Spieler ' + (room.players.length + 1))
    });
    socketRoom.set(socket.id, room.code);
    socket.join(room.code);
    createRoomSimulation(room);
    emitRoomState(room);
  });

  socket.on('leave-room', () => {
    detachSocketFromRoom(socket);
  });

  socket.on('start-room', () => {
    const room = getRoomBySocketId(socket.id);
    if (!room) {
      socket.emit('room-error', { message: 'Du bist in keinem Raum.' });
      return;
    }
    if (room.hostSocketId !== socket.id) {
      socket.emit('room-error', { message: 'Nur der Host kann starten.' });
      return;
    }
    if (room.started) {
      socket.emit('room-error', { message: 'Der Raum läuft bereits.' });
      return;
    }
    if (room.players.length < 2) {
      socket.emit('room-error', { message: 'Mindestens 2 Spieler müssen im Raum sein.' });
      return;
    }

    room.started = true;
    createRoomSimulation(room);
    room.players.forEach((player) => {
      io.to(player.socketId).emit('room-start', {
        roomCode: room.code,
        mode: room.mode,
        localPlayerId: player.playerId,
        isHost: player.socketId === room.hostSocketId,
        players: buildRoomSummary(room, player.socketId)
      });
    });
  });

  socket.on('online-input-state', (payload = {}) => {
    const room = getRoomBySocketId(socket.id);
    const roomPlayer = room && room.players.find((entry) => entry.socketId === socket.id);
    const simPlayer = room && roomPlayer && room.sim && room.sim.players.get(roomPlayer.playerId);
    if (!room || !room.started || !roomPlayer || room.hostSocketId === socket.id || !simPlayer) {
      return;
    }
    if (payload.action !== 'left' && payload.action !== 'right') {
      return;
    }
    simPlayer.input[payload.action] = !!payload.isPressed;
  });

  socket.on('online-input-trigger', (payload = {}) => {
    const room = getRoomBySocketId(socket.id);
    const roomPlayer = room && room.players.find((entry) => entry.socketId === socket.id);
    const simPlayer = room && roomPlayer && room.sim && room.sim.players.get(roomPlayer.playerId);
    if (!room || !room.started || !roomPlayer || room.hostSocketId === socket.id || !simPlayer) {
      return;
    }
    if (payload.action === 'jump') {
      applyServerJump(room, simPlayer, nowMs());
      return;
    }
    if (payload.action === 'dash') {
      applyServerDash(simPlayer, nowMs());
      return;
    }
    if (payload.action === 'attack' || payload.action === 'fire') {
      io.to(room.hostSocketId).emit('remote-action-trigger', {
        playerId: roomPlayer.playerId,
        action: payload.action
      });
    }
  });

  socket.on('host-snapshot', (payload = {}) => {
    const room = getRoomBySocketId(socket.id);
    if (!room || !room.started || room.hostSocketId !== socket.id) {
      return;
    }
    syncRoomSimulationFromHost(room, payload);
    const merged = buildMergedSnapshot(room, payload);
    room.players.forEach((player) => {
      if (player.socketId === room.hostSocketId) {
        return;
      }
      io.to(player.socketId).emit('snapshot', merged);
    });
  });

  socket.on('disconnect', () => {
    detachSocketFromRoom(socket);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('Infinity Runner server listening on port ' + PORT);
});
