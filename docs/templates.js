/* Bottino Lab — tipi di domanda.
   Ogni tipo descrive: parametri della domanda, campi statistici, modello di calcolo,
   significato di Sì/No, scenari, controlli finali, fonti e dati da chiedere a Claude. */
(function (root) {
  'use strict';
  const E = root.BLEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const { num, mean } = E;
  const C = root.BLContext || (typeof require !== 'undefined' ? require('./context.js') : null);
  // Stato di un calcolo in corso: righe e effetti del contesto, modalità "senza contesto" per misurarne l'effetto.
  const CTX = { neutral: false, lines: [], effects: [] };

  // ---------- formattazione ----------
  const pct = x => (x == null || !Number.isFinite(x)) ? '—' : (x * 100).toFixed(1).replace('.', ',') + '%';
  const dec = (x, d = 2) => (x == null || !Number.isFinite(x)) ? '—' : Number(x).toFixed(d).replace('.', ',');
  const lf = x => String(x).replace('.', ',');

  const PERIODS = [
    { v: '1T', l: '1° tempo' },
    { v: '2T', l: '2° tempo' },
    { v: 'FT', l: 'Partita intera' }
  ];
  const SIDE_OU = { k: 'side', label: 'Il Sì corrisponde a', type: 'select', options: [
    { v: 'pos', l: 'Over (almeno, più di)' }, { v: 'neg', l: 'Under (meno di, al massimo, nessuno)' }] };
  const perLong = v => ({ '1T': 'primo tempo', '2T': 'secondo tempo', 'FT': 'partita' }[v] || 'partita');
  const perIn = v => ({ '1T': 'nel primo tempo', '2T': 'nel secondo tempo', 'FT': 'nella partita' }[v] || 'nella partita');
  const perEnd = v => ({ '1T': 'entro la fine del primo tempo', '2T': 'nel secondo tempo', 'FT': 'entro la fine della partita' }[v] || 'entro la fine della partita');
  const perShort = v => ({ '1T': ' 1° tempo', '2T': ' 2° tempo', 'FT': '' }[v] || '');
  const names = s => ({
    home: (s.event && s.event.home) || 'la squadra di casa',
    away: (s.event && s.event.away) || 'la squadra ospite'
  });
  const st = (s, k) => num(s.stats ? s.stats[k] : null);
  const freq = (s, keys) => mean(keys.map(k => st(s, k)).filter(v => v != null).map(v => v / 100));

  function scoreExamples(total, max = 3) {
    const out = [];
    for (let h = total; h >= 0 && out.length < max; h--) out.push(h + '-' + (total - h));
    return out;
  }
  function belowExamples(m, max = 5) {
    const out = [];
    for (let t = 0; t <= m && out.length < max; t++) scoreExamples(t, 3).forEach(x => out.length < max && out.push(x));
    return out;
  }
  function goalLambdas(s) {
    const lh0 = mean([st(s, 'hS'), st(s, 'aC')]), la0 = mean([st(s, 'aS'), st(s, 'hC')]);
    if (!C) return { lh: lh0, la: la0 };
    const G = C.goalLambdas(s, lh0, la0, CTX.neutral);
    CTX.lines.push(...G.lines); CTX.effects.push(...G.effects);
    return { lh: G.lh, la: G.la };
  }
  function ctxMult(s, kind) {
    if (!C) return { home: 1, away: 1, total: 1 };
    const M = C.multipliers(s, kind, CTX.neutral);
    CTX.effects.push(...M.effects);
    return M;
  }
  function finish(parts, lines, extra) {
    return Object.assign({ pS: mean(parts.map(x => x.p)), parts, lines }, extra || {});
  }

  // ---------- fattori e fonti comuni ----------
  const FOOTBALL_FACTORS = [
    ['big', 'Partita bloccata o big match', 'Alta posta e paura di perdere: spesso meno occasioni'],
    ['attAbs', 'Assenze in attacco', 'Bomber o creatori di gioco fuori'],
    ['defAbs', 'Assenze in difesa', 'Difensori o portiere titolari fuori'],
    ['tired', 'Stanchezza o turnover', 'Coppe a metà settimana, viaggi, rinvii'],
    ['need', 'Bisogno di risultato', 'Chi deve vincere a tutti i costi'],
    ['form', 'Forma recente', 'Ultime 5 partite'],
    ['h2h', 'Precedenti diretti', 'Storico degli ultimi incontri'],
    ['weather', 'Meteo e campo', 'Pioggia forte, vento, campo pesante']
  ];
  const OTHER_FACTORS = [
    ['form', 'Forma recente', 'Risultati e prestazioni delle ultime uscite'],
    ['injuries', 'Infortuni o condizioni fisiche', 'Assenze, acciacchi, rientri'],
    ['tired', 'Calendario e stanchezza', 'Back-to-back, viaggi, turni ravvicinati'],
    ['need', 'Motivazioni', 'Classifica, qualificazione, ultima occasione'],
    ['h2h', 'Precedenti diretti', 'Storico degli scontri'],
    ['venue', 'Campo, superficie o circuito', 'Casa/trasferta, terra/erba, tipo di pista'],
    ['weather', 'Meteo', 'Pioggia, vento, caldo']
  ];

  const SRC = {
    oddschecker: { n: 'OddsChecker', u: 'https://www.oddschecker.com/it/', w: 'Confronto quote tra bookmaker' },
    soccerstats: { n: 'SoccerStats', u: 'https://www.soccerstats.com/', w: 'Gol per tempo, over, tabelle 1T/2T' },
    footystats: { n: 'FootyStats', u: 'https://footystats.org/', w: 'Over/Under, Goal/No Goal, corner, cartellini, arbitri' },
    fotmob: { n: 'FotMob', u: 'https://www.fotmob.com/', w: 'Formazioni probabili, assenze, xG' },
    sofascore: { n: 'Sofascore', u: 'https://www.sofascore.com/', w: 'Statistiche partita, forma, giocatori' },
    flashscore: { n: 'Flashscore', u: 'https://www.flashscore.it/', w: 'Risultati, precedenti, quote' },
    transfermarkt: { n: 'Transfermarkt', u: 'https://www.transfermarkt.it/', w: 'Infortuni e squalifiche' },
    fbref: { n: 'FBref', u: 'https://fbref.com/', w: 'Gol ogni 90 minuti, minuti giocati, xG giocatori' },
    bbref: { n: 'Basketball Reference', u: 'https://www.basketball-reference.com/', w: 'Punti fatti e subiti, ritmo partita' },
    tennisab: { n: 'Tennis Abstract', u: 'https://www.tennisabstract.com/', w: 'Statistiche giocatori per superficie' },
    salva: { n: 'Salva il Bottino', u: 'https://salvailbottino.sisal.it/', w: 'Domanda del giorno e regolamento' },
    sisal: { n: 'Sisal', u: 'https://www.sisal.it/', w: 'Le quote del gestore del quiz' }
  };

  const COMMON_CHECK = [
    'Controlla le formazioni ufficiali (di solito escono circa un\'ora prima).',
    'Ricontrolla le quote poco prima di rispondere: se si muovono molto, qualcosa è cambiato.',
    'Verifica l\'orario di chiusura della risposta nel quiz.'
  ];

  // ---------- tipi di domanda ----------
  const TEMPLATES = [
    {
      id: 'goals_total', sport: 'Calcio', name: 'Gol totali (Over/Under)',
      blurb: 'Es. "Almeno 2 gol nel primo tempo?", "Più di 2,5 gol nella partita?"',
      ways: 2, sideNames: ['Over', 'Under'],
      params: [
        { k: 'period', label: 'Periodo', type: 'select', options: PERIODS },
        { k: 'line', label: 'Soglia', type: 'number', step: 0.5, hint: 'Almeno 2 gol = 1,5 · almeno 3 = 2,5' },
        SIDE_OU
      ],
      defaults: { params: { period: 'FT', line: '2.5', side: 'pos' } },
      fields: [
        { k: 'hS', label: 'Casa · gol fatti a partita', hint: 'Nel periodo della domanda' },
        { k: 'hC', label: 'Casa · gol subiti a partita' },
        { k: 'aS', label: 'Ospite · gol fatti a partita' },
        { k: 'aC', label: 'Ospite · gol subiti a partita' },
        { k: 'hPct', label: 'Casa · % partite con Over', step: 1 },
        { k: 'aPct', label: 'Ospite · % partite con Over', step: 1 }
      ],
      extraFactors: [
        ['early', 'Squadre che segnano presto', 'Molti gol nei primi 15-30 minuti'],
        ['solid', 'Difese solide', 'Molti clean sheet, portieri in forma']
      ],
      describe(s) {
        const line = num(s.params.line) ?? 2.5, k = Math.floor(line) + 1, p = s.params.period;
        return {
          market: `Under/Over ${lf(line)}${perShort(p)}`,
          si: `Almeno ${k} gol in totale ${perIn(p)} (Over ${lf(line)})`,
          no: `${k - 1 === 0 ? 'Nessun gol' : 'Al massimo ' + (k - 1) + ' gol'} ${perIn(p)} (Under ${lf(line)})`,
          rules: [
            'Contano i gol di entrambe le squadre, autogol compresi.',
            p === '1T' ? 'Vale anche il recupero del primo tempo.' :
            p === '2T' ? 'Contano solo i gol segnati dopo l\'intervallo, recupero compreso.' :
            'Di norma vale il tempo regolamentare più recupero, senza supplementari e rigori: verifica il regolamento del quiz.'
          ]
        };
      },
      model(s) {
        const line = num(s.params.line) ?? 2.5, k = Math.floor(line) + 1, per = perLong(s.params.period), n = names(s);
        const { lh, la } = goalLambdas(s);
        const parts = [], lines = [];
        let dist = null;
        if (lh != null && la != null) {
          const L = lh + la, pP = E.poissonOver(L, line);
          parts.push({ label: 'Modello dei gol attesi', p: pP });
          lines.push(`Gol attesi ${perIn(s.params.period)}: ${dec(lh)} per ${n.home} e ${dec(la)} per ${n.away}, in totale ${dec(L)}. Ogni valore è la media tra quanto segna una squadra e quanto subisce l'altra.`);
          lines.push(`Con ${dec(L)} gol attesi, la probabilità di vederne almeno ${k} è ${pct(pP)}.`);
          dist = E.poissonDist(L, Math.max(k + 1, 3)).map(d => ({ label: d.plus ? `${d.k}+ gol` : `${d.k} gol`, p: d.p, si: d.k >= k }));
        }
        const f = freq(s, ['hPct', 'aPct']);
        if (f != null) {
          parts.push({ label: 'Frequenza storica', p: f });
          lines.push(`Nelle partite stagionali delle due squadre l'Over ${lf(line)} è uscito in media nel ${pct(f)} dei casi.`);
        }
        return finish(parts, lines, { dist });
      },
      scenarios(s) {
        const line = num(s.params.line) ?? 2.5, k = Math.floor(line) + 1, per = perLong(s.params.period);
        const si = [`Servono almeno ${k} gol ${perEnd(s.params.period)}: per esempio ${scoreExamples(k).join(', ')} o punteggi più larghi.`];
        const no = [`Basta fermarsi a ${k - 1} ${k - 1 === 1 ? 'gol' : 'gol'} o meno: ${belowExamples(k - 1).join(', ')}.`];
        if (s.params.period === '1T') si.push('Un gol nei primi 20 minuti di solito apre la partita e rende più probabile il secondo.');
        no.push('Se si arriva a metà periodo sullo 0-0, il No diventa molto probabile.');
        return { si, no };
      },
      checklist: ['Guarda chi gioca in attacco: un centravanti in panchina pesa molto sui gol.'],
      promptNeeds: s => [
        `quote Under/Over ${lf(num(s.params.line) ?? 2.5)}${perShort(s.params.period)}`,
        `gol fatti e subiti a partita ${perIn(s.params.period)} (casa per la squadra di casa, trasferta per l'ospite, più il totale)`,
        `% di partite con Over ${lf(num(s.params.line) ?? 2.5)}${perShort(s.params.period)} per entrambe`
      ],
      sources: ['oddschecker', 'soccerstats', 'footystats', 'fotmob']
    },

    {
      id: 'btts', sport: 'Calcio', name: 'Segnano entrambe (Goal/No Goal)',
      blurb: 'Es. "Entrambe le squadre segneranno?"',
      ways: 2, sideNames: ['Goal', 'No Goal'],
      params: [
        { k: 'period', label: 'Periodo', type: 'select', options: PERIODS },
        { k: 'side', label: 'Il Sì corrisponde a', type: 'select', options: [{ v: 'pos', l: 'Goal (segnano entrambe)' }, { v: 'neg', l: 'No Goal (almeno una non segna)' }] }
      ],
      defaults: { params: { period: 'FT', side: 'pos' } },
      fields: [
        { k: 'hS', label: 'Casa · gol fatti a partita' },
        { k: 'hC', label: 'Casa · gol subiti a partita' },
        { k: 'aS', label: 'Ospite · gol fatti a partita' },
        { k: 'aC', label: 'Ospite · gol subiti a partita' },
        { k: 'hPct', label: 'Casa · % partite con Goal', step: 1 },
        { k: 'aPct', label: 'Ospite · % partite con Goal', step: 1 }
      ],
      extraFactors: [['solid', 'Una difesa molto solida', 'Clean sheet frequenti di una delle due']],
      describe(s) {
        const p = s.params.period;
        return {
          market: `Goal/No Goal${perShort(p)}`,
          si: `Segnano entrambe le squadre ${perIn(p)}`,
          no: `Almeno una delle due non segna ${perIn(p)}`,
          rules: ['Un autogol conta come gol della squadra che lo riceve a favore.', 'Supplementari e rigori di solito non contano: verifica il regolamento.']
        };
      },
      model(s) {
        const n = names(s), { lh, la } = goalLambdas(s), parts = [], lines = [];
        if (lh != null && la != null) {
          const ph = 1 - Math.exp(-lh), pa = 1 - Math.exp(-la), pP = ph * pa;
          parts.push({ label: 'Modello dei gol attesi', p: pP });
          lines.push(`Gol attesi: ${dec(lh)} per ${n.home}, ${dec(la)} per ${n.away}.`);
          lines.push(`Probabilità che segni ${n.home}: ${pct(ph)}. Che segni ${n.away}: ${pct(pa)}. Che segnino entrambe: ${pct(pP)}.`);
        }
        const f = freq(s, ['hPct', 'aPct']);
        if (f != null) { parts.push({ label: 'Frequenza storica', p: f }); lines.push(`Il Goal è uscito in media nel ${pct(f)} delle partite delle due squadre.`); }
        return finish(parts, lines);
      },
      scenarios() {
        return {
          si: ['Serve almeno un gol per parte: 1-1, 2-1, 1-2, 2-2...', 'Il Sì è favorito se entrambe hanno attacchi in forma e difese che concedono.'],
          no: ['Basta che una resti a secco: 0-0, 1-0, 2-0, 0-1...', 'Il No è favorito se una delle due è molto più forte o molto difensiva.']
        };
      },
      checklist: [],
      promptNeeds: s => ['quote Goal/No Goal' + perShort(s.params.period), 'gol fatti e subiti a partita di entrambe', '% di partite con Goal di entrambe', 'clean sheet e partite senza segnare'],
      sources: ['oddschecker', 'footystats', 'soccerstats', 'fotmob']
    },

    {
      id: 'team_goals', sport: 'Calcio', name: 'Gol di una squadra',
      blurb: 'Es. "Il PSG segnerà almeno 2 gol?"',
      ways: 2, sideNames: ['Over', 'Under'],
      params: [
        { k: 'team', label: 'Squadra', type: 'select', options: [{ v: 'home', l: 'Squadra di casa' }, { v: 'away', l: 'Squadra ospite' }] },
        { k: 'period', label: 'Periodo', type: 'select', options: PERIODS },
        { k: 'line', label: 'Soglia', type: 'number', step: 0.5, hint: 'Almeno 1 gol = 0,5' },
        SIDE_OU
      ],
      defaults: { params: { team: 'home', period: 'FT', line: '0.5', side: 'pos' } },
      fields: [
        { k: 'hS', label: 'Casa · gol fatti a partita' },
        { k: 'hC', label: 'Casa · gol subiti a partita' },
        { k: 'aS', label: 'Ospite · gol fatti a partita' },
        { k: 'aC', label: 'Ospite · gol subiti a partita' },
        { k: 'tPct', label: '% partite in cui la squadra supera la soglia', step: 1 }
      ],
      extraFactors: [],
      describe(s) {
        const n = names(s), t = s.params.team === 'away' ? n.away : n.home, line = num(s.params.line) ?? 0.5, k = Math.floor(line) + 1;
        return {
          market: `Over/Under ${lf(line)} squadra (${t})${perShort(s.params.period)}`,
          si: `${t} segna almeno ${k} gol ${perIn(s.params.period)}`,
          no: `${t} segna ${k - 1 === 0 ? 'zero gol' : 'al massimo ' + (k - 1) + ' gol'} ${perIn(s.params.period)}`,
          rules: ['Gli autogol a favore contano per la squadra.']
        };
      },
      model(s) {
        const n = names(s), away = s.params.team === 'away', t = away ? n.away : n.home, line = num(s.params.line) ?? 0.5, k = Math.floor(line) + 1;
        const { lh, la } = goalLambdas(s), L = away ? la : lh, parts = [], lines = [];
        let dist = null;
        if (L != null) {
          const pP = E.poissonOver(L, line);
          parts.push({ label: 'Modello dei gol attesi', p: pP });
          lines.push(`Gol attesi di ${t}: ${dec(L)} (media tra quanto segna e quanto subisce l'avversaria).`);
          lines.push(`Probabilità di almeno ${k} gol: ${pct(pP)}.`);
          dist = E.poissonDist(L, Math.max(k + 1, 3)).map(d => ({ label: d.plus ? `${d.k}+ gol` : `${d.k} gol`, p: d.p, si: d.k >= k }));
        }
        const f = freq(s, ['tPct']);
        if (f != null) { parts.push({ label: 'Frequenza storica', p: f }); lines.push(`Storicamente ${t} ha superato la soglia nel ${pct(f)} delle partite.`); }
        return finish(parts, lines, { dist });
      },
      scenarios(s) {
        const n = names(s), t = s.params.team === 'away' ? n.away : n.home, k = Math.floor(num(s.params.line) ?? 0.5) + 1;
        return { si: [`${t} deve arrivare a ${k} gol, a prescindere dal risultato.`], no: [`Basta che ${t} resti sotto quota ${k}.`] };
      },
      checklist: [],
      promptNeeds: s => ['quote Over/Under gol della squadra indicata', 'gol fatti a partita della squadra e gol subiti dall\'avversaria (casa/trasferta)', '% di partite in cui la squadra ha superato la soglia'],
      sources: ['oddschecker', 'footystats', 'fotmob', 'transfermarkt']
    },

    {
      id: 'match_result', sport: 'Calcio', name: 'Esito della partita (1X2)',
      blurb: 'Es. "Vincerà la squadra di casa?", "Finirà in pareggio?"',
      ways: 3, oddsLabels: ['1', 'X', '2'],
      params: [
        { k: 'outcome', label: 'Il Sì corrisponde a', type: 'select', options: [{ v: 'home', l: 'Vittoria casa (1)' }, { v: 'draw', l: 'Pareggio (X)' }, { v: 'away', l: 'Vittoria ospite (2)' }] },
        { k: 'period', label: 'Periodo', type: 'select', options: [{ v: 'FT', l: 'Partita intera' }, { v: '1T', l: '1° tempo' }] },
        { k: 'side', label: 'Forma della domanda', type: 'select', options: [{ v: 'pos', l: 'L\'esito si verifica' }, { v: 'neg', l: 'L\'esito NON si verifica (es. "non perde")' }] }
      ],
      defaults: { params: { outcome: 'home', period: 'FT', side: 'pos' } },
      selIndex: s => ({ home: 0, draw: 1, away: 2 }[s.params.outcome] ?? 0),
      fields: [
        { k: 'hS', label: 'Casa · gol fatti a partita' },
        { k: 'hC', label: 'Casa · gol subiti a partita' },
        { k: 'aS', label: 'Ospite · gol fatti a partita' },
        { k: 'aC', label: 'Ospite · gol subiti a partita' },
        { k: 'tPct', label: '% storica dell\'esito (es. vittorie casalinghe)', step: 1 }
      ],
      extraFactors: [['home', 'Fattore campo', 'Stadio caldo, rendimento casalingo molto diverso']],
      describe(s) {
        const n = names(s), o = s.params.outcome, per = s.params.period === '1T' ? ' al termine del primo tempo' : '';
        const si = o === 'draw' ? `Pareggio${per}` : `Vince ${o === 'away' ? n.away : n.home}${per}`;
        const no = o === 'draw' ? `Vince una delle due${per} (doppia chance 12)` : o === 'home' ? `Pareggio o vittoria di ${n.away}${per} (X2)` : `Pareggio o vittoria di ${n.home}${per} (1X)`;
        return {
          market: s.params.period === '1T' ? 'Esito 1° tempo (1X2)' : 'Esito finale 1X2',
          si, no,
          rules: ['Conta il risultato dei 90 minuti più recupero, senza supplementari e rigori, salvo indicazioni diverse.', 'Inserisci tutte e tre le quote 1, X e 2: il calcolo somma gli esiti che portano alla stessa risposta.']
        };
      },
      model(s) {
        const n = names(s), { lh, la } = goalLambdas(s), parts = [], lines = [];
        let dist = null;
        if (lh != null && la != null) {
          const r = E.matchProbs(lh, la), p = r[s.params.outcome] ?? r.home;
          parts.push({ label: 'Modello dei gol attesi', p });
          lines.push(`Gol attesi: ${dec(lh)} per ${n.home}, ${dec(la)} per ${n.away}.`);
          lines.push(`Il modello stima: vittoria ${n.home} ${pct(r.home)}, pareggio ${pct(r.draw)}, vittoria ${n.away} ${pct(r.away)}. Questo modello tende a sottostimare un po' i pareggi.`);
          const sel = s.params.outcome;
          dist = [{ label: '1', p: r.home, si: sel === 'home' }, { label: 'X', p: r.draw, si: sel === 'draw' }, { label: '2', p: r.away, si: sel === 'away' }];
        }
        const f = freq(s, ['tPct']);
        if (f != null) { parts.push({ label: 'Frequenza storica', p: f }); lines.push(`L'esito si è verificato storicamente nel ${pct(f)} dei casi.`); }
        return finish(parts, lines, { dist });
      },
      scenarios(s) {
        const o = s.params.outcome, n = names(s);
        if (o === 'draw') return { si: ['Serve lo stesso numero di gol: 0-0, 1-1, 2-2.'], no: ['Basta un gol di scarto per una delle due.'] };
        const t = o === 'away' ? n.away : n.home, other = o === 'away' ? n.home : n.away;
        return { si: [`Serve che ${t} vinca, con almeno un gol di scarto.`], no: [`Basta che ${t} non vinca: pareggio oppure vittoria di ${other}.`] };
      },
      checklist: ['Quando una risposta copre due esiti su tre (pareggio o vittoria), controlla che la sua probabilità superi davvero il 50%.'],
      promptNeeds: () => ['quote 1X2 da più bookmaker', 'gol fatti e subiti a partita (casa/trasferta)', 'rendimento casalingo e in trasferta', 'precedenti diretti recenti'],
      sources: ['oddschecker', 'flashscore', 'fotmob', 'sofascore']
    },

    {
      id: 'corners', sport: 'Calcio', name: 'Calci d\'angolo',
      blurb: 'Es. "Ci saranno più di 9,5 corner?"',
      ways: 2, sideNames: ['Over', 'Under'],
      params: [
        { k: 'period', label: 'Periodo', type: 'select', options: [{ v: 'FT', l: 'Partita intera' }, { v: '1T', l: '1° tempo' }] },
        { k: 'line', label: 'Soglia', type: 'number', step: 0.5 },
        SIDE_OU
      ],
      defaults: { params: { period: 'FT', line: '9.5', side: 'pos' } },
      fields: [
        { k: 'hCF', label: 'Casa · corner a favore a partita' },
        { k: 'hCA', label: 'Casa · corner concessi a partita' },
        { k: 'aCF', label: 'Ospite · corner a favore a partita' },
        { k: 'aCA', label: 'Ospite · corner concessi a partita' },
        { k: 'hPct', label: 'Casa · % partite con Over', step: 1 },
        { k: 'aPct', label: 'Ospite · % partite con Over', step: 1 }
      ],
      extraFactors: [
        ['wide', 'Gioco sulle fasce e cross', 'Squadre che attaccano dagli esterni fanno più corner'],
        ['siege', 'Favorita contro difesa chiusa', 'Un assedio produce molti corner']
      ],
      describe(s) {
        const line = num(s.params.line) ?? 9.5, k = Math.floor(line) + 1;
        return {
          market: `Corner totali Over/Under ${lf(line)}${perShort(s.params.period)}`,
          si: `Almeno ${k} calci d'angolo in totale`, no: `Al massimo ${k - 1} calci d'angolo`,
          rules: ['Contano i corner battuti da entrambe le squadre.', 'I corner assegnati ma non battuti di solito non contano: verifica il regolamento.']
        };
      },
      model(s) {
        const line = num(s.params.line) ?? 9.5, k = Math.floor(line) + 1, n = names(s), parts = [], lines = [];
        let ch = mean([st(s, 'hCF'), st(s, 'aCA')]), ca = mean([st(s, 'aCF'), st(s, 'hCA')]);
        if (ch != null && ca != null) {
          const K = ctxMult(s, 'corners'); ch *= K.home; ca *= K.away;
          const L = ch + ca, pP = E.poissonOver(L, line);
          parts.push({ label: 'Modello dei corner attesi', p: pP });
          lines.push(`Corner attesi: ${dec(ch, 1)} per ${n.home} e ${dec(ca, 1)} per ${n.away}, in totale ${dec(L, 1)}.`);
          lines.push(`Probabilità di almeno ${k} corner: ${pct(pP)}. I corner variano più dei gol, quindi questa stima è meno precisa.`);
        }
        const f = freq(s, ['hPct', 'aPct']);
        if (f != null) { parts.push({ label: 'Frequenza storica', p: f }); lines.push(`L'Over ${lf(line)} è uscito in media nel ${pct(f)} delle partite delle due squadre.`); }
        return finish(parts, lines);
      },
      scenarios() {
        return { si: ['Partita aperta o una squadra che assedia l\'altra.'], no: ['Partita lenta, molto gioco centrale, pochi tiri.'] };
      },
      checklist: [],
      promptNeeds: s => [`quote corner Over/Under ${lf(num(s.params.line) ?? 9.5)}`, 'corner a favore e concessi a partita per entrambe (casa/trasferta)', '% di partite con Over sulla stessa soglia'],
      sources: ['oddschecker', 'footystats', 'sofascore']
    },

    {
      id: 'cards', sport: 'Calcio', name: 'Cartellini',
      blurb: 'Es. "Ci saranno almeno 5 cartellini?"',
      ways: 2, sideNames: ['Over', 'Under'],
      params: [{ k: 'line', label: 'Soglia', type: 'number', step: 0.5 }, SIDE_OU],
      defaults: { params: { line: '4.5', side: 'pos' } },
      fields: [
        { k: 'hK', label: 'Casa · cartellini ricevuti a partita' },
        { k: 'aK', label: 'Ospite · cartellini ricevuti a partita' },
        { k: 'ref', label: 'Arbitro · cartellini a partita', hint: 'Media dell\'arbitro designato' },
        { k: 'hPct', label: 'Casa · % partite con Over', step: 1 },
        { k: 'aPct', label: 'Ospite · % partite con Over', step: 1 }
      ],
      extraFactors: [
        ['derby', 'Derby o rivalità', 'Più tensione, più falli'],
        ['refstrict', 'Arbitro fiscale', 'Media cartellini alta']
      ],
      describe(s) {
        const line = num(s.params.line) ?? 4.5, k = Math.floor(line) + 1;
        return {
          market: `Cartellini totali Over/Under ${lf(line)}`,
          si: `Almeno ${k} cartellini in totale`, no: `Al massimo ${k - 1} cartellini`,
          rules: ['Verifica nel regolamento come contano rosso diretto e doppio giallo.', 'I cartellini a giocatori in panchina o allo staff spesso non contano.']
        };
      },
      model(s) {
        const line = num(s.params.line) ?? 4.5, k = Math.floor(line) + 1, parts = [], lines = [];
        const hK = st(s, 'hK'), aK = st(s, 'aK'), ref = st(s, 'ref');
        const teams = (hK != null && aK != null) ? hK + aK : null;
        let L = teams != null && ref != null ? (teams + ref) / 2 : (teams ?? ref);
        if (L != null) {
          const K = ctxMult(s, 'cards'); L *= K.total;
          const pP = E.poissonOver(L, line);
          parts.push({ label: 'Modello dei cartellini attesi', p: pP });
          lines.push(`Cartellini attesi: ${dec(L, 1)}${teams != null && ref != null ? ` (media tra squadre, ${dec(teams, 1)}, e arbitro, ${dec(ref, 1)})` : ''}.`);
          lines.push(`Probabilità di almeno ${k} cartellini: ${pct(pP)}.`);
        }
        const f = freq(s, ['hPct', 'aPct']);
        if (f != null) { parts.push({ label: 'Frequenza storica', p: f }); lines.push(`L'Over ${lf(line)} è uscito in media nel ${pct(f)} delle partite delle due squadre.`); }
        return finish(parts, lines);
      },
      scenarios() {
        return { si: ['Partita tesa, punteggio in bilico fino alla fine, arbitro severo.'], no: ['Partita chiusa presto, squadre tranquille, arbitro che lascia giocare.'] };
      },
      checklist: ['Controlla l\'arbitro designato e la sua media cartellini.'],
      promptNeeds: s => [`quote cartellini Over/Under ${lf(num(s.params.line) ?? 4.5)}`, 'cartellini a partita di entrambe le squadre', 'arbitro designato e sua media cartellini in stagione'],
      sources: ['oddschecker', 'footystats', 'transfermarkt']
    },

    {
      id: 'player_scores', sport: 'Calcio', name: 'Marcatore',
      blurb: 'Es. "Dembélé segnerà?"',
      ways: 2, sideNames: ['Segna', 'Non segna'],
      params: [
        { k: 'player', label: 'Giocatore', type: 'text' },
        { k: 'team', label: 'Gioca per', type: 'select', options: [{ v: 'home', l: 'Squadra di casa' }, { v: 'away', l: 'Squadra ospite' }] },
        { k: 'line', label: 'Soglia', type: 'number', step: 1, hint: 'Almeno 1 gol = 0,5' },
        { k: 'side', label: 'Il Sì corrisponde a', type: 'select', options: [{ v: 'pos', l: 'Segna' }, { v: 'neg', l: 'Non segna' }] }
      ],
      defaults: { params: { player: '', team: 'home', line: '0.5', side: 'pos' } },
      fields: [
        { k: 'g90', label: 'Gol ogni 90 minuti', hint: 'Stagione, rigori compresi' },
        { k: 'mins', label: 'Minuti previsti in campo', step: 5 },
        { k: 'oppC', label: 'Avversaria · gol subiti a partita' },
        { k: 'leagueC', label: 'Campionato · gol subiti a partita (media)' },
        { k: 'tPct', label: '% partite in cui ha segnato', step: 1 }
      ],
      extraFactors: [
        ['starter', 'Titolare confermato', 'Controlla la formazione ufficiale'],
        ['penalty', 'Rigorista', 'Tira i rigori della squadra']
      ],
      describe(s) {
        const p = s.params.player || 'Il giocatore';
        return {
          market: `Marcatore: ${p} segna`,
          si: `${p} segna almeno un gol`, no: `${p} non segna`,
          rules: ['Gli autogol non contano come gol del giocatore.', 'Se il giocatore non entra in campo, controlla cosa prevede il regolamento del quiz.']
        };
      },
      model(s) {
        const p = s.params.player || 'il giocatore', line = num(s.params.line) ?? 0.5, parts = [], lines = [];
        const g90 = st(s, 'g90'), mins = st(s, 'mins') ?? 90, oppC = st(s, 'oppC'), lg = st(s, 'leagueC');
        if (g90 != null) {
          const factor = oppC != null && lg ? oppC / lg : 1;
          const K = ctxMult(s, 'goals'), kt = s.params.team === 'away' ? K.away : K.home;
          const rate = g90 * (mins / 90) * factor * kt, pP = E.poissonOver(rate, line);
          parts.push({ label: 'Modello gol ogni 90 minuti', p: pP });
          lines.push(`${p} segna ${dec(g90)} gol ogni 90 minuti. Con ${Math.round(mins)} minuti previsti${factor !== 1 ? ` e una difesa avversaria che concede ${factor > 1 ? 'più' : 'meno'} della media (×${dec(factor)})` : ''}, i gol attesi sono ${dec(rate)}.`);
          lines.push(`Probabilità che segni: ${pct(pP)}.`);
        }
        const f = freq(s, ['tPct']);
        if (f != null) { parts.push({ label: 'Frequenza storica', p: f }); lines.push(`Ha segnato nel ${pct(f)} delle partite giocate.`); }
        return finish(parts, lines);
      },
      scenarios(s) {
        const p = s.params.player || 'il giocatore';
        return { si: [`${p} titolare, squadra che crea molto, eventuale rigore.`], no: [`${p} in panchina o sostituito presto, partita bloccata.`] };
      },
      checklist: ['Aspetta la formazione ufficiale: se parte dalla panchina, le probabilità crollano.'],
      promptNeeds: s => [`quota marcatore di ${s.params.player || 'il giocatore'}`, 'gol ogni 90 minuti e minuti medi giocati', 'se è rigorista e se è titolare previsto', 'gol subiti a partita dall\'avversaria e media del campionato'],
      sources: ['oddschecker', 'fbref', 'fotmob', 'transfermarkt']
    },

    {
      id: 'points_total', sport: 'Basket e sport a punti', name: 'Totale punti',
      blurb: 'Es. "Più di 220,5 punti nella partita?"',
      ways: 2, sideNames: ['Over', 'Under'],
      params: [{ k: 'line', label: 'Soglia', type: 'number', step: 0.5 }, SIDE_OU],
      defaults: { params: { line: '220.5', side: 'pos' }, stats: { sd: '18' } },
      fields: [
        { k: 'hP', label: 'Casa · punti fatti a partita', step: 0.1 },
        { k: 'hA', label: 'Casa · punti subiti a partita', step: 0.1 },
        { k: 'aP', label: 'Ospite · punti fatti a partita', step: 0.1 },
        { k: 'aA', label: 'Ospite · punti subiti a partita', step: 0.1 },
        { k: 'sd', label: 'Variabilità del totale (deviazione standard)', step: 0.5, hint: 'Per l\'NBA circa 17-20 punti' },
        { k: 'hPct', label: 'Casa · % partite con Over', step: 1 },
        { k: 'aPct', label: 'Ospite · % partite con Over', step: 1 }
      ],
      factors: OTHER_FACTORS,
      extraFactors: [['pace', 'Ritmo di gioco', 'Squadre veloci = più possessi e più punti']],
      describe(s) {
        const line = num(s.params.line) ?? 220.5;
        return { market: `Totale punti Over/Under ${lf(line)}`, si: `Più di ${lf(line)} punti in totale`, no: `Meno di ${lf(line)} punti in totale`, rules: ['Verifica se i supplementari contano nel totale (nel basket di solito sì).'] };
      },
      model(s) {
        const line = num(s.params.line) ?? 220.5, n = names(s), parts = [], lines = [];
        let ph = mean([st(s, 'hP'), st(s, 'aA')]), pa = mean([st(s, 'aP'), st(s, 'hA')]);
        const sd = st(s, 'sd') || 18;
        if (ph != null && pa != null) {
          const K = ctxMult(s, 'points'); ph *= K.home; pa *= K.away;
          const m = ph + pa, pP = E.normalOver(m, sd, line);
          parts.push({ label: 'Modello dei punti attesi', p: pP });
          lines.push(`Punti attesi: ${dec(ph, 1)} per ${n.home} e ${dec(pa, 1)} per ${n.away}, in totale ${dec(m, 1)} contro una soglia di ${lf(line)}.`);
          lines.push(`Con una variabilità di ±${dec(sd, 1)} punti, la probabilità di superare la soglia è ${pct(pP)}.`);
        }
        const f = freq(s, ['hPct', 'aPct']);
        if (f != null) { parts.push({ label: 'Frequenza storica', p: f }); lines.push(`L'Over è uscito in media nel ${pct(f)} delle partite delle due squadre.`); }
        return finish(parts, lines);
      },
      scenarios() { return { si: ['Ritmo alto, difese stanche, eventuale supplementare.'], no: ['Ritmo basso, difese aggressive, titolari a riposo.'] }; },
      checklist: ['Controlla chi riposa: nel basket i titolari fermi cambiano molto il totale.'],
      promptNeeds: s => [`quote totale punti Over/Under ${lf(num(s.params.line) ?? 220.5)}`, 'punti fatti e subiti a partita (casa/trasferta)', 'ritmo di gioco (possessi a partita)', 'giocatori a riposo o infortunati'],
      sources: ['oddschecker', 'bbref', 'flashscore']
    },

    {
      id: 'generic', sport: 'Altro', name: 'Altra domanda (tennis, F1, MotoGP...)',
      blurb: 'Qualsiasi domanda Sì/No: inserisci quote, eventuale dato storico e la tua stima.',
      ways: 2,
      params: [
        { k: 'marketName', label: 'Mercato equivalente', type: 'text', hint: 'Es. "Sinner vince il 1° set"' },
        { k: 'siText', label: 'Il Sì significa', type: 'text' },
        { k: 'noText', label: 'Il No significa', type: 'text' }
      ],
      defaults: { params: { marketName: '', siText: '', noText: '' } },
      fields: [
        { k: 'tPct', label: '% storica dell\'esito Sì', step: 1, hint: 'Se esiste un dato confrontabile' },
        { k: 'own', label: 'Tua stima personale del Sì (%)', step: 1 }
      ],
      factors: OTHER_FACTORS,
      extraFactors: [],
      describe(s) {
        return { market: s.params.marketName || 'Da definire', si: s.params.siText || 'L\'evento si verifica', no: s.params.noText || 'L\'evento non si verifica', rules: ['Leggi bene il regolamento della domanda: ritiri, rinvii e casi limite cambiano l\'esito.'] };
      },
      model(s) {
        const parts = [], lines = [];
        const f = freq(s, ['tPct']), own = st(s, 'own');
        if (f != null) { parts.push({ label: 'Frequenza storica', p: f }); lines.push(`Il dato storico indica il Sì nel ${pct(f)} dei casi.`); }
        if (own != null) { parts.push({ label: 'Stima personale', p: own / 100 }); lines.push(`La tua stima personale del Sì è ${pct(own / 100)}.`); }
        return finish(parts, lines);
      },
      scenarios(s) { return { si: [s.params.siText || 'L\'evento si verifica.'], no: [s.params.noText || 'L\'evento non si verifica.'] }; },
      checklist: [],
      promptNeeds: s => [`quote Sì/No del mercato "${s.params.marketName || 'equivalente'}"`, 'statistiche storiche comparabili', 'condizioni dei protagonisti e notizie recenti'],
      sources: ['oddschecker', 'flashscore', 'tennisab', 'sofascore']
    }
  ];

  const byId = id => TEMPLATES.find(t => t.id === id) || TEMPLATES[0];
  const factorsFor = t => (t.factors || FOOTBALL_FACTORS).concat(t.extraFactors || []);
  const sourcesFor = t => (t.sources || []).concat(['salva']).map(k => SRC[k]).filter(Boolean);
  const oddsSourcesFor = () => ['oddschecker', 'sisal', 'flashscore'].map(k => SRC[k]);
  const statSourcesFor = t => (t.sources || []).filter(k => k !== 'oddschecker').map(k => SRC[k]).filter(Boolean);
  const isInvertible = t => !!(t.sideNames || t.ways === 3);

  // Pesi delle stime: il modello pesa più della frequenza stagionale; forma e precedenti poco (campioni piccoli).
  function weightFor(label) {
    if (/^Modello/.test(label)) return 0.5;
    if (/^Frequenza storica/.test(label)) return 0.25;
    if (/^Stima personale/.test(label)) return 0.5;
    return 0.1;
  }
  // Esegue il modello del tipo di domanda e aggiunge le stime da forma e precedenti.
  // opts.neutral = true calcola la stessa stima senza il contesto, per misurarne l'effetto.
  function runModel(s, opts) {
    const t = byId(s.type);
    CTX.neutral = !!(opts && opts.neutral); CTX.lines = []; CTX.effects = [];
    let m;
    try { m = t.model(s); } finally { CTX.neutral = false; }
    const extra = C ? C.freqParts(s) : [];
    const parts = m.parts.map(p => Object.assign({ w: weightFor(p.label) }, p)).concat(extra);
    const sw = parts.reduce((a, p) => a + p.w, 0);
    const pS = parts.length ? parts.reduce((a, p) => a + p.w * p.p, 0) / sw : null;
    return Object.assign({}, m, {
      parts, pS,
      lines: CTX.lines.concat(m.lines, extra.map(x => x.line)),
      effects: CTX.effects.slice()
    });
  }

  const api = { list: TEMPLATES, byId, runModel, weightFor, factorsFor, sourcesFor, oddsSourcesFor, statSourcesFor, isInvertible, SRC, COMMON_CHECK, fmt: { pct, dec, lf } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BLTemplates = api;
})(typeof window !== 'undefined' ? window : globalThis);
