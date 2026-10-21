// Static game data. Ratings (0-100) drive the simulation weights in matchEngine.
// Player names are only used to make event commentary feel real — swap for a
// real data feed (e.g. Premier League API) later without touching the engine.

export const TEAMS = [
  {
    id: 'blue-fc',
    name: 'Blue FC',
    shortName: 'BLU',
    home: true,
    ratings: { attack: 74, midfield: 71, defence: 70 },
    players: {
      forwards: ['Mason Reed', 'Leo Carter', 'Jayden Cole'],
      midfielders: ['Owen Blake', 'Felix Grant', 'Hugo Price'],
      defenders: ['Noah Frost', 'Ethan Ward', 'Lucas Hale'],
      goalkeeper: 'Tomás Rivera',
    },
  },
  {
    id: 'red-united',
    name: 'Red United',
    shortName: 'RED',
    home: false,
    ratings: { attack: 72, midfield: 69, defence: 73 },
    players: {
      forwards: ['Marcus Vale', 'Diego Santos', 'Kai Bennett'],
      midfielders: ['Ryan Doyle', 'Adam Kovač', 'Sam Whitfield'],
      defenders: ['Chris Osei', 'Victor Lind', 'Ben Archer'],
      goalkeeper: 'Jonas Weber',
    },
  },
];

export const getTeam = (id) => TEAMS.find((t) => t.id === id) ?? null;
