/* Bottino Lab — contesto della partita.
   Trasforma i dati inseriti (risultati recenti, precedenti, assenze, riposo, turnover,
   motivazione, tipo di partita, meteo) in numeri che correggono il modello:
   - forma: medie gol delle ultime partite, mescolate alle medie stagionali;
   - frequenze: quante volte l'esito della domanda si è verificato nelle ultime partite e nei precedenti;
   - moltiplicatori: quanto ogni fattore alza o abbassa gli eventi attesi.
   Funziona nel browser (window.BLContext) e in Node per i test. */
(function (root) {
  'use strict';
  const E = root.BLEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const { num, mean, clamp } = E;

  // ---------- opzioni dei menu (valore, testo, effetto) ----------
  const OPT = {
    attAbs: [
      { v: '0', l: 'Nessuna importante', f: 1 },
      { v: '1', l: 'Manca un titolare', f: 0.93 },
      { v: '2', l: 'Mancano due o più titolari', f: 0.86 },
      { v: 'star', l: 'Manca il miglior marcatore', f: 0.88 }
    ],
    defAbs: [
      { v: '0', l: 'Nessuna importante', f: 1 },
      { v: '1', l: 'Manca un titolare', f: 1.05 },
      { v: '2', l: 'Mancano due o più titolari', f: 1.10 },
      { v: 'gk', l: 'Manca il portiere titolare', f: 1.08 }
    ],
    turnover: [
      { v: 'no', l: 'No' },
      { v: 'cup', l: 'Sì, partita di coppa' },
      { v: 'big', l: 'Sì, big match in campionato' }
    ],
    motiv: [
      { v: 'normal', l: 'Normale', f: 1 },
      { v: 'high', l: 'Deve vincere', f: 1.05 },
      { v: 'low', l: 'Poco da giocarsi', f: 0.94 }
    ],
    kind: [
      { v: 'normal', l: 'Normale', goals: 1, cards: 1, corners: 1 },
      { v: 'derby', l: 'Derby o rivalità', goals: 0.97, cards: 1.15, corners: 1 },
      { v: 'big', l: 'Scontro diretto o big match', goals: 0.93, cards: 1.08, corners: 0.97 },
      { v: 'decisive', l: 'Decisiva (finale, salvezza, titolo)', goals: 0.92, cards: 1.12, corners: 0.97 },
      { v: 'friendly', l: 'Poco in palio (amichevole, già decisa)', goals: 1.06, cards: 0.85, corners: 1 }
    ],
    weather: [
      { v: 'normal', l: 'Normale', f: 1 },
      { v: 'rain', l: 'Pioggia forte', f: 0.95 },
      { v: 'wind', l: 'Vento forte', f: 0.95 },
      { v: 'heat', l: 'Caldo intenso', f: 0.96 },
      { v: 'snow', l: 'Neve o campo pesante', f: 0.90 }
    ]
  };
  const optOf = (key, v) => OPT[key].find(o => o.v === String(v)) || OPT[key][0];

  const TEAM_DEFAULT = { last5: '', attAbs: '0', defAbs: '0', rest: '', turnover: 'no', motiv: 'normal', pos: '', notes: '' };
  const MATCH_DEFAULT = { h2h: '', kind: 'normal', weather: 'normal' };
  function blankCtx() {
    return { home: Object.assign({}, TEAM_DEFAULT), away: Object.assign({}, TEAM_DEFAULT), match: Object.assign({}, MATCH_DEFAULT) };
  }
  function normalizeCtx(c) {
    const b = blankCtx();
    if (!c || typeof c !== 'object' || !c.home) return b;
    return {
      home: Object.assign(b.home, c.home),
      away: Object.assign(b.away, c.away || {}),
      match: Object.assign(b.match, c.match || {})
    };
  }

  // ---------- risultati ----------
  // Accetta "2-1, 0-0 1-3" e il primo tempo tra parentesi: "2-1 (1-0)". Separatori: virgola, punto e virgola, spazi, a capo.
  function parseScores(text) {
    const out = [];
    const re = /(\d{1,2})\s*[-–:]\s*(\d{1,2})(?:\s*\(\s*(\d{1,2})\s*[-–:]\s*(\d{1,2})\s*\))?/g;
    let m;
    while ((m = re.exec(String(text || '')))) {
      const g = { f: +m[1], a: +m[2] };
      if (m[3] != null && +m[3] <= g.f && +m[4] <= g.a) { g.hf = +m[3]; g.ha = +m[4]; }
      out.push(g);
    }
    return out;
  }

  function summary(games) {
    const n = games.length;
    if (!n) return null;
    let w = 0, d = 0, l = 0, gf = 0, ga = 0, o15 = 0, o25 = 0, btts = 0, cs = 0, fts = 0, ht = 0, hgf = 0, hga = 0;
    games.forEach(g => {
      if (g.f > g.a) w++; else if (g.f === g.a) d++; else l++;
      gf += g.f; ga += g.a;
      if (g.f + g.a > 1.5) o15++;
      if (g.f + g.a > 2.5) o25++;
      if (g.f > 0 && g.a > 0) btts++;
      if (g.a === 0) cs++;
      if (g.f === 0) fts++;
      if (g.hf != null) { ht++; hgf += g.hf; hga += g.ha; }
    });
    return {
      n, w, d, l, pts: w * 3 + d, gf: gf / n, ga: ga / n, o15, o25, btts, cs, fts,
      ht, hgf: ht ? hgf / ht : null, hga: ht ? hga / ht : null
    };
  }

  // Gol medi nel periodo: usa il primo tempo se indicato in almeno 3 partite, altrimenti una quota tipica della partita.
  const SHARE = { '1T': 0.45, '2T': 0.55, 'FT': 1 };
  function periodRates(sum, period) {
    if (!sum) return null;
    if (period === 'FT' || !period) return { gf: sum.gf, ga: sum.ga, how: 'partita intera' };
    if (sum.ht >= 3) {
      if (period === '1T') return { gf: sum.hgf, ga: sum.hga, how: 'primi tempi indicati' };
      return { gf: sum.gf - sum.hgf, ga: sum.ga - sum.hga, how: 'secondi tempi indicati' };
    }
    return { gf: sum.gf * SHARE[period], ga: sum.ga * SHARE[period], how: `stima: ${Math.round(SHARE[period] * 100)}% dei gol della partita` };
  }

  // ---------- esito della domanda su un risultato ----------
  // sc = { h, a, hh, ha } dal punto di vista della partita (casa, ospite). Restituisce true/false, o null se non valutabile.
  function goalsIn(sc, period) {
    if (!period || period === 'FT') return { h: sc.h, a: sc.a };
    if (sc.hh == null) return null;
    if (period === '1T') return { h: sc.hh, a: sc.ha };
    return { h: sc.h - sc.hh, a: sc.a - sc.ha };
  }
  function evalEvent(type, params, sc) {
    const p = params || {};
    const g = goalsIn(sc, p.period || 'FT');
    if (!g) return null;
    const line = num(p.line);
    switch (type) {
      case 'goals_total': return line == null ? null : g.h + g.a > line;
      case 'btts': return g.h > 0 && g.a > 0;
      case 'team_goals': return line == null ? null : (p.team === 'away' ? g.a : g.h) > line;
      case 'match_result':
        if (p.outcome === 'draw') return g.h === g.a;
        return p.outcome === 'away' ? g.a > g.h : g.h > g.a;
      default: return null;
    }
  }
  const GOAL_TYPES = new Set(['goals_total', 'btts', 'team_goals', 'match_result']);
  const supportsScores = type => GOAL_TYPES.has(type);

  // Partite recenti di una squadra (gol fatti-subiti): la squadra prende il suo posto (casa o ospite) nella partita di oggi.
  const asMatch = (g, side) => side === 'home'
    ? { h: g.f, a: g.a, hh: g.hf, ha: g.ha }
    : { h: g.a, a: g.f, hh: g.ha, ha: g.hf };
  const asH2H = g => ({ h: g.f, a: g.a, hh: g.hf, ha: g.ha });

  function countEvent(type, params, list) {
    let k = 0, n = 0;
    list.forEach(sc => { const r = evalEvent(type, params, sc); if (r != null) { n++; if (r) k++; } });
    return { k, n };
  }

  // Stime aggiuntive dalla forma e dai precedenti, con un peso basso perché i campioni sono piccoli.
  function freqParts(s) {
    const out = [];
    if (!supportsScores(s.type)) return out;
    const c = normalizeCtx(s.ctx), nm = names(s);
    [['home', nm.home], ['away', nm.away]].forEach(([side, name]) => {
      const games = parseScores(c[side].last5);
      const r = countEvent(s.type, s.params, games.map(g => asMatch(g, side)));
      if (r.n >= 3) out.push({ label: `Ultime partite ${name}`, p: r.k / r.n, w: 0.075, line: `Nelle ultime ${r.n} partite di ${name}, l'esito equivalente si è verificato ${r.k} ${r.k === 1 ? 'volta' : 'volte'} su ${r.n}.` });
    });
    const h = parseScores(c.match.h2h);
    const r = countEvent(s.type, s.params, h.map(asH2H));
    if (r.n >= 3) out.push({ label: 'Precedenti diretti', p: r.k / r.n, w: 0.10, line: `Nei ${r.n} precedenti diretti indicati, l'esito si è verificato ${r.k} ${r.k === 1 ? 'volta' : 'volte'} su ${r.n}.` });
    return out;
  }

  const names = s => ({
    home: (s.event && s.event.home) || 'la squadra di casa',
    away: (s.event && s.event.away) || 'la squadra ospite'
  });
  const pctTxt = f => `${f > 1 ? '+' : '−'}${Math.round(Math.abs(f - 1) * 100)}%`;

  // ---------- moltiplicatori ----------
  // kind: 'goals' (gol e marcatore), 'corners', 'cards', 'points'. Restituisce { home, away, total, effects[] }.
  function multipliers(s, kind, neutral) {
    const res = { home: 1, away: 1, total: 1, effects: [] };
    if (neutral) return res;
    const c = normalizeCtx(s.ctx), nm = names(s);
    const add = (side, f, text) => {
      if (!f || f === 1) return;
      if (side === 'both') { res.home *= f; res.away *= f; } else if (side === 'total') res.total *= f; else res[side] *= f;
      res.effects.push({ side, f, text });
    };
    const other = side => (side === 'home' ? 'away' : 'home');

    if (kind === 'goals' || kind === 'points') {
      ['home', 'away'].forEach(side => {
        const T = c[side], O = c[other(side)], who = nm[side];
        add(side, optOf('attAbs', T.attAbs).f, `${who}: ${optOf('attAbs', T.attAbs).l.toLowerCase()} in attacco`);
        add(side, optOf('defAbs', O.defAbs).f, `${who}: difesa avversaria con assenze (${optOf('defAbs', O.defAbs).l.toLowerCase()})`);
        const rest = num(T.rest), restO = num(O.rest);
        if (rest != null && rest <= 2) add(side, 0.94, `${who}: solo ${rest} giorni di riposo`);
        else if (rest != null && rest <= 3) add(side, 0.97, `${who}: ${rest} giorni di riposo`);
        if (restO != null && restO <= 3) add(side, 1.03, `${who}: avversario con poco riposo`);
        if (T.turnover !== 'no') add(side, 0.95, `${who}: probabile turnover (${optOf('turnover', T.turnover).l.replace('Sì, ', '')} in arrivo)`);
        if (O.turnover !== 'no') add(side, 1.03, `${who}: avversario con probabile turnover`);
        add(side, optOf('motiv', T.motiv).f, `${who}: motivazione ${optOf('motiv', T.motiv).l.toLowerCase()}`);
      });
      if (kind === 'goals') {
        const k = optOf('kind', c.match.kind), w = optOf('weather', c.match.weather);
        add('both', k.goals, `Tipo di partita: ${k.l.toLowerCase()}`);
        add('both', w.f, `Meteo: ${w.l.toLowerCase()}`);
      }
    } else if (kind === 'corners') {
      ['home', 'away'].forEach(side => {
        if (c[side].motiv === 'high') add(side, 1.05, `${nm[side]}: deve vincere, attacca di più`);
      });
      add('both', optOf('kind', c.match.kind).corners, `Tipo di partita: ${optOf('kind', c.match.kind).l.toLowerCase()}`);
    } else if (kind === 'cards') {
      add('total', optOf('kind', c.match.kind).cards, `Tipo di partita: ${optOf('kind', c.match.kind).l.toLowerCase()}`);
      ['home', 'away'].forEach(side => {
        if (c[side].motiv === 'high') add('total', 1.04, `${nm[side]}: deve vincere, partita più tesa`);
      });
    }
    res.home = clamp(res.home, 0.7, 1.3);
    res.away = clamp(res.away, 0.7, 1.3);
    res.total = clamp(res.total, 0.7, 1.4);
    res.effects.forEach(e => { e.pct = pctTxt(e.f); });
    return res;
  }

  // ---------- gol attesi con forma e contesto ----------
  function goalLambdas(s, lh0, la0, neutral) {
    const c = normalizeCtx(s.ctx), nm = names(s), period = (s.params && s.params.period) || 'FT';
    const lines = [];
    const fh = periodRates(summary(parseScores(c.home.last5)), period);
    const fa = periodRates(summary(parseScores(c.away.last5)), period);
    const nH = parseScores(c.home.last5).length, nA = parseScores(c.away.last5).length;
    const okH = fh && nH >= 3, okA = fa && nA >= 3;
    const flh = mean([okH ? fh.gf : null, okA ? fa.ga : null]);
    const fla = mean([okA ? fa.gf : null, okH ? fh.ga : null]);
    let lh = lh0, la = la0;
    const hows = [...new Set([okH ? fh.how : null, okA ? fa.how : null].filter(Boolean))];
    const howTxt = hows.length === 1 ? hows[0] : `${nm.home}: ${fh ? fh.how : '—'}; ${nm.away}: ${fa ? fa.how : '—'}`;
    if (flh != null && fla != null) {
      if (lh0 != null && la0 != null) {
        lh = 0.7 * lh0 + 0.3 * flh; la = 0.7 * la0 + 0.3 * fla;
        lines.push(`Forma recente: nelle ultime partite i gol attesi sarebbero ${fmt(flh)} per ${nm.home} e ${fmt(fla)} per ${nm.away} (${howTxt}). Pesano per il 30% accanto alle medie stagionali.`);
      } else {
        lh = flh; la = fla;
        lines.push(`Mancano le medie stagionali: i gol attesi vengono dalle ultime partite (${howTxt}).`);
      }
    }
    if (lh == null || la == null) return { lh: null, la: null, lines, effects: [] };
    const M = multipliers(s, 'goals', neutral);
    if (M.effects.length) {
      lines.push(`Il contesto corregge i gol attesi: ${nm.home} ×${fmt(M.home)}, ${nm.away} ×${fmt(M.away)}.`);
    }
    return { lh: lh * M.home, la: la * M.away, lines, effects: M.effects };
  }
  const fmt = x => Number(x).toFixed(2).replace('.', ',');

  const api = {
    OPT, optOf, blankCtx, normalizeCtx, parseScores, summary, periodRates, evalEvent, supportsScores,
    countEvent, freqParts, multipliers, goalLambdas, asMatch, asH2H
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BLContext = api;
})(typeof window !== 'undefined' ? window : globalThis);
