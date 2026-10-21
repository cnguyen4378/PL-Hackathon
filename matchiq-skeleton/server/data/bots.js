// Mock bot players for demo / solo testing.
// yesBias: probability the bot answers "Yes" (personality, not skill —
// they don't know the outcome). reaction: fraction of the answer window
// the bot waits before answering (affects their speed bonus).
export const BOT_PROFILES = [
  { name: 'Bot Alex', yesBias: 0.55, reaction: [0.05, 0.3] },
  { name: 'Bot Maya', yesBias: 0.4, reaction: [0.2, 0.6] },
  { name: 'Bot Sam', yesBias: 0.65, reaction: [0.1, 0.45] },
  { name: 'Bot Jordan', yesBias: 0.5, reaction: [0.3, 0.8] },
  { name: 'Bot Riley', yesBias: 0.35, reaction: [0.05, 0.2] },
  { name: 'Bot Quinn', yesBias: 0.6, reaction: [0.4, 0.85] },
  { name: 'Bot Taylor', yesBias: 0.45, reaction: [0.15, 0.5] },
  { name: 'Bot Casey', yesBias: 0.5, reaction: [0.25, 0.7] },
];
