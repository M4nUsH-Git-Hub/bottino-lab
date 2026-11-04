/* Bottino Lab — dati automatici delle partite.
   Legge matches.json (scritto ogni ora dal workflow "Dati partite" sul ramo match-data),
   trova la partita della domanda dai nomi delle squadre e compila statistiche, forma, precedenti
   e contesto. Funziona nel browser (window.BLMatch) e in Node per i test. */
(function (root) {
  'use strict';
  const C = root.BLContext || (typeof require !== 'undefined' ? require('./context.js') : null);
  const DATA_URL = 'https://raw.githubusercontent.com/M4nUsH-Git-Hub/bottino-lab/match-data/matches.json';

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const STOP = new Set(['fc', 'ac', 'as', 'ss', 'ssc', 'cf', 'sc', 'cp', 'sl', 'club', 'de', 'calcio', 'rc', 'afc', 'cfc', 'us', 'the', '1907', '1909', '1913']);
  const tokens = s => norm(s).split(' ').filter(w => w.length > 1 && !STOP.has(w));

  let DATA = null, ALIASES = {}, loading = null;

  // ---------- nomi ----------
  function variants(name) {
    const n = norm(name), out = new Set([n]);
    if (ALIASES[n]) ALIASES[n].forEach(v => out.add(norm(v)));
    Object.keys(ALIASES).forEach(k => { if (ALIASES[k].some(v => norm(v) === n)) { out.add(norm(k)); ALIASES[k].forEach(v => out.add(norm(v))); } });
    return [...out].filter(Boolean);
  }
  // 3 = nome identico, 2 = un nome contiene l'altro, 1 = una parola significativa in comune
  function nameScore(team, query) {
    const names = [team.short, team.name, team.tla].map(norm).filter(Boolean);
    let best = 0;
    for (const q of variants(query)) {
      for (const n of names) {
        if (n === q) best = Math.max(best, 3);
        else if ((` ${n} `).includes(` ${q} `) || (` ${q} `).includes(` ${n} `)) best = Math.max(best, 2);
        else {
          const tq = tokens(q), tn = tokens(n);
          if (tq.some(t => t.length >= 4 && tn.includes(t))) best = Math.max(best, 1);
        }
      }
    }
    return best;
  }
  function findTeam(name, data) {
    const d = data || DATA;
    if (!d || !name) return null;
    let best = null, bs = 0;
    for (const id in d.teams) {
      const sc = nameScore(d.teams[id], name);
      if (sc > bs) { bs = sc; best = id; }
    }
    return bs >= 2 ? Object.assign({ id: best, score: bs }, d.teams[best]) : null;
  }
  // La partita della domanda: entrambe le squadre devono corrispondere; a parità vale la più vicina nel tempo.
  function findFixture(home, away, data, now) {
    const d = data || DATA;
    if (!d || !home || !away) return null;
    const t0 = (now || Date.now());
    let best = null, bs = 0;
    for (const f of d.fixtures || []) {
      const th = d.teams[f.home], ta = d.teams[f.away];
      if (!th || !ta) continue;
      const a = Math.min(nameScore(th, home), nameScore(ta, away));
      const b = Math.min(nameScore(th, away), nameScore(ta, home));
      const sc = Math.max(a, b * 0.9);
      const dist = Math.abs(Date.parse(f.utc) - t0) / 864e5;
      const val = sc - Math.min(dist, 30) * 0.01;
      if (sc >= 1 && val > bs) { bs = val; best = Object.assign({ swapped: b > a }, f); }
    }
    return best;
  }

  // ---------- numeri dalle partite ----------
  // riga partita: [data, comp, casa(1/0), avversario, gol fatti, gol subiti, primo tempo fatti, primo tempo subiti]
  function goalsIn(m, period) {
    if (period === '1T') return m[6] == null ? null : [m[6], m[7]];
    if (period === '2T') return m[6] == null ? null : [m[4] - m[6], m[5] - m[7]];
    return [m[4], m[5]];
  }
  function venueList(team, venue) {
    const all = team.matches || [];
    const v = all.filter(m => m[2] === venue);
    return v.length >= 4 ? { list: v, venue: true } : { list: all, venue: false };
  }
  function averages(list, period) {
    let n = 0, gf = 0, ga = 0;
    list.forEach(m => { const g = goalsIn(m, period); if (g) { n++; gf += g[0]; ga += g[1]; } });
    return n ? { n, gf: gf / n, ga: ga / n } : null;
  }
  const asScore = (m, side) => side === 'home'
    ? { h: m[4], a: m[5], hh: m[6] == null ? undefined : m[6], ha: m[7] == null ? undefined : m[7] }
    : { h: m[5], a: m[4], hh: m[7] == null ? undefined : m[7], ha: m[6] == null ? undefined : m[6] };
  function eventPct(type, params, list, side) {
    let k = 0, n = 0;
    list.forEach(m => { const r = C.evalEvent(type, params, asScore(m, side)); if (r != null) { n++; if (r) k++; } });
    return n ? { pct: Math.round(k / n * 100), k, n } : null;
  }
  const fmtScore = m => `${m[4]}-${m[5]}${m[6] != null ? ` (${m[6]}-${m[7]})` : ''}`;
  const d2 = x => (Math.round(x * 100) / 100).toString().replace('.', ',');

  function localWhen(utc) {
    const d = new Date(utc);
    if (!Number.isFinite(d.getTime())) return '';
    return d.toLocaleString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  }

  // Compila lo stato della domanda con i dati della partita. Restituisce cosa è stato compilato e cosa sapere.
  function fill(state, opts) {
    const d = (opts && opts.data) || DATA;
    const out = { ok: false, filled: [], info: {}, fixture: null, teams: {} };
    if (!d || !C.supportsScores(state.type) && !['player_scores'].includes(state.type)) return out;
    const ev = state.event || {};
    const fx = findFixture(ev.home, ev.away, d, opts && opts.now);
    let th, ta;
    if (fx) {
      th = Object.assign({ id: String(fx.swapped ? fx.away : fx.home) }, d.teams[fx.swapped ? fx.away : fx.home]);
      ta = Object.assign({ id: String(fx.swapped ? fx.home : fx.away) }, d.teams[fx.swapped ? fx.home : fx.away]);
    } else {
      th = findTeam(ev.home, d); ta = findTeam(ev.away, d);
    }
    if (!th || !ta) return out;
    out.ok = true; out.fixture = fx; out.teams = { home: th, away: ta };
    const period = (state.params && state.params.period) || 'FT';
    const H = venueList(th, 1), A = venueList(ta, 0);
    const ah = averages(H.list, period), aa = averages(A.list, period);
    const set = (k, v) => { if (v == null || !Number.isFinite(v)) return; state.stats[k] = d2(v); out.filled.push('s_' + k); };
    if (ah) { set('hS', ah.gf); set('hC', ah.ga); }
    if (aa) { set('aS', aa.gf); set('aC', aa.ga); }
    const ph = eventPct(state.type, state.params, H.list, 'home'), pa = eventPct(state.type, state.params, A.list, 'away');
    if (['goals_total', 'btts'].includes(state.type)) {
      if (ph) set('hPct', ph.pct);
      if (pa) set('aPct', pa.pct);
    } else if (state.type === 'team_goals') {
      const mine = state.params.team === 'away' ? pa : ph;
      if (mine) set('tPct', mine.pct);
    } else if (state.type === 'match_result') {
      const mean = [ph, pa].filter(Boolean);
      if (mean.length) set('tPct', mean.reduce((s, x) => s + x.pct, 0) / mean.length);
    }
    if (ah) { state.sample.nH = String(ah.n); out.filled.push('nH'); }
    if (aa) { state.sample.nA = String(aa.n); out.filled.push('nA'); }
    out.info.venue = { home: H.venue, away: A.venue };

    // forma, precedenti, riposo, impegni, classifica
    const c = state.ctx;
    c.home.last5 = (th.matches || []).slice(0, 5).map(fmtScore).join(', ');
    c.away.last5 = (ta.matches || []).slice(0, 5).map(fmtScore).join(', ');
    out.filled.push('c_home_last5', 'c_away_last5');
    if (fx && fx.h2h && fx.h2h.length) {
      const rows = fx.swapped ? fx.h2h.map(r => [r[0], r[1], r[3], r[2], r[5], r[4]]) : fx.h2h;
      c.match.h2h = rows.map(r => `${r[2]}-${r[3]}${r[4] != null ? ` (${r[4]}-${r[5]})` : ''}`).join(', ');
      out.filled.push('m_h2h');
    }
    const kick = fx ? Date.parse(fx.utc) : Date.now();
    [['home', th], ['away', ta]].forEach(([side, t]) => {
      const last = (t.matches || [])[0];
      if (last) {
        const days = Math.round((kick - Date.parse(last[0] + 'T12:00:00Z')) / 864e5);
        if (days >= 0 && days < 30) { c[side].rest = String(days); out.filled.push(`c_${side}_rest`); }
      }
      const after = (t.next || []).find(n => Date.parse(n[0]) > kick + 3600e3);
      if (after) {
        const gap = (Date.parse(after[0]) - kick) / 864e5;
        out.info[side + 'Next'] = { comp: after[1], opp: after[3], when: after[0], days: Math.round(gap) };
        const thisComp = fx ? fx.comp : '';
        if (gap <= 4 && after[1] === 'CL' && thisComp !== 'CL') { c[side].turnover = 'cup'; out.filled.push(`c_${side}_turnover`); }
      }
      if (t.pos && t.pos.position) { c[side].pos = String(t.pos.position); out.filled.push(`c_${side}_pos`); }
      if (t.absences) out.info[side + 'Abs'] = t.absences;
      if (t.news) out.info[side + 'News'] = t.news;
    });
    if (fx) {
      ev.comp = fx.compName || ev.comp;
      ev.when = localWhen(fx.utc);
      out.filled.push('ev_comp', 'ev_when');
      if (fx.comp === 'CL' || /coppa|cup|champions|europa/i.test(fx.compName || '')) out.info.cup = true;
    }
    out.info.updated = d.updated;
    return out;
  }

  async function load(force) {
    if (DATA && !force) return DATA;
    if (loading) return loading;
    loading = (async () => {
      try {
        const a = await fetch('data/aliases.json');
        if (a.ok) ALIASES = Object.fromEntries(Object.entries((await a.json()).aliases || {}).map(([k, v]) => [norm(k), v]));
      } catch (e) { /* senza alias valgono i nomi */ }
      if (typeof location !== 'undefined' && location.protocol === 'file:') return null;
      try {
        const r = await fetch(`${DATA_URL}?t=${force ? Date.now() : Math.floor(Date.now() / 300000)}`);
        if (r.ok) DATA = await r.json();
      } catch (e) { /* dati non raggiungibili: si compila a mano */ }
      return DATA;
    })();
    const res = await loading;
    loading = null;
    return res;
  }

  const api = {
    load, fill, findFixture, findTeam, nameScore, averages, eventPct, norm,
    setData(d, aliases) { DATA = d; if (aliases) ALIASES = Object.fromEntries(Object.entries(aliases).map(([k, v]) => [norm(k), v])); },
    get data() { return DATA; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BLMatch = api;
})(typeof window !== 'undefined' ? window : globalThis);
