// Test della lettura del testo di una pagina: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../docs/importer.js');

// Testo di prova con la stessa struttura delle pagine (quote inventate).
const SISAL = `Sisal Matchpoint
Calcio
Champions League
Lens - Como
Mer 04/11 21:00
1X2
1
2.45
X
3.30
2
2.80
U/O 2.5
UNDER
1.85
OVER
1.90
Goal/No Goal
GOAL
1.70
NOGOAL
2.05
U/O 0.5 1° Tempo
UNDER
2.60
OVER
1.45
U/O 1.5 1° Tempo
UNDER
1.30
OVER
3.20
Lens U/O 0.5 1° Tempo
UNDER
1.62
OVER
2.15
U/O Corner 9.5
UNDER
1.80
OVER
1.90`;

const QUIZ = `Salva il Bottino
Gioco 72
Domanda 4 di 15
INT Champions League
Lens
v/s
Como
Il Lens segna almeno 1 goal nel primo tempo?
SÌ
NO`;

test('trova il blocco della domanda del quiz', () => {
  const b = I.quizBlocks(QUIZ);
  assert.equal(b.length, 1);
  assert.equal(b[0].comp, 'INT Champions League');
  assert.equal(b[0].home, 'Lens');
  assert.equal(b[0].question, 'Il Lens segna almeno 1 goal nel primo tempo?');
  assert.equal(b[0].text, 'INT Champions League\nLens\nv/s\nComo\nIl Lens segna almeno 1 goal nel primo tempo?');
});

test('legge i mercati con le quote', () => {
  const m = I.markets(SISAL);
  assert.equal(m.length, 7);
  assert.equal(m[0].title, '1X2');
  assert.deepEqual(m[0].outcomes.map(o => o.label), ['1', 'X', '2']);
  assert.equal(m[4].title, 'U/O 1.5 1° Tempo');
  assert.equal(m[4].outcomes[1].odd, 3.2);
});

test('sceglie il mercato giusto: gol del Lens nel primo tempo', () => {
  const q = { type: 'team_goals', params: { team: 'home', period: '1T', line: '0.5', side: 'pos' }, home: 'Lens', away: 'Como' };
  const r = I.rank(I.markets(SISAL), q);
  assert.equal(r[0].title, 'Lens U/O 0.5 1° Tempo');
  assert.deepEqual(I.toOdds(r[0], q), { a: '2,15', b: '1,62', c: '' });
});

test('sceglie il mercato giusto: almeno 2 gol nel primo tempo', () => {
  const q = { type: 'goals_total', params: { period: '1T', line: '1.5', side: 'pos' }, home: 'Lens', away: 'Como' };
  const r = I.rank(I.markets(SISAL), q);
  assert.equal(r[0].title, 'U/O 1.5 1° Tempo');
  assert.deepEqual(I.toOdds(r[0], q), { a: '3,20', b: '1,30', c: '' });
});

test('domanda al contrario: meno di 3 gol → il Sì è l\'Under', () => {
  const q = { type: 'goals_total', params: { period: 'FT', line: '2.5', side: 'neg' }, home: 'Lens', away: 'Como' };
  const r = I.rank(I.markets(SISAL), q);
  assert.equal(r[0].title, 'U/O 2.5');
  assert.deepEqual(I.toOdds(r[0], q), { a: '1,85', b: '1,90', c: '' });
});

test('esito finale e segnano entrambe', () => {
  const q1 = { type: 'match_result', params: { outcome: 'home', period: 'FT', side: 'pos' }, home: 'Lens', away: 'Como' };
  const r1 = I.rank(I.markets(SISAL), q1);
  assert.equal(r1[0].title, '1X2');
  assert.deepEqual(I.toOdds(r1[0], q1), { a: '2,45', b: '3,30', c: '2,80' });
  const q2 = { type: 'btts', params: { period: 'FT', side: 'pos' }, home: 'Lens', away: 'Como' };
  assert.equal(I.rank(I.markets(SISAL), q2)[0].title, 'Goal/No Goal');
});

test('corner non si confondono con i gol', () => {
  const q = { type: 'corners', params: { period: 'FT', line: '9.5', side: 'pos' }, home: 'Lens', away: 'Como' };
  assert.equal(I.rank(I.markets(SISAL), q)[0].title, 'U/O Corner 9.5');
});

test('quote con soglia nell\'etichetta (altri bookmaker)', () => {
  const txt = 'Totale gol\nOver 1.5\n1.25\nUnder 1.5\n3.80\nOver 2.5\n1.80\nUnder 2.5\n2.00';
  const m = I.markets(txt);
  assert.deepEqual(m.map(x => x.title), ['Totale gol 1.5', 'Totale gol 2.5']);
  const q = { type: 'goals_total', params: { period: 'FT', line: '2.5', side: 'pos' }, home: 'A', away: 'B' };
  assert.deepEqual(I.toOdds(I.rank(m, q)[0], q), { a: '1,80', b: '2,00', c: '' });
});
