/* Bottino Lab — riconoscimento della domanda.
   Riceve il testo incollato dal quiz (competizione, squadre, domanda) e restituisce
   evento, tipo di domanda e parametri. Regole scritte per l'italiano. */
(function (root) {
  'use strict';

  const NUMW = {
    zero: 0, nessun: 0, nessuno: 0, nessuna: 0, un: 1, uno: 1, una: 1, due: 2, tre: 3, quattro: 4,
    cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10, undici: 11, dodici: 12,
    tredici: 13, quattordici: 14, quindici: 15
  };
  const STOP_TEAM = new Set(['club', 'calcio', 'football', 'united', 'city', 'real', 'athletic', 'sporting', 'olympique',
    'paris', 'saint', 'stade', 'racing', 'sport', 'associazione', 'societa', 'unione', 'atletico', 'deportivo']);
  const STOP_NAME = new Set(['almeno', 'ci', 'il', 'lo', 'la', 'i', 'gli', 'le', 'un', 'una', 'nel', 'nella', 'durante',
    'segnera', 'segneranno', 'sara', 'saranno', 'entrambe', 'quanti', 'chi', 'vincera', 'si', 'pi', 'piu', 'meno',
    'oltre', 'tempo', 'primo', 'secondo', 'goal', 'gol', 'rete', 'andra', 'riuscira', 'otterra', 'sì', 'no']);

  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[’`]/g, "'").replace(/\s+/g, ' ').trim();

  function toNum(tok) {
    if (tok == null) return null;
    const t = String(tok).replace(/[?.!;:]+$/, '').replace(',', '.');
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
    return Object.prototype.hasOwnProperty.call(NUMW, t) ? NUMW[t] : null;
  }

  // Sigle e parole distintive di una squadra, per trovarla nel testo della domanda.
  function teamKeys(name) {
    const n = norm(name);
    if (!n) return [];
    const words = n.split(/[\s\-.]+/).filter(Boolean);
    const keys = new Set([n]);
    if (words.length > 1) keys.add(words.map(w => w[0]).join(''));
    words.filter(w => w.length >= 4 && !STOP_TEAM.has(w)).forEach(w => keys.add(w));
    return [...keys];
  }
  function mentions(q, name) {
    return teamKeys(name).some(k => new RegExp(`(^|[^a-z])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`).test(q));
  }

  function detectPeriod(q) {
    if (/\b1\s*(°|o|\^)?\s*tempo|primo tempo|prima frazione|\b1t\b|primi 45|intervallo/.test(q)) return '1T';
    if (/\b2\s*(°|o|\^)?\s*tempo|secondo tempo|seconda frazione|ripresa|\b2t\b|secondi 45/.test(q)) return '2T';
    return 'FT';
  }
  function stripPeriod(q) {
    return q.replace(/\b[12]\s*(°|o|\^)?\s*tempo|prim[oa] tempo|second[oa] tempo|prima frazione|seconda frazione|ripresa|\b[12]t\b|primi 45|secondi 45/g, ' ');
  }

  // Soglia e lato: "almeno 2" = Over 1,5; "meno di 3" = Under 2,5; "nessun gol" = Under 0,5.
  function detectThreshold(q) {
    const rules = [
      [/\b(?:non piu di|al massimo|massimo)\s+(\S+)/, n => ({ line: n + 0.5, side: 'neg' })],
      [/\bnon meno di\s+(\S+)/, n => ({ line: n - 0.5, side: 'pos' })],
      [/\b(?:almeno|minimo)\s+(\S+)/, n => ({ line: n - 0.5, side: 'pos' })],
      [/\b(?:piu di|oltre|sopra|over)\s+(?:i |le |gli |a )?(\S+)/, n => ({ line: n % 1 ? n : n + 0.5, side: 'pos' })],
      [/\b(?:meno di|sotto|under)\s+(?:i |le |gli )?(\S+)/, n => ({ line: n % 1 ? n : n - 0.5, side: 'neg' })]
    ];
    for (const [re, f] of rules) {
      const m = q.match(re);
      if (m) {
        const n = toNum(m[1]);
        if (n != null) return f(n);
      }
    }
    if (/\b(?:nessun[oa]?|zero|senza)\s+(?:gol|goal|rete|reti|corner|calci|cartellin)/.test(q)) return { line: 0.5, side: 'neg' };
    return null;
  }

  function guessPlayer(original) {
    const words = original.replace(/[?!.,]/g, ' ').split(/\s+/).filter(Boolean);
    const out = [];
    for (const w of words) {
      const isCap = /^[A-ZÀ-Ý]/.test(w) && !STOP_NAME.has(norm(w));
      if (isCap) out.push(w); else if (out.length) break;
    }
    return out.join(' ');
  }

  function parseHeader(lines) {
    const ev = { comp: '', home: '', away: '' };
    const sepIdx = lines.findIndex(l => /^(v\/?s\.?|vs\.?|-|–|contro)$/i.test(l));
    if (sepIdx > 0 && sepIdx < lines.length - 1) {
      ev.home = lines[sepIdx - 1]; ev.away = lines[sepIdx + 1];
      if (sepIdx >= 2) ev.comp = lines[sepIdx - 2];
    } else {
      const i = lines.findIndex(l => !/\?\s*$/.test(l) && /\s(v\/?s\.?|vs\.?|-|–|contro)\s/i.test(l));
      if (i >= 0) {
        const m = lines[i].split(/\s(?:v\/?s\.?|vs\.?|-|–|contro)\s/i);
        ev.home = (m[0] || '').trim(); ev.away = (m[1] || '').trim();
        if (i >= 1) ev.comp = lines[i - 1];
      }
    }
    ev.comp = ev.comp.replace(/^[A-Z]{3}\s+/, '').trim();
    if (/\?\s*$/.test(ev.comp)) ev.comp = '';
    return ev;
  }

  function detectSport(comp, q) {
    const c = norm(comp);
    if (/\bnba\b|eurolega|euroleague|basket|lba\b|euroCup/i.test(c) || /\bpunti\b|rimbalz|triple|canestr/.test(q)) return 'Basket';
    if (/\batp\b|\bwta\b|open|wimbledon|roland|slam|davis/.test(c) || /\bset\b|tie.?break|\bace\b|\bgame\b/.test(q)) return 'Tennis';
    if (/formula|\bf1\b|motogp|gran premio|\bgp\b/.test(c) || /\bpole\b|podio|gran premio|giro veloce|safety car/.test(q)) return 'Motori';
    return 'Calcio';
  }

  function parse(text) {
    const raw = String(text || '').replace(/\r/g, '');
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    const qLine = [...lines].reverse().find(l => /\?\s*$/.test(l)) || lines[lines.length - 1] || '';
    const ev = parseHeader(lines.filter(l => l !== qLine));
    const q = norm(qLine);
    const qs = stripPeriod(q);
    const period = detectPeriod(q);
    const sport = detectSport(ev.comp, q);
    const thr = detectThreshold(qs);
    const homeM = ev.home && mentions(q, ev.home), awayM = ev.away && mentions(q, ev.away);
    const team = homeM && !awayM ? 'home' : awayM && !homeM ? 'away' : null;
    const other = t => (t === 'home' ? 'away' : 'home');
    const negated = /\bnon\b/.test(qs);
    const notes = [];

    let type = 'generic', params = {};

    if (/\bpunti\b/.test(qs)) {
      type = 'points_total';
      params = { line: String(thr ? thr.line : 0), side: thr ? thr.side : 'pos' };
      if (!thr) notes.push('Soglia dei punti non trovata: inseriscila a mano.');
    } else if (/corner|calci d'angolo|calci dangolo|\bangoli\b/.test(qs)) {
      type = 'corners';
      params = { period: period === '2T' ? 'FT' : period, line: String(thr ? thr.line : 9.5), side: thr ? thr.side : 'pos' };
    } else if (/cartellin[oi] ross|espuls/.test(qs)) {
      type = 'generic';
      params = { marketName: 'Cartellino rosso sì/no', siText: 'Almeno un\'espulsione', noText: 'Nessuna espulsione' };
    } else if (/cartellin|ammonizion|ammonit/.test(qs)) {
      type = 'cards';
      params = { line: String(thr ? thr.line : 4.5), side: thr ? thr.side : 'pos' };
    } else if (sport === 'Tennis' || sport === 'Motori') {
      type = 'generic';
      params = { marketName: '', siText: '', noText: '' };
    } else if (/entrambe|ambedue|tutte e due|goal\/no ?goal|\bgg\b|both/.test(qs)) {
      type = 'btts';
      params = { period, side: negated ? 'neg' : 'pos' };
    } else if (/pareggi|pareggio|\bpari\b|parita/.test(qs)) {
      type = 'match_result';
      params = { outcome: 'draw', period: period === '1T' ? '1T' : 'FT', side: negated ? 'neg' : 'pos' };
    } else if (team && /non perd|imbattut/.test(qs)) {
      type = 'match_result';
      params = { outcome: other(team), period: period === '1T' ? '1T' : 'FT', side: 'neg' };
    } else if (team && /vinc|vittoria|batt|si imporr|prevarr|conquist/.test(qs)) {
      type = 'match_result';
      params = { outcome: team, period: period === '1T' ? '1T' : 'FT', side: negated ? 'neg' : 'pos' };
    } else if (team && /porta inviolata|clean sheet|non subi|senza subire|non incass/.test(qs)) {
      type = 'team_goals';
      params = { team: other(team), period, line: '0.5', side: 'neg' };
    } else if (team && /subi|incass/.test(qs)) {
      type = 'team_goals';
      params = { team: other(team), period, line: String(thr ? thr.line : 0.5), side: thr ? thr.side : 'pos' };
    } else if (team && /segn|gol|goal|\breti?\b|a segno/.test(qs)) {
      type = 'team_goals';
      const side = thr ? thr.side : (negated ? 'neg' : 'pos');
      params = { team, period, line: String(thr ? thr.line : 0.5), side };
    } else if (/gol|goal|\breti?\b|marcatur/.test(qs) && !/segnera\b|andra a segno|marcatore/.test(qs.replace(/segneranno/, ''))) {
      type = 'goals_total';
      params = { period, line: String(thr ? thr.line : 0.5), side: thr ? thr.side : (negated ? 'neg' : 'pos') };
    } else if (/segn|a segno|marcator/.test(qs)) {
      const player = guessPlayer(qLine);
      if (player) {
        type = 'player_scores';
        params = { player, team: 'home', line: String(thr ? thr.line : 0.5), side: negated ? 'neg' : 'pos' };
        notes.push('Verifica in quale squadra gioca il marcatore.');
      } else {
        type = 'goals_total';
        params = { period, line: String(thr ? thr.line : 0.5), side: thr ? thr.side : 'pos' };
      }
    } else {
      params = { marketName: '', siText: '', noText: '' };
    }

    if (type === 'generic') notes.push('Tipo non riconosciuto con certezza: compila mercato e significato del Sì e del No.');
    if (type === 'match_result' && params.outcome !== 'draw' && !team) notes.push('Squadra non trovata nella domanda: controlla l\'esito.');

    return {
      event: { sport, comp: ev.comp, home: ev.home, away: ev.away },
      question: qLine, type, params, notes
    };
  }

  const api = { parse, norm, toNum, teamKeys, detectThreshold, detectPeriod };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BLParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
