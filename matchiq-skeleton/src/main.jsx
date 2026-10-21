import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { socket, emitAck } from './socket.js';
import './style.css';

function App() {
  const [screen, setScreen] = useState('home'); // home | join | game
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [room, setRoom] = useState(null);
  const [playerId, setPlayerId] = useState(null);
  const [answer, setAnswer] = useState('');
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onState = (state) => setRoom(state);
    const onResult = (result) => setLastResult(result);
    const onOpen = () => { setAnswer(''); setLastResult(null); };
    socket.on('room:state', onState);
    socket.on('prediction:result', onResult);
    socket.on('prediction:open', onOpen);
    return () => {
      socket.off('room:state', onState);
      socket.off('prediction:result', onResult);
      socket.off('prediction:open', onOpen);
    };
  }, []);

  const run = async (fn) => {
    setBusy(true); setError('');
    try { return await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const createRoom = () => run(async () => {
    const res = await emitAck('create_room', { name });
    setPlayerId(res.playerId); setRoom(res.room); setRoomCode(res.code); setScreen('game');
  });

  const joinRoom = () => run(async () => {
    const res = await emitAck('join_room', { code: roomCode, name });
    setPlayerId(res.playerId); setRoom(res.room); setScreen('game');
  });

  const startGame = () => run(() => emitAck('start_game', { code: room.code }));
  const addBots = () => run(() => emitAck('add_bots', { code: room.code, count: 5 }));
  const removeBots = () => run(() => emitAck('remove_bots', { code: room.code }));

  const submit = (value) => run(async () => {
    setAnswer(value);
    await emitAck('submit_answer', { code: room.code, answer: value });
  });

  const isHost = room?.hostId === playerId;
  const me = room?.leaderboard?.find((p) => p.id === playerId);
  const match = room?.match;
  const prediction = room?.prediction;
  const myResult = lastResult?.results?.find((r) => r.playerId === playerId);

  return (
    <main className="app">
      <header>
        <button className="brand" onClick={() => setScreen('home')}>⚽ MatchIQ</button>
        <span>Football Prediction Game</span>
      </header>

      {error && <p className="error">{error}</p>}

      {screen === 'home' && (
        <section className="home panel">
          <p className="eyebrow">WELCOME TO MATCHIQ</p>
          <h1>Predict the next play.</h1>
          <p>Play along with friends during a simulated football match.</p>
          <label className="name-field">Your name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" />
          </label>
          <div className="actions">
            <button disabled={busy || !name.trim()} onClick={createRoom}>Create Room</button>
            <button className="secondary" onClick={() => setScreen('join')}>Join Room</button>
          </div>
        </section>
      )}

      {screen === 'join' && (
        <section className="panel narrow">
          <h1>Join a room</h1>
          <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Alex" /></label>
          <label>Room code<input value={roomCode} onChange={(e) => setRoomCode(e.target.value.toUpperCase())} placeholder="ABCD" maxLength={6} /></label>
          <button disabled={busy || !name.trim() || !roomCode.trim()} onClick={joinRoom}>Join Game</button>
          <p className="hint">Enter the code shown on the host's screen.</p>
        </section>
      )}

      {screen === 'game' && room && match && (
        <section>
          <div className="heading">
            <div>
              <p className="eyebrow">{isHost ? 'HOST DASHBOARD' : 'PLAYER VIEW'}</p>
              <h1>{room.status === 'lobby' ? 'Lobby' : room.status === 'finished' ? 'Full Time' : 'Match Overview'}</h1>
            </div>
            <span className="pill">Room: {room.code}</span>
          </div>

          <div className="panel scoreboard">
            <div><strong>{match.homeTeam.name}</strong><small>Home</small></div>
            <div className="score">{match.homeScore} <span>–</span> {match.awayScore}<small>{room.status === 'finished' ? 'FT' : `${match.minute}'`}</small></div>
            <div><strong>{match.awayTeam.name}</strong><small>Away</small></div>
          </div>

          {room.status === 'lobby' && (
            <article className="panel">
              <h2>Waiting to start…</h2>
              <p className="placeholder">{room.leaderboard.length} player(s) in the room. Share the code <strong>{room.code}</strong> with friends.</p>
              {isHost
                ? <div className="actions">
                    <button disabled={busy} onClick={startGame}>▶ Start Match</button>
                    {room.leaderboard.some((p) => p.isBot)
                      ? <button className="secondary" disabled={busy} onClick={removeBots}>Remove Bots</button>
                      : <button className="secondary" disabled={busy} onClick={addBots}>🤖 Add 5 Demo Bots</button>}
                  </div>
                : <p className="hint">Waiting for the host to start the match.</p>}
              {isHost && <p className="hint">Testing solo? Add demo bots — they'll answer every prediction automatically.</p>}
            </article>
          )}

          {room.status !== 'lobby' && (
            <div className="columns">
              <article className="panel">
                <h2>Match Events</h2>
                {match.events.length === 0
                  ? <p className="placeholder">Match events will appear here.</p>
                  : <ul className="events">{match.events.slice(0, 12).map((e) => (
                      <li key={e.id}><strong>{e.minute}'</strong> {e.text}</li>
                    ))}</ul>}
              </article>

              <article className="panel">
                <h2>Current Prediction</h2>
                {room.phase === 'answering' && prediction ? (
                  <>
                    <p>{prediction.text}</p>
                    <p className="hint">{prediction.answeredCount} answered · next {prediction.windowMinutes} min will be simulated</p>
                    <div className="actions">
                      <button className={answer === 'Yes' ? '' : 'secondary'} disabled={busy || !!answer} onClick={() => submit('Yes')}>Yes</button>
                      <button className={answer === 'No' ? '' : 'secondary'} disabled={busy || !!answer} onClick={() => submit('No')}>No</button>
                    </div>
                    {answer && <p className="hint">Locked in: {answer} — waiting for the simulation…</p>}
                  </>
                ) : room.phase === 'simulating' ? (
                  <p className="placeholder">Answers locked — simulating the next minutes…</p>
                ) : lastResult ? (
                  <>
                    <p>{lastResult.text}</p>
                    <p><strong>Outcome: {lastResult.outcome}</strong></p>
                    {myResult && <p className="hint">{myResult.correct ? `✅ Correct! +${myResult.points} pts` : '❌ Not this time.'}</p>}
                  </>
                ) : <p className="placeholder">A prediction question will appear here.</p>}
                <h2>Your Score</h2>
                <p className="placeholder">{me ? `${me.score} points · streak ${me.streak} · ${me.correct}/${me.answered} correct` : '0 points'}</p>
              </article>
            </div>
          )}

          <article className="panel">
            <h2>Leaderboard</h2>
            {room.leaderboard.length === 0
              ? <p className="placeholder">Player scores will appear here.</p>
              : <ol className="leaderboard">{room.leaderboard.map((p) => (
                  <li key={p.id} className={p.id === playerId ? 'me' : ''}>
                    <span>#{p.rank} {p.name}{p.isBot ? ' 🤖' : ''}{p.isHost ? ' (host)' : ''}{p.connected ? '' : ' · offline'}</span>
                    <strong>{p.score} pts</strong>
                  </li>
                ))}</ol>}
          </article>

          {room.status === 'finished' && isHost && (
            <button disabled={busy} onClick={startGame}>↻ Play Again</button>
          )}
        </section>
      )}

      <footer>{room ? `Connected · Room ${room.code}` : 'Frontend + Socket.IO backend · run `npm run dev:all`'}</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
