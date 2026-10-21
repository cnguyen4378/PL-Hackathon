import { getTeam } from '../data/teams.js';

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

const COMMENTARY = {
  goal: [
    (e) => `GOAL! ${e.player} finds the net for ${e.teamName}!`,
    (e) => `It's in! ${e.player} scores for ${e.teamName}!`,
  ],
  shot_on_target: [
    (e) => `${e.player} forces a save — shot on target for ${e.teamName}.`,
    (e) => `On target from ${e.player} (${e.teamName}), keeper deals with it.`,
  ],
  shot: [
    (e) => `${e.player} tries his luck for ${e.teamName} — off target.`,
    (e) => `Effort from ${e.player} (${e.teamName}) drifts wide.`,
  ],
  corner: [(e) => `Corner to ${e.teamName}.`, (e) => `${e.teamName} win a corner.`],
  foul: [
    (e) => `Foul by ${e.player} (${e.teamName}). Free kick.`,
    (e) => `${e.player} brings his man down — foul, ${e.teamName}.`,
  ],
  yellow_card: [(e) => `Yellow card for ${e.player} (${e.teamName}).`],
  offside: [(e) => `Offside against ${e.teamName}. Play is pulled back.`],
};

const emptyStats = () => ({ shots: 0, shotsOnTarget: 0, goals: 0, corners: 0, fouls: 0, yellowCards: 0 });

export function createMatch(homeTeam, awayTeam) {
  return {
    homeTeamId: homeTeam.id,
    awayTeamId: awayTeam.id,
    minute: 0,
    homeScore: 0,
    awayScore: 0,
    events: [], // chronological, newest simulation appended
    stats: { [homeTeam.id]: emptyStats(), [awayTeam.id]: emptyStats() },
    finished: false,
  };
}

/** Attacking team this minute, weighted by midfield + attack ratings. */
function pickAttackingTeam(match, rng) {
  const home = getTeam(match.homeTeamId);
  const away = getTeam(match.awayTeamId);
  const homeWeight = home.ratings.midfield + home.ratings.attack;
  const awayWeight = away.ratings.midfield + away.ratings.attack;
  return rng() * (homeWeight + awayWeight) < homeWeight ? home : away;
}

function playerFor(team, type, rng) {
  if (type === 'foul' || type === 'yellow_card') return pick([...team.players.defenders, ...team.players.midfielders], rng);
  return pick([...team.players.forwards, ...team.players.midfielders], rng);
}

/**
 * Advance the match by one minute. Returns an event object or null
 * (most minutes have no notable event). Mutates `match`.
 * Probabilities are tuned for ~2-3 goals and a steady event feed per 90 min.
 */
export function simulateMinute(match, rng = Math.random) {
  match.minute += 1;
  const team = pickAttackingTeam(match, rng);
  const stats = match.stats[team.id];
  const roll = rng();

  let type = null;
  if (roll < 0.16) {
    // Shot: 45% on target, 38% of those go in  (~2.7% goal chance / minute overall)
    const onTarget = rng() < 0.45;
    const goal = onTarget && rng() < 0.38;
    type = goal ? 'goal' : onTarget ? 'shot_on_target' : 'shot';
  } else if (roll < 0.24) type = 'corner';
  else if (roll < 0.38) type = rng() < 0.18 ? 'yellow_card' : 'foul';
  else if (roll < 0.42) type = 'offside';
  else return null;

  const event = {
    id: `${match.minute}-${match.events.length}`,
    minute: match.minute,
    type,
    teamId: team.id,
    teamName: team.name,
    player: playerFor(team, type, rng),
  };
  event.text = pick(COMMENTARY[type], rng)(event);

  if (type === 'shot' || type === 'shot_on_target' || type === 'goal') stats.shots += 1;
  if (type === 'shot_on_target' || type === 'goal') stats.shotsOnTarget += 1;
  if (type === 'goal') {
    stats.goals += 1;
    if (team.home) match.homeScore += 1; else match.awayScore += 1;
  }
  if (type === 'corner') stats.corners += 1;
  if (type === 'foul' || type === 'yellow_card') stats.fouls += 1;
  if (type === 'yellow_card') stats.yellowCards += 1;

  match.events.push(event);
  return event;
}

/** Public (serializable) view of a match — newest events first for feeds. */
export function serializeMatch(match) {
  return {
    ...match,
    events: [...match.events].reverse(),
    homeTeam: getTeam(match.homeTeamId),
    awayTeam: getTeam(match.awayTeamId),
  };
}
