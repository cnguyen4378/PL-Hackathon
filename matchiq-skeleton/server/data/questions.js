import { TEAMS } from './teams.js';

// Prediction question templates. `eventTypes` are the canonical match-event
// types (see matchEngine) that count as the predicted thing happening.
// `windowMinutes` is how many simulated minutes the prediction covers —
// longer windows for rarer events so Yes/No stays roughly balanced.
export const QUESTION_TEMPLATES = [
  {
    id: 'shot',
    eventTypes: ['shot', 'shot_on_target', 'goal'],
    windowMinutes: 4,
    needsTeam: true,
    weight: 3,
    text: (team, w) => `Will ${team.name} take a shot in the next ${w} minutes?`,
  },
  {
    id: 'shot_on_target',
    eventTypes: ['shot_on_target', 'goal'],
    windowMinutes: 6,
    needsTeam: true,
    weight: 2,
    text: (team, w) => `Will ${team.name} get a shot on target in the next ${w} minutes?`,
  },
  {
    id: 'goal',
    eventTypes: ['goal'],
    windowMinutes: 8,
    needsTeam: false,
    weight: 2,
    text: (_team, w) => `Will there be a goal in the next ${w} minutes?`,
  },
  {
    id: 'team_goal',
    eventTypes: ['goal'],
    windowMinutes: 10,
    needsTeam: true,
    weight: 1,
    text: (team, w) => `Will ${team.name} score in the next ${w} minutes?`,
  },
  {
    id: 'corner',
    eventTypes: ['corner'],
    windowMinutes: 5,
    needsTeam: true,
    weight: 2,
    text: (team, w) => `Will ${team.name} win a corner in the next ${w} minutes?`,
  },
  {
    id: 'foul',
    eventTypes: ['foul', 'yellow_card'],
    windowMinutes: 3,
    needsTeam: true,
    weight: 2,
    text: (team, w) => `Will ${team.name} commit a foul in the next ${w} minutes?`,
  },
];

const pickWeighted = (items, rng) => {
  const total = items.reduce((s, i) => s + (i.weight ?? 1), 0);
  let r = rng() * total;
  for (const item of items) { r -= item.weight ?? 1; if (r <= 0) return item; }
  return items[items.length - 1];
};

/**
 * Build a concrete prediction. Avoids immediately repeating `avoidId`.
 * Returns { templateId, text, eventTypes, teamId|null, windowMinutes }
 */
export function buildQuestion(rng = Math.random, avoidId = null) {
  const pool = QUESTION_TEMPLATES.filter((t) => t.id !== avoidId);
  const template = pickWeighted(pool, rng);
  const team = template.needsTeam ? TEAMS[Math.floor(rng() * TEAMS.length)] : null;
  return {
    templateId: template.id,
    text: template.text(team, template.windowMinutes),
    eventTypes: template.eventTypes,
    teamId: team?.id ?? null,
    teamName: team?.name ?? null,
    windowMinutes: template.windowMinutes,
  };
}

/** Does a match event satisfy a prediction? */
export function eventMatchesPrediction(event, prediction) {
  if (!prediction.eventTypes.includes(event.type)) return false;
  if (prediction.teamId && event.teamId !== prediction.teamId) return false;
  return true;
}
