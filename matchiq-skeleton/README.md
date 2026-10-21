# MatchIQ — Basic Frontend Skeleton

A minimal React + Vite starter for a football prediction game.

## Run locally

1. Install Node.js 18 or newer.
2. Open this folder in a terminal.
3. Run `npm install`.
4. Run `npm run dev`.
5. Open the localhost URL shown in the terminal (usually http://localhost:5173).

## Included

- Home page (Create Room / Join Room)
- Join form (name and room code)
- Host dashboard placeholders (scoreboard, match events, predictions, leaderboard)
- Player view (sample yes/no prediction)
- Simple responsive styling

## Not included yet

No server, database, real room creation, real multiplayer, simulation, scoring, or AI integration. Buttons are navigation/demo interactions only.

## Next steps

1. Extract reusable components from `src/main.jsx`.
2. Add React Router if routes become necessary.
3. Add a Node.js + Socket.IO backend for actual rooms.
4. Implement match events and prediction scoring.
5. Add AI explanations after gameplay works.
