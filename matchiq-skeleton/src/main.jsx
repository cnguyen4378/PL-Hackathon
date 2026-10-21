import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  const [screen, setScreen] = useState('home');
  const [roomCode, setRoomCode] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [answer, setAnswer] = useState('');

  return <main className="app">
    <header><button className="brand" onClick={() => setScreen('home')}>⚽ MatchIQ</button><span>Football Prediction Game</span></header>
    {screen === 'home' && <section className="home panel">
      <p className="eyebrow">WELCOME TO MATCHIQ</p>
      <h1>Predict the next play.</h1>
      <p>Play along with friends during a simulated football match.</p>
      <div className="actions"><button onClick={() => setScreen('host')}>Create Room</button><button className="secondary" onClick={() => setScreen('join')}>Join Room</button></div>
    </section>}
    {screen === 'join' && <section className="panel narrow">
      <h1>Join a room</h1><label>Your name<input value={playerName} onChange={e => setPlayerName(e.target.value)} placeholder="Alex" /></label>
      <label>Room code<input value={roomCode} onChange={e => setRoomCode(e.target.value.toUpperCase())} placeholder="ABCD" maxLength={6}/></label>
      <button onClick={() => setScreen('player')}>Continue to Player View</button><p className="hint">Demo only — room codes are not connected yet.</p>
    </section>}
    {screen === 'host' && <section>
      <div className="heading"><div><p className="eyebrow">HOST DASHBOARD</p><h1>Match Overview</h1></div><span className="pill">Demo Room: ABCD</span></div>
      <div className="panel scoreboard"><div><strong>Blue FC</strong><small>Home</small></div><div className="score">0 <span>–</span> 0 <small>00:00</small></div><div><strong>Red United</strong><small>Away</small></div></div>
      <div className="columns"><article className="panel"><h2>Match Events</h2><p className="placeholder">Match events will appear here.</p></article><article className="panel"><h2>Current Prediction</h2><p className="placeholder">A prediction question will appear here.</p></article></div>
      <article className="panel"><h2>Leaderboard</h2><p className="placeholder">Player scores will appear here.</p></article>
      <button className="secondary" onClick={() => setScreen('player')}>Preview Player View →</button>
    </section>}
    {screen === 'player' && <section className="narrow">
      <div className="heading"><div><p className="eyebrow">PLAYER VIEW</p><h1>Make Your Prediction</h1></div><span className="pill">{roomCode || 'ABCD'}</span></div>
      <article className="panel"><p className="eyebrow">SAMPLE QUESTION</p><h2>Will Blue FC take a shot in the next minute?</h2><div className="actions"><button className={answer === 'Yes' ? '' : 'secondary'} onClick={() => setAnswer('Yes')}>Yes</button><button className={answer === 'No' ? '' : 'secondary'} onClick={() => setAnswer('No')}>No</button></div><p className="hint">{answer ? `Selected: ${answer} (demo only)` : 'Choose an answer to preview the interaction.'}</p></article>
      <article className="panel"><h2>Your Score</h2><p className="placeholder">0 points</p></article>
    </section>}
    <footer>Frontend skeleton • No backend or live game logic yet</footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<App />);
