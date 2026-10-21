import { CONFIG } from '../config.js';
import { TEAMS } from '../data/teams.js';
import { BOT_PROFILES } from '../data/bots.js';
import { buildQuestion, eventMatchesPrediction } from '../data/questions.js';
import { createMatch, simulateMinute, serializeMatch } from './matchEngine.js';
import { leaderboard, serializeRoom } from './roomStore.js';

let predictionSeq = 0;

/**
 * Owns the game loop for rooms: prediction rounds, simulation, scoring.
 * `io` is used only to emit to a room — all state lives in the RoomStore.
 *
 * Round flow (per prediction):
 *   answering  (answerWindowMs, closes early if everyone answered)
 *   simulating (match advances windowMinutes, events stream live)
 *   result     (scores + leaderboard broadcast, pause)
 *   -> next prediction, until minute >= matchMinutes -> finished
 */
export class GameService {
  constructor(io, store) {
    this.io = io;
    this.store = store;
  }

  snapshot(room) { return serializeRoom(room, serializeMatch); }
  emitState(room) { this.io.to(room.code).emit('room:state', this.snapshot(room)); }

  createRoom(hostSocketId, hostName) {
    const room = this.store.create({
      hostSocketId,
      hostName,
      match: createMatch(TEAMS[0], TEAMS[1]),
    });
    return room;
  }

  // ---- Seeded bots (mock data for solo/demo testing) ----

  /** Add up to `count` demo bots (unused profiles, no duplicate names). */
  addBots(room, count = 5) {
    const taken = new Set([...room.players.values()].map((p) => p.name.toLowerCase()));
    const available = BOT_PROFILES.filter((b) => !taken.has(b.name.toLowerCase()));
    const added = available.slice(0, Math.max(0, Math.min(count, 8))).map((profile) => this.store.addBot(room, profile));
    if (room.phase === 'answering' && room.currentPrediction) this.scheduleBotAnswers(room);
    this.io.to(room.code).emit('bots:added', { added: added.map((p) => p.name), players: leaderboard(room) });
    this.emitState(room);
    return added;
  }

  removeBots(room) {
    room.botTimers.forEach(clearTimeout);
    room.botTimers = [];
    for (const p of [...room.players.values()]) if (p.isBot) room.players.delete(p.id);
    this.emitState(room);
  }

  /** Each bot answers once per prediction, after its reaction delay. */
  scheduleBotAnswers(room) {
    const bots = [...room.players.values()].filter((p) => p.isBot);
    for (const bot of bots) {
      const [min, max] = bot.reaction;
      const delay = CONFIG.answerWindowMs * (min + Math.random() * (max - min));
      const timer = setTimeout(() => {
        try {
          this.submitAnswer(room, bot, Math.random() < bot.yesBias ? 'Yes' : 'No');
        } catch { /* round already closed / bot already answered */ }
      }, delay);
      room.botTimers.push(timer);
    }
  }

  startGame(room) {
    if (room.status === 'playing') return;
    room.status = 'playing';
    room.match = createMatch(TEAMS[0], TEAMS[1]); // fresh match on (re)start
    for (const p of room.players.values()) { p.score = 0; p.streak = 0; p.bestStreak = 0; p.correct = 0; p.answered = 0; }
    this.emitState(room);
    room.timer = setTimeout(() => this.openPrediction(room), CONFIG.firstQuestionDelayMs);
  }

  openPrediction(room) {
    if (room.status !== 'playing') return;
    if (room.match.minute >= CONFIG.matchMinutes) return this.finishGame(room);

    const q = buildQuestion(Math.random, room.lastTemplateId);
    room.lastTemplateId = q.templateId;
    room.phase = 'answering';
    room.currentPrediction = {
      id: `pred-${++predictionSeq}`,
      ...q,
      openedAt: Date.now(),
      closesAt: Date.now() + CONFIG.answerWindowMs,
      answers: new Map(), // playerId -> { answer, answeredAt, elapsedMs }
      resolved: false,
      outcome: null,
      correctAnswer: null,
      outcomeSeen: false,
      endMinute: Math.min(room.match.minute + q.windowMinutes, CONFIG.matchMinutes),
    };
    this.io.to(room.code).emit('prediction:open', { prediction: this.snapshot(room).prediction, match: serializeMatch(room.match) });
    this.emitState(room);
    this.scheduleBotAnswers(room);
    room.timer = setTimeout(() => this.beginSimulation(room), CONFIG.answerWindowMs);
  }

