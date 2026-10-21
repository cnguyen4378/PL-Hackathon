# MatchIQ — Football Prediction Game

Play along with friends during a simulated football match: join a room,
answer Yes/No predictions ("Will Blue FC take a shot in the next 4 minutes?"),
then watch the simulation play out. Correct answers score points — faster
answers and streaks earn bonuses.

## Run locally

Requires Node.js 18+.

```bash
npm install
npm run dev:all   # server (:3001) + client (:5173) together
```

Or separately: `npm run server` and `npm run dev`. Open http://localhost:5173,
create a room, share the 4-letter code, and have players join from other
tabs/devices on the same network setup.

Test the backend end-to-end (server must be running): `npm run test:backend`

## Testing solo (seeded mock data)

Two ways to get a living room without other humans:

1. **In the UI:** Create Room → **🤖 Add 5 Demo Bots** → Start Match. Bots
   appear on the leaderboard and answer every prediction automatically.
2. **From the terminal:** with the server running, `npm run seed` creates a
   demo room hosted by a script, fills it with bots, and prints a room code
   you can join from the browser (`BOT_COUNT` / `START_DELAY_MS` env tunable).

Bots are mock players defined in `server/data/bots.js` — each has a name,
a Yes-bias, and a reaction speed (which affects their speed bonus), so the
leaderboard moves realistically. They are flagged `isBot` end-to-end and
never keep a room alive on their own.

## Architecture

```
server/
  index.js               Express + Socket.IO entry, socket event handlers
  config.js              All pacing/scoring tunables + env overrides
  data/
    teams.js             Teams, ratings, squads (drives the simulation)
    bots.js              Mock bot players (name, Yes-bias, reaction speed)
    questions.js         Prediction templates + outcome matching
  game/
    roomStore.js         In-memory data layer (rooms/players/leaderboard)
    matchEngine.js       Minute-by-minute match simulation + commentary
    gameService.js       Game loop: predictions -> simulation -> scoring
src/
  socket.js              Shared Socket.IO client + ack helper
  main.jsx               UI: home / join / lobby / live game / leaderboard
scripts/smoke-test.mjs   Host + 2 players, one full round, asserts scoring
```

### How a round works

1. **Answering** (`ANSWER_WINDOW_MS`, default 10s; closes early when everyone
   has answered) — a random prediction opens, e.g. a shot/corner/goal/foul
   within the next N simulated minutes.
2. **Simulating** — the match advances minute-by-minute (`MINUTE_STEP_MS`
   per minute), streaming events and the clock to all clients.
3. **Result** — outcome is Yes if the predicted event happened. Scoring:
   `100 + speed bonus (up to 50) + streak bonus (up to 30)`. Leaderboard
   broadcasts, then the next round starts until minute 90 → full time.

### Data model (in-memory, by design)

State lives in `RoomStore` (a `Map` of rooms). A **Room** holds status/phase,
a map of **Players** (score, streak, correct/answered), the **Match**
(score, minute, stats, event log), and the current **Prediction** (question,
answer window, collected answers, outcome). No database is needed for a
live game session — if persistence is ever required, `roomStore.js` is the
single place to swap for Redis/Postgres.

### Realtime API (Socket.IO)

Client → server (ack callbacks): `create_room`, `join_room`, `start_game`
(host only), `add_bots` / `remove_bots` (host only), `submit_answer`, `get_state`.
Server → client: `room:state`, `player:joined/left`, `prediction:open`,
`prediction:answers`, `match:event`, `match:tick`, `prediction:result`,
`game:finished`. REST debug endpoints: `GET /health`, `/api/teams`,
`/api/rooms/:code`.

## Tunables (env, see `server/config.js`)

`PORT`, `CLIENT_ORIGIN`, `ANSWER_WINDOW_MS`, `MINUTE_STEP_MS` (lower = faster
demo), `VITE_SOCKET_URL` (client-side server URL).

## Not included yet

Persistence/accounts, reconnection by name, real match data, and AI
explanations (planned after gameplay — the event log + prediction history
in `gameService` are the natural inputs for that).
