// Test dei dati automatici delle partite: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../docs/context.js');
global.BLContext = C;
const M = require('../docs/matchdata.js');
const aliases = require('../docs/data/aliases.json').aliases;

const DATA = {
  updated: '2026-11-04T10:00:00Z',
  fixtures: [
    { id: 9, utc: '2026-11-04T20:00Z', comp: 'CL', compName: 'UEFA Champions League', home: 546, away: 7397,
      h2h: [['2025-10-01', 'CL', 2, 1, 1, 0]] },
    { id: 10, utc: '2026-11-05T20:00Z', comp: 'CL', compName: 'UEFA Champions League', home: 523, away: 108 }
  ],
  teams: {
    546: { name: 'Racing Club de Lens', short: 'Lens', tla: 'RCL', pos: { comp: 'FL1', position: 3 },
      matches: [
        ['2026-11-01', 'FL1', 1, 'Nice', 2, 0, 1, 0], ['2026-10-25', 'FL1', 0, 'PSG', 1, 2, 0, 1],
        ['2026-10-21', 'CL', 1, 'Brugge', 1, 1, 0, 0], ['2026-10-18', 'FL1', 1, 'Lille', 3, 1, 2, 0],
        ['2026-10-04', 'FL1', 1, 'Brest', 0, 0, 0, 0], ['2026-09-27', 'FL1', 1, 'Lyon', 2, 2, 1, 1]
      ],
      next: [['2026-11-04T20:00Z', 'CL', 1, 'Como'], ['2026-11-08T16:00Z', 'FL1', 0, 'Monaco']] },
    7397: { name: 'Como 1907', short: 'Como', tla: 'COM', pos: { comp: 'SA', position: 5 },
      matches: [
        ['2026-11-01', 'SA', 0, 'Torino', 2, 1, 1, 0], ['2026-10-27', 'SA', 0, 'Torino', 1, 1, 0, 1],
        ['2026-10-21', 'CL', 0, 'Lens', 0, 0, 0, 0], ['2026-10-12', 'SA', 0, 'Roma', 0, 1, 0, 0]
      ],
      next: [['2026-11-08T14:00Z', 'SA', 1, 'Inter']],
      absences: { infortunati: [{ nome: 'Diao', nota: 'Lesione muscolare' }] },
      news: [{ title: 'Como, Fabregas pensa al turnover', source: 'Sky Sport', sky: true, alerts: ['turnover'] }] },
    523: { name: 'Olympique Lyonnais', short: 'Lyon', tla: 'OL', matches: [], next: [] },
    108: { name: 'FC Internazionale Milano', short: 'Inter', tla: 'INT', matches: [], next: [] }
  }
};
M.setData(DATA, aliases);

function state(type, params) {
  return { type, params, event: { home: 'Lens', away: 'Como', comp: 'Champions League' }, stats: {}, sample: {}, ctx: C.blankCtx() };
}

test('trova le squadre con i nomi italiani', () => {
  assert.equal(M.findTeam('Lione').short, 'Lyon');
  assert.equal(M.findTeam('Inter').short, 'Inter');
  assert.equal(M.findTeam('Como').short, 'Como');
  assert.equal(M.findTeam('Squadra inesistente'), null);
});

test('trova la partita anche a squadre invertite', () => {
  assert.equal(M.findFixture('Lens', 'Como').id, 9);
  const f = M.findFixture('Como', 'Lens');
  assert.equal(f.id, 9); assert.equal(f.swapped, true);
  assert.equal(M.findFixture('Lione', 'Inter').id, 10);
});

test('Lens segna almeno un gol nel primo tempo: compila tutto', () => {
  const s = state('team_goals', { team: 'home', period: '1T', line: '0.5', side: 'pos' });
  const r = M.fill(s, { now: Date.parse('2026-11-04T12:00:00Z') });
  assert.equal(r.ok, true);
  assert.equal(r.fixture.id, 9);
  // Lens in casa ha 5 partite (>= 4): medie del primo tempo in casa
  assert.equal(s.stats.hS, '0,8');     // (1+0+2+0+1) / 5
  assert.equal(s.stats.tPct, '60');    // primo tempo con gol del Lens: 3 su 5
  // Como in trasferta: 4 partite
  assert.equal(s.stats.aS, '0,25');
  assert.equal(s.sample.nH, '5');
  assert.equal(s.ctx.home.last5, '2-0 (1-0), 1-2 (0-1), 1-1 (0-0), 3-1 (2-0), 0-0 (0-0)');
  assert.equal(s.ctx.match.h2h, '2-1 (1-0)');
  assert.equal(s.ctx.home.rest, '3');
  assert.equal(s.ctx.home.pos, '3');
  assert.equal(s.event.comp, 'UEFA Champions League');
  assert.equal(r.info.awayAbs.infortunati[0].nome, 'Diao');
  assert.equal(r.info.awayNews[0].alerts[0], 'turnover');
  assert.ok(r.filled.includes('s_hS'));
});

test('domanda con squadre al contrario: precedenti girati', () => {
  const s = state('goals_total', { period: 'FT', line: '2.5', side: 'pos' });
  s.event = { home: 'Como', away: 'Lens' };
  M.fill(s, { now: Date.parse('2026-11-04T12:00:00Z') });
  assert.equal(s.ctx.match.h2h, '1-2 (0-1)');
  assert.equal(s.ctx.home.last5.split(', ')[0], '2-1 (1-0)');   // il Como è la "casa" della domanda
});

test('turnover: big match di Champions entro 4 giorni dopo una partita di campionato', () => {
  const d = JSON.parse(JSON.stringify(DATA));
  d.fixtures = [{ id: 11, utc: '2026-11-01T17:00Z', comp: 'SA', compName: 'Serie A', home: 7397, away: 108 }];
  d.teams[7397].next = [['2026-11-01T17:00Z', 'SA', 1, 'Inter'], ['2026-11-04T20:00Z', 'CL', 0, 'Lens']];
  const s = state('goals_total', { period: 'FT', line: '2.5', side: 'pos' });
  s.event = { home: 'Como', away: 'Inter' };
  M.fill(s, { data: d, now: Date.parse('2026-11-01T10:00:00Z') });
  assert.equal(s.ctx.home.turnover, 'cup');
});
