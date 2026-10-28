// Test dei calcoli: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../docs/engine.js');
const T = require('../docs/templates.js');

const close = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('quote a due vie: margine e probabilità senza margine', () => {
  const r = E.fairFromOdds({ a: '1,85', b: '1.80' }, 2, 0);
  close(r.margin, 0.0961);
  close(r.p, 0.4932);
});

test('quote a tre vie: esito selezionato', () => {
  const r = E.fairFromOdds({ a: '2', b: '3.5', c: '4' }, 3, 1);
  const inv = [0.5, 1 / 3.5, 0.25], s = inv[0] + inv[1] + inv[2];
  close(r.p, inv[1] / s);
});

test('quote non valide restituiscono null', () => {
  assert.equal(E.fairFromOdds({ a: '', b: '1.8' }, 2, 0), null);
  assert.equal(E.fairFromOdds({ a: '0.9', b: '1.8' }, 2, 0), null);
});

test('Poisson: almeno 2 con media 1,145', () => {
  close(E.poissonOver(1.145, 1.5), 0.3174);
});

test('distribuzione Poisson somma a 1', () => {
  const d = E.poissonDist(2.3, 5);
  close(d.reduce((a, x) => a + x.p, 0), 1, 1e-9);
});

test('1X2 da Poisson somma a 1 e la favorita è avanti', () => {
  const r = E.matchProbs(1.8, 0.9);
  close(r.home + r.draw + r.away, 1, 1e-9);
  assert.ok(r.home > r.away);
});

test('normale: soglia uguale alla media = 50%', () => {
  close(E.normalOver(220, 18, 220), 0.5, 1e-6);
});

test('fusione: 60% quote, 40% statistiche, contesto', () => {
  const adj = E.contextAdj({ a: -1, b: -1, c: -1, d: 1 });
  close(adj, -0.05);
  const { base, p } = E.blend({ pM: 0.5, pS: 0.3, adj, w: 0.6 });
  close(base, 0.42);
  close(p, 0.37);
});

test('contesto limitato a 12,5 punti', () => {
  close(E.contextAdj({ a: 1, b: 1, c: 1, d: 1, e: 1, f: 1, g: 1 }), 0.125);
});

test('esempio PSG–Lione: gol nel primo tempo', () => {
  const s = {
    event: { home: 'PSG', away: 'Lione' },
    params: { period: '1T', line: '1.5' },
    stats: { hS: '0.43', hC: '0.57', aS: '0.86', aC: '0.43', hPct: '14', aPct: '43' }
  };
  const m = T.byId('goals_total').model(s);
  close(m.parts[0].p, 0.3174);
  close(m.parts[1].p, 0.285);
  close(m.pS, 0.3012);
  assert.ok(m.dist.some(d => d.si));
});

test('ogni tipo produce descrizione e modello senza errori con dati vuoti', () => {
  for (const t of T.list) {
    const s = { event: {}, params: Object.assign({}, t.defaults.params), stats: {} };
    const d = t.describe(s);
    assert.ok(d.si && d.no && d.market);
    const m = t.model(s);
    assert.equal(m.pS, null);
    const sc = t.scenarios(s, m);
    assert.ok(sc.si.length && sc.no.length);
  }
});
