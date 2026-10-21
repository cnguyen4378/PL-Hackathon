import { CONFIG } from '../config.js';

// In-memory room store. This is the "data layer" for the hackathon build:
// all state lives in a Map so there is no DB to set up. The class boundary
// is deliberate — swap these methods for Redis/Postgres later and the
// game service + socket layer don't need to change.

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no O/0/I/1 ambiguity

export function generateRoomCode(existing) {
  let code;
  do {
    code = Array.from({ length: CONFIG.roomCodeLength }, () =>
      CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  } while (existing.has(code));
  return code;
}

export function createPlayer(id, name, isHost = false, { isBot = false, yesBias = 0.5, reaction = [0.1, 0.5] } = {}) {
  return {
    id, // socket id, or `bot-<n>` for seeded bots
    name,
    isHost,
    isBot,
    yesBias, // bots only: probability of answering Yes
    reaction, // bots only: [min, max] fraction of answer window before answering
    connected: true,
    score: 0,
    streak: 0,
    bestStreak: 0,
    correct: 0,
    answered: 0,
  };
}

export class RoomStore {
  constructor() { this.rooms = new Map(); }

  create({ hostSocketId, hostName, match }) {
    const code = generateRoomCode(this.rooms);
    const room = {
      code,
      hostId: hostSocketId,
      status: 'lobby', // lobby | playing | finished
      phase: 'lobby', // lobby | answering | simulating | result | finished
      players: new Map(), // socketId -> player
      match,
      currentPrediction: null,
      lastTemplateId: null,
      timer: null, // single pending setTimeout for the game loop
      botTimers: [], // pending seeded-bot answer timers
      cleanupTimer: null,
      createdAt: Date.now(),
    };
    room.players.set(hostSocketId, createPlayer(hostSocketId, hostName, true));
    this.rooms.set(code, room);
    return room;
  }

  get(code) { return this.rooms.get((code || '').toUpperCase()) ?? null; }

  addPlayer(room, socketId, name) {
    const player = createPlayer(socketId, name, false);
    room.players.set(socketId, player);
    return player;
  }

  addBot(room, profile) {
    const id = `bot-${profile.name.toLowerCase().replace(/[^a-z]+/g, '-')}`;
    const player = createPlayer(id, profile.name, false, { isBot: true, yesBias: profile.yesBias, reaction: profile.reaction });
    room.players.set(id, player);
    return player;
  }

  removePlayer(room, socketId) { room.players.delete(socketId); }

  delete(code) {
    const room = this.rooms.get(code);
    if (room?.timer) clearTimeout(room.timer);
    room?.botTimers?.forEach(clearTimeout);
    if (room?.cleanupTimer) clearTimeout(room.cleanupTimer);
    this.rooms.delete(code);
  }

  get size() { return this.rooms.size; }
}

/** Sorted leaderboard with ranks — the single source used everywhere. */
export function leaderboard(room) {
  return [...room.players.values()]
    .sort((a, b) => b.score - a.score || b.correct - a.correct || a.name.localeCompare(b.name))
    .map((p, i) => ({
      rank: i + 1,
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isBot: p.isBot,
      connected: p.connected,
      score: p.score,
      streak: p.streak,
      correct: p.correct,
      answered: p.answered,
    }));
}

/** Full public snapshot sent to clients (never leaks other players' live answers). */
export function serializeRoom(room, matchSerializer) {
  const prediction = room.currentPrediction;
  return {
    code: room.code,
    hostId: room.hostId,
    status: room.status,
    phase: room.phase,
    players: leaderboard(room), // players list doubles as the leaderboard
    leaderboard: leaderboard(room),
    match: room.match ? matchSerializer(room.match) : null,
    prediction: prediction
      ? {
          id: prediction.id,
          text: prediction.text,
          teamId: prediction.teamId,
          windowMinutes: prediction.windowMinutes,
          closesAt: prediction.closesAt,
          answeredCount: prediction.answers.size,
          // outcome/correctAnswer are only present after resolution
          ...(prediction.resolved
            ? { resolved: true, outcome: prediction.outcome, correctAnswer: prediction.correctAnswer }
            : { resolved: false }),
        }
      : null,
  };
}
