// Test del contesto: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../docs/context.js');
const T = require('../docs/templates.js');
const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('lettura dei risultati con primo tempo', () => {
  const g = C.parseScores('2-1 (1-0), 0-0; 3-2\n1–1 (0-1)');
  assert.equal(g.length, 4);
  assert.deepEqual(g[0], { f: 2, a: 1, hf: 1, ha: 0 });
  assert.deepEqual(g[1], { f: 0, a: 0 });
  assert.deepEqual(g[3], { f: 1, a: 1, hf: 0, ha: 1 });
});

test('primo tempo impossibile viene ignorato', () => {
  assert.deepEqual(C.parseScores('1-0 (2-0)')[0], { f: 1, a: 0 });
});

test('riepilogo della forma', () => {
  const s = C.summary(C.parseScores('2-1, 0-0, 1-3, 2-0, 1-1'));
  assert.equal(s.pts, 8);
  close(s.gf, 1.2); close(s.ga, 1.0);
  assert.equal(s.o25, 2); assert.equal(s.btts, 3); assert.equal(s.cs, 2); assert.equal(s.fts, 1);
});

test('esito della domanda su un risultato', () => {
  const sc = { h: 2, a: 1, hh: 1, ha: 0 };
  assert.equal(C.evalEvent('goals_total', { period: 'FT', line: '2.5' }, sc), true);
  assert.equal(C.evalEvent('goals_total', { period: '1T', line: '1.5' }, sc), false);
  assert.equal(C.evalEvent('goals_total', { period: '2T', line: '1.5' }, sc), true);
  assert.equal(C.evalEvent('btts', { period: 'FT' }, sc), true);
  assert.equal(C.evalEvent('team_goals', { team: 'away', period: 'FT', line: '1.5' }, sc), false);
  assert.equal(C.evalEvent('match_result', { outcome: 'home', period: 'FT' }, sc), true);
  assert.equal(C.evalEvent('match_result', { outcome: 'draw', period: '1T' }, sc), false);
  assert.equal(C.evalEvent('goals_total', { period: '1T', line: '0.5' }, { h: 1, a: 0 }), null);
  assert.equal(C.evalEvent('corners', { line: '9.5' }, sc), null);
});

test('ultime partite della squadra ospite: la squadra va al posto dell\'ospite', () => {
  // Juventus (ospite) ha segnato 2+ gol in 3 delle ultime 5
  const s = { type: 'team_goals', event: { home: 'Genoa', away: 'Juventus' }, params: { team: 'away', period: 'FT', line: '1.5' },
    ctx: { home: {}, away: { last5: '2-0, 2-2, 0-3, 2-1, 1-1' }, match: {} } };
  const parts = C.freqParts(s);
  assert.equal(parts.length, 1);
  close(parts[0].p, 0.6);
});

test('moltiplicatori del contesto', () => {
  const s = { event: { home: 'A', away: 'B' }, ctx: {
    home: { attAbs: '1', rest: '2', turnover: 'cup' }, away: { defAbs: '2', motiv: 'high' }, match: { kind: 'big', weather: 'rain' } } };
  const M = C.multipliers(s, 'goals');
  close(M.home, 0.93 * 1.10 * 0.94 * 0.95 * 0.93 * 0.95);
  close(M.away, 1.03 * 1.03 * 1.05 * 0.93 * 0.95);
  const N = C.multipliers(s, 'goals', true);
  assert.equal(N.home, 1); assert.equal(N.effects.length, 0);
  close(C.multipliers({ ctx: { home: {}, away: {}, match: { kind: 'derby' } } }, 'cards').total, 1.15);
});

test('runModel pesa le stime e misura il contesto', () => {
  const s = { type: 'goals_total', event: { home: 'PSG', away: 'Lione' }, params: { period: '1T', line: '1.5', side: 'pos' },
    stats: { hS: '0.43', hC: '0.57', aS: '0.86', aC: '0.43', hPct: '14', aPct: '43' }, ctx: { home: {}, away: {}, match: {} } };
  const m = T.runModel(s);
  close(m.pS, (0.5 * 0.3174 + 0.25 * 0.285) / 0.75);
  s.ctx.match.kind = 'big';
  const withCtx = T.runModel(s), without = T.runModel(s, { neutral: true });
  assert.ok(withCtx.pS < without.pS);
  close(without.pS, m.pS);
});

test('stato vecchio senza contesto non rompe nulla', () => {
  for (const t of T.list) {
    const s = { type: t.id, event: {}, params: Object.assign({}, t.defaults.params), stats: {}, ctx: { big: -1 } };
    const m = T.runModel(s);
    assert.equal(m.pS, null);
  }
});
