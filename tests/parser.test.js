// Test del riconoscimento delle domande: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../docs/parser.js');

const QUIZ = `FRA Ligue 1
Paris Saint-Germain
v/s
Lione
Almeno 2 goal segnati nel 1° tempo?`;

const withQ = q => `ITA Serie A\nInter\nv/s\nMilan\n${q}`;

test('blocco del quiz PSG–Lione', () => {
  const r = P.parse(QUIZ);
  assert.equal(r.event.comp, 'Ligue 1');
  assert.equal(r.event.home, 'Paris Saint-Germain');
  assert.equal(r.event.away, 'Lione');
  assert.equal(r.type, 'goals_total');
  assert.deepEqual(r.params, { period: '1T', line: '1.5', side: 'pos' });
});

test('squadre su una riga sola', () => {
  const r = P.parse('Serie A\nInter - Milan\nCi saranno più di 2,5 gol?');
  assert.equal(r.event.home, 'Inter');
  assert.equal(r.event.away, 'Milan');
  assert.deepEqual(r.params, { period: 'FT', line: '2.5', side: 'pos' });
});

test('meno di 3 gol = Under 2,5', () => {
  const r = P.parse(withQ('Meno di 3 gol nella partita?'));
  assert.equal(r.type, 'goals_total');
  assert.deepEqual(r.params, { period: 'FT', line: '2.5', side: 'neg' });
});

test('nessun gol nel secondo tempo', () => {
  const r = P.parse(withQ('Nessun gol nel secondo tempo?'));
  assert.deepEqual(r.params, { period: '2T', line: '0.5', side: 'neg' });
});

test('segnano entrambe', () => {
  const r = P.parse(withQ('Entrambe le squadre segneranno?'));
  assert.equal(r.type, 'btts');
  assert.equal(r.params.side, 'pos');
});

test('vittoria di una squadra', () => {
  const r = P.parse(withQ("L'Inter vincerà la partita?"));
  assert.equal(r.type, 'match_result');
  assert.equal(r.params.outcome, 'home');
  assert.equal(r.params.side, 'pos');
});

test('non perde = l\'altra squadra non vince', () => {
  const r = P.parse(withQ('Il Milan non perderà?'));
  assert.equal(r.type, 'match_result');
  assert.equal(r.params.outcome, 'home');
  assert.equal(r.params.side, 'neg');
});

test('pareggio', () => {
  const r = P.parse(withQ('La partita finirà in pareggio?'));
  assert.equal(r.params.outcome, 'draw');
});

test('sigla della squadra: PSG', () => {
  const r = P.parse(QUIZ.replace('Almeno 2 goal segnati nel 1° tempo?', 'Il PSG vincerà?'));
  assert.equal(r.type, 'match_result');
  assert.equal(r.params.outcome, 'home');
});

test('porta inviolata', () => {
  const r = P.parse(withQ("L'Inter non subirà gol?"));
  assert.equal(r.type, 'team_goals');
  assert.deepEqual(r.params, { team: 'away', period: 'FT', line: '0.5', side: 'neg' });
});

test('gol di una squadra', () => {
  const r = P.parse(withQ('Il Milan segnerà almeno 2 gol?'));
  assert.equal(r.type, 'team_goals');
  assert.deepEqual(r.params, { team: 'away', period: 'FT', line: '1.5', side: 'pos' });
});

test('calci d\'angolo con decimale', () => {
  const r = P.parse(withQ("Ci saranno più di 9,5 calci d'angolo?"));
  assert.equal(r.type, 'corners');
  assert.equal(r.params.line, '9.5');
});

test('cartellini', () => {
  const r = P.parse(withQ('Almeno 5 cartellini nella partita?'));
  assert.equal(r.type, 'cards');
  assert.equal(r.params.line, '4.5');
});

test('marcatore', () => {
  const r = P.parse(withQ('Lautaro Martinez segnerà?'));
  assert.equal(r.type, 'player_scores');
  assert.equal(r.params.player, 'Lautaro Martinez');
});

test('basket: totale punti', () => {
  const r = P.parse('NBA\nLakers vs Celtics\nPiù di 220,5 punti totali?');
  assert.equal(r.type, 'points_total');
  assert.equal(r.event.sport, 'Basket');
  assert.equal(r.params.line, '220.5');
});

test('tennis va su "altro"', () => {
  const r = P.parse('ATP Parigi\nSinner - Alcaraz\nSinner vincerà il primo set?');
  assert.equal(r.type, 'generic');
  assert.equal(r.event.sport, 'Tennis');
});

test('solo la domanda, senza intestazione', () => {
  const r = P.parse('Almeno 3 gol nella partita?');
  assert.equal(r.type, 'goals_total');
  assert.equal(r.params.line, '2.5');
  assert.equal(r.event.home, '');
});

test('presente e "nel match": Genoa–Juventus', () => {
  const r = P.parse('ITA Serie A\nGenoa\nv/s\nJuventus\nLa Juventus segna almeno 2 goal nel match?');
  assert.equal(r.event.comp, 'Serie A');
  assert.equal(r.type, 'team_goals');
  assert.deepEqual(r.params, { team: 'away', period: 'FT', line: '1.5', side: 'pos' });
});

test('due blocchi incollati: vale l\'ultimo', () => {
  const r = P.parse('FRA Ligue 1\nParis Saint-Germain\nv/s\nLione\nAlmeno 2 goal segnati nel 1° tempo?\nITA Serie A\nGenoa\nv/s\nJuventus\nLa Juventus segna almeno 2 goal nel match?');
  assert.equal(r.event.home, 'Genoa');
  assert.equal(r.event.comp, 'Serie A');
  assert.equal(r.type, 'team_goals');
});
