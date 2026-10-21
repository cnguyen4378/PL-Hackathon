import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { CONFIG } from './config.js';
import { TEAMS } from './data/teams.js';
import { RoomStore, leaderboard } from './game/roomStore.js';
import { GameService } from './game/gameService.js';

// ---------------------------------------------------------------------------
// MatchIQ server: Express (REST/debug) + Socket.IO (realtime rooms/gameplay)
//
// Client -> Server events (all take an ack callback { ok, ... } / { ok:false, error }):
//   create_room  { name }                          -> { code, room }
//   join_room    { code, name }                    -> { code, room }
//   start_game   { code }          (host only)     -> { room }
//   add_bots     { code, count }   (host only)     -> { added, room }  seeded demo bots
//   remove_bots  { code }          (host only)     -> { room }
//   submit_answer{ code, answer: 'Yes'|'No' }      -> { predictionId }
//   get_state    { code }                          -> { room }
//
// Server -> Client events:
//   room:state         full public snapshot (see roomStore.serializeRoom)
//   player:joined      { player, players }
//   player:left        { playerId, players }
//   prediction:open    { prediction, match }
//   prediction:answers { predictionId, answeredCount, totalPlayers }
//   match:event        { event, match }
//   match:tick         { match }
//   prediction:result  { predictionId, outcome, results, leaderboard, match }
//   game:finished      { match, leaderboard, winner }
// ---------------------------------------------------------------------------

const app = express();
app.use(cors({ origin: CONFIG.clientOrigin }));
app.use(express.json());

const store = new RoomStore();

app.get('/health', (_req, res) => res.json({ ok: true, rooms: store.size, uptime: process.uptime() }));
app.get('/api/teams', (_req, res) => res.json(TEAMS));
app.get('/api/rooms/:code', (req, res) => {
  const room = store.get(req.params.code);
  if (!room) return res.status(404).json({ ok: false, error: 'Room not found' });
  return res.json({ ok: true, room: game.snapshot(room) });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CONFIG.clientOrigin, methods: ['GET', 'POST'] } });
const game = new GameService(io, store);

const cleanName = (name) => String(name || '').trim().slice(0, 20);
const fail = (ack, error) => ack?.({ ok: false, error });

function requireRoom(socket, code, ack) {
  const room = store.get(code || socket.data.code);
  if (!room) { fail(ack, 'Room not found'); return null; }
  if (!room.players.has(socket.id)) { fail(ack, 'You are not in this room'); return null; }
  return room;
}

io.on('connection', (socket) => {
  socket.on('create_room', ({ name } = {}, ack) => {
    const hostName = cleanName(name);
    if (!hostName) return fail(ack, 'Name is required');
    const room = game.createRoom(socket.id, hostName);
    socket.join(room.code);
    socket.data.code = room.code;
    ack?.({ ok: true, code: room.code, playerId: socket.id, room: game.snapshot(room) });
  });

  socket.on('join_room', ({ code, name } = {}, ack) => {
    const room = store.get(code);
    if (!room) return fail(ack, 'Room not found');
    const playerName = cleanName(name);
    if (!playerName) return fail(ack, 'Name is required');
    if ([...room.players.values()].some((p) => p.name.toLowerCase() === playerName.toLowerCase())) {
      return fail(ack, 'That name is already taken in this room');
    }
    if (room.cleanupTimer) { clearTimeout(room.cleanupTimer); room.cleanupTimer = null; }
    const player = store.addPlayer(room, socket.id, playerName);
    socket.join(room.code);
    socket.data.code = room.code;
    io.to(room.code).emit('player:joined', { player: { id: player.id, name: player.name }, players: leaderboard(room) });
    game.emitState(room);
    ack?.({ ok: true, code: room.code, playerId: socket.id, room: game.snapshot(room) });
  });

  socket.on('add_bots', ({ code, count } = {}, ack) => {
    const room = requireRoom(socket, code, ack);
    if (!room) return;
    if (room.hostId !== socket.id) return fail(ack, 'Only the host can add bots');
    const added = game.addBots(room, Number(count) || 5);
    ack?.({ ok: true, added: added.map((p) => p.name), room: game.snapshot(room) });
  });

  socket.on('remove_bots', ({ code } = {}, ack) => {
    const room = requireRoom(socket, code, ack);
    if (!room) return;
    if (room.hostId !== socket.id) return fail(ack, 'Only the host can remove bots');
    game.removeBots(room);
    ack?.({ ok: true, room: game.snapshot(room) });
  });

  socket.on('start_game', ({ code } = {}, ack) => {
    const room = requireRoom(socket, code, ack);
    if (!room) return;
    if (room.hostId !== socket.id) return fail(ack, 'Only the host can start the game');
    if (room.status === 'playing') return fail(ack, 'Game already started');
    game.startGame(room);
    ack?.({ ok: true, room: game.snapshot(room) });
  });

  socket.on('submit_answer', ({ code, answer } = {}, ack) => {
    const room = requireRoom(socket, code, ack);
    if (!room) return;
    try {
      const player = room.players.get(socket.id);
      game.submitAnswer(room, player, answer);
      ack?.({ ok: true, predictionId: room.currentPrediction.id });
    } catch (err) {
      fail(ack, err.message);
    }
  });

  socket.on('get_state', ({ code } = {}, ack) => {
    const room = requireRoom(socket, code, ack);
    if (room) ack?.({ ok: true, room: game.snapshot(room) });
  });

  socket.on('disconnect', () => game.handleDisconnect(socket.id));
});

server.listen(CONFIG.port, () => {
  console.log(`MatchIQ server listening on http://localhost:${CONFIG.port}`);
});
