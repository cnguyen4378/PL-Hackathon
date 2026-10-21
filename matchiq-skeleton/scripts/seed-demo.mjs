// Seed a demo room you can join from the browser — no other humans needed.
//
//   1. npm run dev:all        (or npm run server, in another terminal)
//   2. npm run seed
//   3. Open http://localhost:5173 -> Join Room -> enter the printed code
//
// The script hosts the room, fills it with 5 bots, auto-answers as the host,
// and starts the match after a short countdown (joining mid-match also works).
// Env: SOCKET_URL, BOT_COUNT (default 5), START_DELAY_MS (default 8000)
import { io } from 'socket.io-client';

const URL = process.env.SOCKET_URL || 'http://localhost:3001';
const BOT_COUNT = Number(process.env.BOT_COUNT || 5);
const START_DELAY_MS = Number(process.env.START_DELAY_MS || 8000);

const emitAck = (event, payload) => new Promise((resolve, reject) => {
  socket.emit(event, payload, (res) => (res?.ok ? resolve(res) : reject(new Error(`${event}: ${res?.error || 'no ack (is the server running?)'}`))));
});

const socket = io(URL);
socket.on('connect_error', (err) => {
  console.error(`❌ Cannot reach server at ${URL}: ${err.message}\n   Start it first: npm run dev:all`);
  process.exit(1);
});

await new Promise((res) => socket.on('connect', res));

const { code } = await emitAck('create_room', { name: 'Demo Host' });
const { added } = await emitAck('add_bots', { code, count: BOT_COUNT });

console.log('\n⚽  MatchIQ demo room seeded');
console.log(`    Room code : ${code}`);
console.log(`    Bots      : ${added.join(', ') || 'none'}`);
console.log(`    Join at   : http://localhost:5173  (Join Room -> name + code ${code})`);
console.log(`    Match starts in ${Math.round(START_DELAY_MS / 1000)}s — joining mid-match works too.\n`);

// The seed host plays along (random answers) so rounds close early.
socket.on('prediction:open', ({ prediction }) => {
  console.log(`❓ ${prediction.text}`);
  setTimeout(() => {
    socket.emit('submit_answer', { code, answer: Math.random() < 0.5 ? 'Yes' : 'No' }, () => {});
  }, 500 + Math.random() * 1000);
});
socket.on('match:event', ({ event }) => console.log(`   ${event.minute}' ${event.text}`));
socket.on('prediction:result', ({ outcome, leaderboard }) => {
  console.log(`   → Outcome: ${outcome} | Leader: ${leaderboard[0]?.name} (${leaderboard[0]?.score} pts)\n`);
});
socket.on('game:finished', ({ match, winner }) => {
  console.log(`🏁 Full time: ${match.homeTeam.name} ${match.homeScore}–${match.awayScore} ${match.awayTeam.name}`);
  console.log(`🏆 Winner: ${winner?.name} with ${winner?.score} pts`);
  console.log('Re-run `npm run seed` for a fresh room.');
  socket.disconnect();
  process.exit(0);
});

setTimeout(async () => {
  await emitAck('start_game', { code });
  console.log('▶️  Match started!\n');
}, START_DELAY_MS);

process.on('SIGINT', () => { console.log('\nSeed stopped, room closed.'); socket.disconnect(); process.exit(0); });