  submitAnswer(room, player, answer) {
    const pred = room.currentPrediction;
    if (room.phase !== 'answering' || !pred || pred.resolved) throw new Error('No open prediction');
    if (answer !== 'Yes' && answer !== 'No') throw new Error('Answer must be Yes or No');
    if (pred.answers.has(player.id)) throw new Error('Already answered');

    const now = Date.now();
    pred.answers.set(player.id, { answer, answeredAt: now, elapsedMs: now - pred.openedAt });
    player.answered += 1;
    this.io.to(room.code).emit('prediction:answers', {
      predictionId: pred.id,
      answeredCount: pred.answers.size,
      totalPlayers: room.players.size,
    });
    this.emitState(room);

    // Close early once every connected player has locked in.
    const connected = [...room.players.values()].filter((p) => p.connected);
    if (connected.every((p) => pred.answers.has(p.id))) {
      clearTimeout(room.timer);
      room.timer = setTimeout(() => this.beginSimulation(room), 500);
    }
    return pred.answers.get(player.id);
  }

  beginSimulation(room) {
    if (room.status !== 'playing' || !room.currentPrediction) return;
    room.phase = 'simulating';
    this.emitState(room);
    const step = () => {
      if (room.status !== 'playing') return;
      const pred = room.currentPrediction;
      const event = simulateMinute(room.match);
      if (event) {
        if (eventMatchesPrediction(event, pred)) pred.outcomeSeen = true;
        this.io.to(room.code).emit('match:event', { event, match: serializeMatch(room.match) });
      }
      this.io.to(room.code).emit('match:tick', { match: serializeMatch(room.match) });

      if (room.match.minute >= pred.endMinute || room.match.minute >= CONFIG.matchMinutes) {
        return this.resolvePrediction(room);
      }
      room.timer = setTimeout(step, CONFIG.minuteStepMs);
    };
    room.timer = setTimeout(step, CONFIG.minuteStepMs);
  }

  /** Score one player's answer. Exported logic kept pure for testability. */
  scoreAnswer(player, record, correctAnswer) {
    if (!record || record.answer !== correctAnswer) {
      player.streak = 0;
      return { points: 0, speedBonus: 0, streakBonus: 0, correct: false };
    }
    const { correctBase, maxSpeedBonus, streakBonusPerLevel, maxStreakBonus } = CONFIG.points;
    const speedBonus = Math.round(maxSpeedBonus * Math.max(0, 1 - record.elapsedMs / CONFIG.answerWindowMs));
    player.streak += 1;
    player.bestStreak = Math.max(player.bestStreak, player.streak);
    player.correct += 1;
    const streakBonus = Math.min(Math.max(0, player.streak - 1) * streakBonusPerLevel, maxStreakBonus);
    const points = correctBase + speedBonus + streakBonus;
    player.score += points;
    return { points, speedBonus, streakBonus, correct: true };
  }

  resolvePrediction(room) {
    const pred = room.currentPrediction;
    if (!pred || pred.resolved) return;
    pred.resolved = true;
    pred.outcome = pred.outcomeSeen ? 'Yes' : 'No';
    pred.correctAnswer = pred.outcome;
    room.phase = 'result';

    const results = [...room.players.values()].map((player) => {
      const record = pred.answers.get(player.id) ?? null;
      const scored = this.scoreAnswer(player, record, pred.correctAnswer);
      return {
        playerId: player.id,
        name: player.name,
        answer: record?.answer ?? null,
        ...scored,
        totalScore: player.score,
        streak: player.streak,
      };
    });

    this.io.to(room.code).emit('prediction:result', {
      predictionId: pred.id,
      text: pred.text,
      outcome: pred.outcome,
      correctAnswer: pred.correctAnswer,
      results,
      leaderboard: leaderboard(room),
      match: serializeMatch(room.match),
    });
    this.emitState(room);

    if (room.match.minute >= CONFIG.matchMinutes) {
      room.timer = setTimeout(() => this.finishGame(room), CONFIG.resultPauseMs);
    } else {
      room.timer = setTimeout(() => this.openPrediction(room), CONFIG.resultPauseMs);
    }
  }

  finishGame(room) {
    room.status = 'finished';
    room.phase = 'finished';
    room.match.finished = true;
    const board = leaderboard(room);
    this.io.to(room.code).emit('game:finished', {
      match: serializeMatch(room.match),
      leaderboard: board,
      winner: board[0] ?? null,
    });
    this.emitState(room);
  }

  /** On disconnect: keep the player (score survives), just flag offline. */
  handleDisconnect(socketId) {
    for (const room of this.store.rooms.values()) {
      const player = room.players.get(socketId);
      if (!player) continue;
      player.connected = false;
      this.io.to(room.code).emit('player:left', { playerId: socketId, players: leaderboard(room) });
      this.emitState(room);
      // Bots don't keep a room alive — only real, connected humans do.
      const anyConnected = [...room.players.values()].some((p) => p.connected && !p.isBot);
      if (!anyConnected) {
        room.cleanupTimer = setTimeout(() => this.store.delete(room.code), CONFIG.emptyRoomTtlMs);
      }
    }
  }
}
