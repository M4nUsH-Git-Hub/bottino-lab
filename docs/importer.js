/* Bottino Lab — lettura del testo di una pagina aperta dall'utente (inviato dall'estensione).
   Trova: il blocco della domanda del quiz (competizione, squadre, v/s, domanda) e i mercati con le quote
   come compaiono su Sisal ("U/O 1.5 1° Tempo" / UNDER 1.80 / OVER 1.85). Propone il mercato giusto per la domanda.
   Funziona nel browser (window.BLImport) e in Node per i test. */
(function (root) {
  'use strict';
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const lines = text => String(text || '').replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);

  // ---------- domanda del quiz ----------
  function quizBlocks(text) {
    const L = lines(text), out = [];
    L.forEach((l, i) => {
      if (!/^v\/?s\.?$|^vs\.?$/i.test(l) || i < 1 || i + 1 >= L.length) return;
      const q = L.slice(i + 2, i + 8).find(x => /\?\s*$/.test(x));
      if (!q) return;
      const comp = i >= 2 && L[i - 2].length < 60 && !/\?\s*$/.test(L[i - 2]) ? L[i - 2] : '';
      out.push({ comp, home: L[i - 1], away: L[i + 1], question: q, text: [comp, L[i - 1], 'v/s', L[i + 1], q].filter(Boolean).join('\n') });
    });
    return out;
  }

  // ---------- mercati e quote ----------
  const ODD = /^\d{1,3}[.,]\d{1,2}$/;
  const LABELS = new Map([
    ['under', 'U'], ['over', 'O'], ['u', 'U'], ['o', 'O'],
    ['si', 'SI'], ['no', 'NO'],
    ['goal', 'GG'], ['gg', 'GG'], ['nogoal', 'NG'], ['no goal', 'NG'], ['ng', 'NG'],
    ['1', '1'], ['x', 'X'], ['2', '2'], ['1x', '1X'], ['x2', 'X2'], ['12', '12'],
    ['pari', 'PARI'], ['dispari', 'DISPARI']
  ]);
  // "UNDER" oppure "Over 2.5" (etichetta e soglia sulla stessa riga, come su altri bookmaker)
  function labelOf(l) {
    const n = norm(l);
    if (LABELS.has(n)) return LABELS.get(n);
    const m = n.match(/^(over|under|piu di|meno di)\s*(\d+[.,]5)$/);
    return m ? ((m[1] === 'over' || m[1] === 'piu di') ? 'O' : 'U') : undefined;
  }
  const lineOfLabel = l => { const m = norm(l).match(/(\d+[.,]5)$/); return m ? m[1].replace(',', '.') : ''; };
  const isTitle = l => !labelOf(l) && !ODD.test(l) && l.length >= 2 && l.length <= 90;

  function markets(text) {
    const L = lines(text), out = [], seen = new Set();
    let i = 0;
    while (i < L.length - 1) {
      if (labelOf(L[i]) && ODD.test(L[i + 1])) {
        const start = i, outcomes = [], ln = lineOfLabel(L[i]);
        while (i < L.length - 1 && labelOf(L[i]) && ODD.test(L[i + 1]) && lineOfLabel(L[i]) === ln) {
          outcomes.push({ label: labelOf(L[i]), text: L[i], odd: Number(L[i + 1].replace(',', '.')) });
          i += 2;
        }
        let title = '';
        for (let k = start - 1; k >= Math.max(0, start - 12); k--) { if (isTitle(L[k])) { title = L[k]; break; } }
        if (ln && !lineIn(title, ln)) title = `${title} ${ln}`.trim();
        const key = title + '|' + outcomes.map(o => o.label + o.odd).join(',');
        if (outcomes.length >= 2 && !seen.has(key)) { seen.add(key); out.push({ title, outcomes }); }
      } else i++;
    }
    return out;
  }

  // ---------- scelta del mercato per la domanda ----------
  const KIND = {
    goals_total: 'ou', team_goals: 'ou', corners: 'ou', cards: 'ou', points_total: 'ou',
    btts: 'gg', match_result: '1x2', player_scores: 'sn', generic: 'sn'
  };
  function kindOf(m) {
    const ls = new Set(m.outcomes.map(o => o.label));
    if (ls.has('U') && ls.has('O')) return 'ou';
    if (ls.has('GG') && ls.has('NG')) return 'gg';
    if (ls.has('1') && ls.has('X') && ls.has('2')) return '1x2';
    if (ls.has('SI') && ls.has('NO')) return 'sn';
    return '';
  }
  function lineIn(title, line) {
    const t = norm(title).replace(',', '.');
    return line != null && new RegExp(`(^|[^0-9.])${String(Number(line)).replace('.', '\\.')}([^0-9]|$)`).test(t);
  }
  const PERIOD = { '1T': /1\s*°?\s*t(empo)?\b|primo tempo|1t\b|1st half/, '2T': /2\s*°?\s*t(empo)?\b|secondo tempo|2t\b|2nd half/ };

  // Più alto il punteggio, più il mercato corrisponde alla domanda. Sotto 0 vuol dire "probabilmente no".
  function score(m, q) {
    const want = KIND[q.type] || 'sn', kind = kindOf(m);
    if (!kind) return -99;
    let s = kind === want ? 4 : (want === 'sn' && kind === 'gg' ? 1 : -10);
    const t = norm(m.title), p = (q.params || {});
    if (want === 'ou') s += lineIn(m.title, p.line) ? 3 : -2;
    const per = p.period || 'FT';
    const has1 = PERIOD['1T'].test(t), has2 = PERIOD['2T'].test(t);
    if (per === '1T') s += has1 ? 2 : -3;
    else if (per === '2T') s += has2 ? 2 : -3;
    else if (has1 || has2) s -= 3;
    const teamName = p.team === 'away' ? q.away : q.home;
    const mentions = n => n && norm(n).split(' ').some(w => w.length >= 3 && t.includes(w));
    if (q.type === 'team_goals') s += mentions(teamName) ? 2 : -2;
    else if (['goals_total', 'btts'].includes(q.type) && (mentions(q.home) || mentions(q.away))) s -= 2;
    if (/corner|angol/.test(t) !== (q.type === 'corners')) s -= 3;
    if (/cartellin|ammoniz/.test(t) !== (q.type === 'cards')) s -= 3;
    return s;
  }
  function rank(ms, q) {
    return ms.map(m => Object.assign({ score: score(m, q) }, m)).sort((a, b) => b.score - a.score);
  }

  // Quote nell'ordine delle colonne di Bottino Lab: a = Sì, b = No (o 1, X, 2 per l'esito finale).
  function toOdds(m, q) {
    const by = l => (m.outcomes.find(o => o.label === l) || {}).odd;
    const f = x => (x == null ? '' : String(x.toFixed(2)).replace('.', ','));
    const neg = (q.params || {}).side === 'neg';
    switch (kindOf(m)) {
      case 'ou': return { a: f(by(neg ? 'U' : 'O')), b: f(by(neg ? 'O' : 'U')), c: '' };
      case 'gg': return { a: f(by(neg ? 'NG' : 'GG')), b: f(by(neg ? 'GG' : 'NG')), c: '' };
      case '1x2': return { a: f(by('1')), b: f(by('X')), c: f(by('2')) };
      case 'sn': return { a: f(by(neg ? 'NO' : 'SI')), b: f(by(neg ? 'SI' : 'NO')), c: '' };
      default: return null;
    }
  }

  const api = { quizBlocks, markets, rank, score, toOdds, kindOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BLImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
