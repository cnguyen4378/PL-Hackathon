export const CONFIG = {
  port: Number(process.env.PORT || 3001),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',

  // Match / round pacing (tuned for a 3-5 minute hackathon demo, not 90 real minutes)
  matchMinutes: 90,
  minuteStepMs: Number(process.env.MINUTE_STEP_MS || 650), // sim speed during a prediction window
  answerWindowMs: Number(process.env.ANSWER_WINDOW_MS || 10000),
  resultPauseMs: Number(process.env.RESULT_PAUSE_MS || 4500),
  firstQuestionDelayMs: 1500,

  // Scoring
  points: {
    correctBase: 100,
    maxSpeedBonus: 50, // linear: faster answer = more bonus
    streakBonusPerLevel: 10, // bonus per streak level above 1
    maxStreakBonus: 30,
  },

  roomCodeLength: 4,
  emptyRoomTtlMs: 60_000,
};
