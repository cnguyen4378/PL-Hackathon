// End-to-end smoke test: host + 2 players, one full prediction round.
// Requires the server running (npm run server). Run: npm run test:backend
import { io } from 'socket.io-client';

const URL = process.env.SOCKET_URL || 'http://localhost:3001';
const ANSWER_WINDOW_MS = Number(process.env.ANSWER_WINDOW_MS || 10000);
const TIMEOUT_MS = ANSWER_WINDOW_MS + 60000;

const emitAck = (socket, event, payload) => new Promise((resolve, reject) => {
  socket.emit(event, payload, (res) => (res?.ok ? resolve(res) : reject(new Error(`${event}: ${res?.error}`))));
});
const connect = () => new Promise((res) => { const s = io(URL); s.on('connect', () => res(s)); });
const waitFor = (socket, event, timeout = TIMEOUT_MS) => new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeout);
  socket.once(event, (data) => { clearTimeout(t); resolve(data); });
});

const assert = (cond, msg) => { if (!cond) throw new Error(`ASSERT: ${msg}`); console.log(`  ✓ ${msg}`); };

const [host, p1, p2] = await Promise.all([connect(), connect(), connect()]);
try {
  console.log('1. Create + join room');
  const created = await emitAck(host, 'create_room', { name: 'Host' });
  assert(/^[A-Z2-9]{4}$/.test(created.code), `room code ${created.code}`);
  await emitAck(p1, 'join_room', { code: created.code, name: 'Alex' });
  await emitAck(p2, 'join_room', { code: created.code, name: 'Sam' });
  const dup = await new Promise((res) => p2.emit('join_room', { code: created.code, name: 'alex' }, res));
  assert(!dup.ok, 'duplicate name rejected');

  console.log('2. Seed bots (host only)');
  const botsBlocked = await new Promise((res) => p1.emit('add_bots', { code: created.code, count: 3 }, res));
  assert(!botsBlocked.ok, 'non-host cannot add bots');
  const withBots = await emitAck(host, 'add_bots', { code: created.code, count: 3 });
  assert(withBots.added.length === 3 && withBots.room.leaderboard.length === 6,
    `3 bots added, 6 total players (${withBots.added.join(', ')})`);

  console.log('3. Start game (non-host blocked, host works)');
  const blocked = await new Promise((res) => p1.emit('start_game', { code: created.code }, res));
  assert(!blocked.ok, 'non-host cannot start');
  const openPromise = waitFor(p1, 'prediction:open');
  await emitAck(host, 'start_game', { code: created.code });
  const { prediction } = await openPromise;
  assert(prediction?.text?.includes('Will'), `prediction opened: "${prediction.text}"`);

  console.log('4. Answers + scoring');
  await emitAck(p1, 'submit_answer', { code: created.code, answer: 'Yes' });
  const dupe = await new Promise((res) => p1.emit('submit_answer', { code: created.code, answer: 'No' }, res));
  assert(!dupe.ok, 'double answer rejected');
  await emitAck(p2, 'submit_answer', { code: created.code, answer: 'No' });
  await emitAck(host, 'submit_answer', { code: created.code, answer: 'Yes' });
  // Bots auto-answer on their own timers; their answers trigger the early close.

  const result = await waitFor(p1, 'prediction:result');
  assert(['Yes', 'No'].includes(result.outcome), `resolved with outcome ${result.outcome}`);
  assert(result.results.length === 6, 'all 6 players scored (3 humans + 3 bots)');
  assert(result.results.filter((r) => r.answer !== null).length >= 5, 'bots answered automatically');
  const winners = result.results.filter((r) => r.correct);
  assert(winners.every((r) => r.points >= 100), `correct answers scored >=100 (got ${winners.map((r) => r.points).join(',') || 'none correct this round'})`);
  assert(result.results.filter((r) => !r.correct).every((r) => r.points === 0), 'wrong answers scored 0');
  assert(result.leaderboard[0].score >= (winners[0]?.points ?? 0), 'leaderboard reflects scores');
  assert(result.match.minute > 0, `match simulated to minute ${result.match.minute}' (score ${result.match.homeScore}-${result.match.awayScore})`);

  console.log('\n✅ SMOKE TEST PASSED');
} finally {
  host.disconnect(); p1.disconnect(); p2.disconnect();
  process.exit(0);
}
