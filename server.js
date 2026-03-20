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

const rooms = new Map();
const socketRoom = new Map();

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

function getRoomBySocketId(socketId) {
  const code = socketRoom.get(socketId);
  return code ? rooms.get(code) : null;
}

function getPlayerSummary(room, socketId) {
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
      players: getPlayerSummary(room, player.socketId)
    });
  });
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
  emitRoomState(room);
}

app.use(express.static(GAME_DIR));
app.use('/Game', express.static(GAME_DIR));
app.use('/Sprites', express.static(path.join(ROOT_DIR, 'Sprites')));
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
      ]
    };

    detachSocketFromRoom(socket);
    rooms.set(code, room);
    socketRoom.set(socket.id, code);
    socket.join(code);
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
    room.players.forEach((player) => {
      io.to(player.socketId).emit('room-start', {
        roomCode: room.code,
        mode: room.mode,
        localPlayerId: player.playerId,
        isHost: player.socketId === room.hostSocketId,
        players: getPlayerSummary(room, player.socketId)
      });
    });
  });

  socket.on('online-input-state', (payload = {}) => {
    const room = getRoomBySocketId(socket.id);
    if (!room || !room.started || room.hostSocketId === socket.id) {
      return;
    }
    io.to(room.hostSocketId).emit('remote-input-state', payload);
  });

  socket.on('online-input-trigger', (payload = {}) => {
    const room = getRoomBySocketId(socket.id);
    if (!room || !room.started || room.hostSocketId === socket.id) {
      return;
    }
    io.to(room.hostSocketId).emit('remote-input-trigger', payload);
  });

  socket.on('host-snapshot', (payload = {}) => {
    const room = getRoomBySocketId(socket.id);
    if (!room || !room.started || room.hostSocketId !== socket.id) {
      return;
    }
    socket.to(room.code).emit('snapshot', payload);
  });

  socket.on('disconnect', () => {
    detachSocketFromRoom(socket);
  });
});

server.listen(PORT, () => {
  console.log('Infinity Runner server listening on port ' + PORT);
});
