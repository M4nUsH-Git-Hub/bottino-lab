/* Bottino Lab — interfaccia: incolla e riconosci, moduli, forma e contesto, analisi, storico, guida. */
(function () {
  'use strict';
  const E = window.BLEngine, T = window.BLTemplates, P = window.BLParser, C = window.BLContext;
  const { pct, dec, lf } = T.fmt;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));

  const DRAFT_KEY = 'bl4_draft', OLD_DRAFTS = ['bl3_draft'], DIARY_KEY = 'bl2_diary', MAX_ROWS = 6;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  // ---------- stato ----------
  const emptyRow = (bk = '') => ({ bk, a: '', b: '', c: '' });
  function blankState(type) {
    const t = T.byId(type || 'goals_total');
    return {
      v: 4, type: t.id, question: '', paste: '',
      quiz: { game: '', qn: '' },
      answers: { si: 'Sì', no: 'No' },
      event: { sport: t.sport, comp: '', home: '', away: '', when: '' },
      params: Object.assign({}, t.defaults.params),
      odds: [emptyRow('Sisal'), emptyRow(), emptyRow()],
      opening: emptyRow(),
      stats: Object.assign({}, t.defaults.stats || {}),
      sample: { nH: '', nA: '' },
      ctx: C.blankCtx(), statNotes: '', ctxNotes: '', w: 60
    };
  }

  const EXAMPLE = {
    v: 4, example: true, type: 'goals_total', question: 'Almeno 2 goal segnati nel 1° tempo?',
    paste: 'FRA Ligue 1\nParis Saint-Germain\nv/s\nLione\nAlmeno 2 goal segnati nel 1° tempo?',
    quiz: { game: '', qn: '' },
    answers: { si: 'Sì', no: 'No' },
    event: { sport: 'Calcio', comp: 'Ligue 1, 8ª giornata', home: 'Paris Saint-Germain', away: 'Lione', when: 'Lun 26/10/2026, 20:30' },
    params: { period: '1T', line: '1.5', side: 'pos' },
    odds: [{ bk: 'Sisal', a: '1,85', b: '1,80', c: '' }, emptyRow(), emptyRow()],
    opening: emptyRow(),
    stats: { hS: '0,43', hC: '0,57', aS: '0,86', aC: '0,43', hPct: '14', aPct: '43' },
    sample: { nH: '7', nA: '7' },
    ctx: {
      home: { last5: '', attAbs: '1', defAbs: '0', rest: '6', turnover: 'no', motiv: 'high', pos: '2', notes: 'Senza João Neves. Martedì Champions contro il Barcellona.' },
      away: { last5: '0-3, 2-1, 3-2, 1-2, 4-0', attAbs: '0', defAbs: '0', rest: '', turnover: 'no', motiv: 'high', pos: '1', notes: '' },
      match: { h2h: '1-2, 3-2', kind: 'big', weather: 'normal' }
    },
    statNotes: 'Ligue 1 2026/27, medie di tutta la stagione (le medie casa/trasferta hanno solo 2-5 partite). PSG: solo il 21% dei suoi gol prima dell\'intervallo. Lione: 46% dei gol nel primo tempo.',
    ctxNotes: 'Prima contro seconda, entrambe a 14 punti. Partita rinviata da domenica a lunedì su ordine della prefettura.',
    w: 60
  };

  function migrate(s) {
    if (!s || ![2, 3, 4].includes(s.v)) return null;
    if (s.example) return clone(EXAMPLE);
    const out = Object.assign(blankState(s.type), s, { v: 4 });
    out.answers = Object.assign({ si: 'Sì', no: 'No' }, s.answers || {});
    out.quiz = Object.assign({ game: '', qn: '' }, s.quiz || {});
    out.params = Object.assign({}, T.byId(out.type).defaults.params, s.params || {});
    out.opening = Object.assign(emptyRow(), s.opening || {});
    out.ctx = C.normalizeCtx(s.ctx);
    return out;
  }
  let state = migrate(store.get(DRAFT_KEY, null)) || OLD_DRAFTS.map(k => migrate(store.get(k, null))).find(Boolean) || clone(EXAMPLE);

  // ---------- etichette ----------
  const isInv = (t, s) => T.isInvertible(t) && s.params.side === 'neg';
  function oddsLabels(t, s) {
    if (t.ways === 3) return t.oddsLabels;
    if (!t.sideNames) return ['Quota Sì', 'Quota No'];
    const [p, n] = t.sideNames;
    return isInv(t, s) ? [`Sì · ${n}`, `No · ${p}`] : [`Sì · ${p}`, `No · ${n}`];
  }
  function describe(t, s) {
    const d = Object.assign({}, t.describe(s));
    const inv = isInv(t, s);
    if (inv) { const x = d.si; d.si = d.no; d.no = x; }
    if (t.sideNames) d.market += ` · Sì = ${inv ? t.sideNames[1] : t.sideNames[0]}`;
    else if (t.ways === 3 && inv) d.market += ' · Sì = esito opposto (doppia chance)';
    return d;
  }
  const ansLabel = k => (state.answers[k] || '').trim() || (k === 'si' ? 'Sì' : 'No');
  const teamName = side => (state.event[side] || '').trim() || (side === 'home' ? 'Casa' : 'Ospite');
  const initials = name => name.split(/[\s\-.]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const pl = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const srcLinks = list => list.map(x => `<a href="${x.u}" target="_blank" rel="noopener"><b>${esc(x.n)}</b><span>${esc(x.w)}</span></a>`).join('');

  // ---------- costruzione dei moduli ----------
  function buildTypeSelect() {
    const groups = {};
    T.list.forEach(t => { (groups[t.sport] = groups[t.sport] || []).push(t); });
    $('type').innerHTML = Object.keys(groups).map(g =>
      `<optgroup label="${esc(g)}">${groups[g].map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</optgroup>`).join('');
  }

  function renderParams() {
    const t = T.byId(state.type);
    $('typeBlurb').textContent = t.blurb;
    $('params').innerHTML = t.params.map(p => {
      const v = state.params[p.k] ?? '';
      const hint = p.hint ? ` <small>${esc(p.hint)}</small>` : '';
      if (p.type === 'select') {
        return `<label>${esc(p.label)}<select id="p_${p.k}" data-group="params" data-k="${p.k}">${p.options.map(o => `<option value="${o.v}"${String(v) === o.v ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>`;
      }
      const shown = p.type === 'number' ? lf(v) : v;
      return `<label>${esc(p.label)}${hint}<input id="p_${p.k}" type="text"${p.type === 'number' ? ' inputmode="decimal"' : ''} data-group="params" data-k="${p.k}" value="${esc(shown)}"></label>`;
    }).join('');
  }

  function renderOdds() {
    const t = T.byId(state.type), three = t.ways === 3, L = oddsLabels(t, state);
    $('oddsHead').innerHTML = `<tr><th>Bookmaker</th><th>${esc(L[0])}</th><th>${esc(L[1])}</th>${three ? `<th>${esc(L[2])}</th>` : ''}<th class="num">Margine</th><th class="num">Prob. Sì</th></tr>`;
    const cell = (grp, i, k, val, lab) => `<td><input id="o_${grp}_${i}_${k}" type="text" inputmode="decimal" aria-label="${esc(lab)}" data-group="${grp}" data-i="${i}" data-k="${k}" value="${esc(val)}"></td>`;
    let html = state.odds.map((r, i) => `<tr>
      <td><input id="o_odds_${i}_bk" type="text" placeholder="Bookmaker" aria-label="Bookmaker" data-group="odds" data-i="${i}" data-k="bk" value="${esc(r.bk)}"></td>
      ${cell('odds', i, 'a', r.a, L[0])}${cell('odds', i, 'b', r.b, L[1])}${three ? cell('odds', i, 'c', r.c, L[2]) : ''}
      <td class="num" id="om${i}">—</td><td class="num" id="op${i}">—</td></tr>`).join('');
    const o = state.opening;
    html += `<tr class="opening"><td><b>Apertura</b> <small>(facoltativa)</small></td>
      ${cell('opening', 0, 'a', o.a, L[0])}${cell('opening', 0, 'b', o.b, L[1])}${three ? cell('opening', 0, 'c', o.c, L[2]) : ''}
      <td class="num" id="omO">—</td><td class="num" id="opO">—</td></tr>`;
    $('oddsBody').innerHTML = html;
    $('btnAddRow').hidden = state.odds.length >= MAX_ROWS;
    $('oddsSrc').innerHTML = srcLinks(T.oddsSourcesFor(t));
  }

  function renderStatFields() {
    const t = T.byId(state.type);
    $('statFields').innerHTML = t.fields.map(f => {
      const hint = f.hint ? ` <small>${esc(f.hint)}</small>` : '';
      return `<label>${esc(f.label)}${hint}<input id="s_${f.k}" type="text" inputmode="decimal" data-group="stats" data-k="${f.k}" value="${esc(state.stats[f.k] ?? '')}"></label>`;
    }).join('');
    $('statSrc').innerHTML = srcLinks(T.statSourcesFor(t));
  }

  function renderForm() {
    $('formGrid').innerHTML = ['home', 'away'].map(side => `
      <div class="teamcol">
        <div class="teamhead"><span class="badge ${side}" aria-hidden="true">${esc(initials(teamName(side)))}</span><b id="fn_${side}">${esc(teamName(side))}</b><small>${side === 'home' ? 'casa' : 'trasferta'}</small></div>
        <label>Ultime 5 partite <small>gol fatti-subiti, dalla più recente</small>
          <input id="c_${side}_last5" type="text" data-group="ctx" data-side="${side}" data-k="last5" value="${esc(state.ctx[side].last5)}" placeholder="2-1 (1-0), 0-0, 1-3, 2-0, 1-1">
        </label>
        <div class="formsum" id="fs_${side}"></div>
      </div>`).join('');
    $('m_h2h').value = state.ctx.match.h2h;
  }

  const CTX_ROWS = [
    { k: 'attAbs', l: 'Assenze in attacco', opt: 'attAbs' },
    { k: 'defAbs', l: 'Assenze in difesa', opt: 'defAbs' },
    { k: 'rest', l: 'Giorni di riposo', hint: 'dall\'ultima partita', num: true },
    { k: 'turnover', l: 'Impegno importante entro 4 giorni', opt: 'turnover' },
    { k: 'motiv', l: 'Motivazione', opt: 'motiv' },
    { k: 'pos', l: 'Posizione in classifica', num: true },
    { k: 'notes', l: 'Assenti e notizie', text: true }
  ];
  function ctxControl(side, row) {
    const v = state.ctx[side][row.k] ?? '', id = `c_${side}_${row.k}`, lab = `${row.l}, ${teamName(side)}`;
    if (row.opt) return `<select id="${id}" aria-label="${esc(lab)}" data-group="ctx" data-side="${side}" data-k="${row.k}">${C.OPT[row.opt].map(o => `<option value="${o.v}"${String(v) === o.v ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select>`;
    if (row.num) return `<input id="${id}" type="text" inputmode="numeric" aria-label="${esc(lab)}" data-group="ctx" data-side="${side}" data-k="${row.k}" value="${esc(v)}" placeholder="—">`;
    return `<input id="${id}" type="text" aria-label="${esc(lab)}" data-group="ctx" data-side="${side}" data-k="${row.k}" value="${esc(v)}" placeholder="Nomi, notizie">`;
  }
  function renderContext() {
    const head = `<div class="ch"></div><div class="ch"><span class="badge home" aria-hidden="true">${esc(initials(teamName('home')))}</span>${esc(teamName('home'))}</div><div class="ch"><span class="badge away" aria-hidden="true">${esc(initials(teamName('away')))}</span>${esc(teamName('away'))}</div>`;
    $('ctxGrid').innerHTML = head + CTX_ROWS.map(row => `
      <div class="cl">${esc(row.l)}${row.hint ? ` <small>${esc(row.hint)}</small>` : ''}</div>
      <div class="cv">${ctxControl('home', row)}</div>
      <div class="cv">${ctxControl('away', row)}</div>`).join('');
    const m = state.ctx.match;
    $('matchCtx').innerHTML = [['kind', 'Tipo di partita'], ['weather', 'Meteo']].map(([k, l]) =>
      `<label>${l}<select id="m_${k}" data-group="ctx" data-side="match" data-k="${k}">${C.OPT[k].map(o => `<option value="${o.v}"${m[k] === o.v ? ' selected' : ''}>${esc(o.l)}</option>`).join('')}</select></label>`).join('');
    const notes = {
      goal: 'Assenze, riposo, impegni, motivazione, tipo di partita e meteo correggono i gol attesi del modello statistico. Le quote contengono già le notizie note, quindi non vengono toccate.',
      player_scores: 'Contano i fattori della squadra del giocatore e le assenze nella difesa avversaria.',
      corners: 'Per i corner contano motivazione e tipo di partita. Gli altri dati restano nell\'analisi come informazione.',
      cards: 'Per i cartellini contano tipo di partita e motivazione. La media dell\'arbitro va nelle statistiche.',
      points_total: 'Contano assenze, riposo, impegni e motivazione.',
      generic: 'Per questo tipo di domanda il contesto non entra nel calcolo: tienine conto nella tua stima personale, tra le statistiche.'
    };
    $('ctxNote').textContent = notes[state.type] || notes.goal;
  }

  function fillStatic() {
    $('type').value = state.type;
    $('question').value = state.question;
    $('pasteBox').value = state.paste || '';
    $('quiz_game').value = state.quiz.game; $('quiz_qn').value = state.quiz.qn;
    $('ans_si').value = state.answers.si; $('ans_no').value = state.answers.no;
    ['sport', 'comp', 'home', 'away', 'when'].forEach(k => { $('ev_' + k).value = state.event[k] || ''; });
    $('nH').value = state.sample.nH; $('nA').value = state.sample.nA;
    $('statNotes').value = state.statNotes; $('ctxNotes').value = state.ctxNotes;
    $('w').value = state.w;
  }

  function renderAll() { fillStatic(); renderParams(); renderOdds(); renderStatFields(); renderForm(); renderContext(); update(); }

  // ---------- calcolo ----------
  function compute(s) {
    const t = T.byId(s.type), ways = t.ways || 2, sel = ways === 3 ? t.selIndex(s) : 0, inv = isInv(t, s);
    const rows = s.odds.map(r => {
      const f = E.fairFromOdds(r, ways, sel);
      if (f && ways === 3 && inv) { f.p = 1 - f.p; f.siOdd = null; }
      return { bk: r.bk || 'Bookmaker', f };
    });
    const valid = rows.filter(r => r.f);
    const pM = valid.length ? E.mean(valid.map(r => r.f.p)) : null;
    const open = E.fairFromOdds(s.opening, ways, sel);
    if (open && ways === 3 && inv) open.p = 1 - open.p;
    const siOdds = valid.map(r => r.f.siOdd).filter(x => x);
    const bestSi = siOdds.length ? Math.max(...siOdds) : null;

    const raw = T.runModel(s), neu = T.runModel(s, { neutral: true });
    const flip = x => (x == null ? null : 1 - x);
    const m = Object.assign({}, raw, { lines: raw.lines.slice() });
    let pSn = neu.pS;
    if (inv) {
      m.parts = raw.parts.map(x => Object.assign({}, x, { p: 1 - x.p }));
      m.pS = flip(raw.pS); pSn = flip(neu.pS);
      if (raw.dist) m.dist = raw.dist.map(d => Object.assign({}, d, { si: !d.si }));
      if (raw.pS != null) m.lines.push(`La domanda chiede il caso opposto, quindi la probabilità del Sì è 100% − ${pct(raw.pS)} = ${pct(1 - raw.pS)}.`);
    }

    const w = (Number(s.w) || 0) / 100;
    const { base, p } = E.blend({ pM, pS: m.pS, adj: 0, w });
    const ctxDelta = (m.pS != null && pSn != null) ? (pM != null ? 1 - w : 1) * (m.pS - pSn) : 0;
    const nH = E.num(s.sample.nH), nA = E.num(s.sample.nA);
    const smallSample = [nH, nA].some(n => n != null && n < 8);
    const r = { t, ways, sel, inv, rows, valid, pM, open, bestSi, m, w, base, p, ctxDelta, conf: E.confidenceLabel(p), smallSample, desc: describe(t, s) };
    r.noData = pM == null && m.pS == null;
    r.quality = quality(r, s);
    return r;
  }

  function ctxFilled(s) {
    const c = s.ctx, def = C.blankCtx();
    return ['home', 'away'].some(side => ['attAbs', 'defAbs', 'rest', 'turnover', 'motiv'].some(k => String(c[side][k] || '') !== String(def[side][k])))
      || c.match.kind !== 'normal' || c.match.weather !== 'normal';
  }
  function quality(r, s) {
    const tips = [];
    let sc = 0;
    const nb = r.valid.length;
    if (nb >= 2) sc += 2;
    else if (nb === 1) { sc += 1; tips.push('Aggiungi la quota di un secondo bookmaker.'); }
    else tips.push('Inserisci almeno una quota: è il dato più affidabile.');
    const modelParts = r.m.parts.filter(p => /^(Modello|Frequenza storica|Stima)/.test(p.label)).length;
    if (modelParts >= 2) sc += 2;
    else if (modelParts === 1) { sc += 1; tips.push('Completa le statistiche della stagione.'); }
    else tips.push('Inserisci le statistiche della stagione.');
    const hasForm = C.parseScores(s.ctx.home.last5).length >= 3 || C.parseScores(s.ctx.away.last5).length >= 3;
    if (C.supportsScores(s.type)) { if (hasForm) sc += 0.5; else tips.push('Incolla i risultati delle ultime 5 partite.'); }
    if (ctxFilled(s)) sc += 0.5; else if (s.type !== 'generic') tips.push('Compila il contesto: assenze, riposo, impegni.');
    if (r.smallSample) { sc -= 1; tips.push('Campione piccolo: conviene alzare il peso delle quote.'); }
    if (r.pM != null && r.m.pS != null && Math.abs(r.pM - r.m.pS) >= 0.10) { sc -= 1; tips.push('Quote e statistiche non concordano: cerca il motivo prima di decidere.'); }
    const level = sc >= 4 ? 'Alta' : sc >= 2 ? 'Media' : 'Bassa';
    return { level, cls: sc >= 4 ? 'si' : sc >= 2 ? 'warn' : 'no', tips };
  }

  const pick = p => Math.abs(p - 0.5) < 0.005 ? '50/50' : (p >= 0.5 ? ansLabel('si') : ansLabel('no')).toUpperCase();
  const pts = x => (x > 0 ? '+' : x < 0 ? '−' : '') + Math.abs(x * 100).toFixed(1).replace('.', ',') + ' pt';

  // Indicatore a lancetta: verde per il Sì, rosso per il No, la lancetta indica la stima.
  function gauge(p, noData) {
    const R = 78, cx = 100, cy = 92;
    const pt = (f, r = R) => { const a = Math.PI * (1 - f); return [cx + r * Math.cos(a), cy - r * Math.sin(a)].map(v => v.toFixed(1)); };
    const [x0, y0] = pt(0), [x1, y1] = pt(1), [xp, yp] = pt(p), [nx, ny] = pt(p, R - 18), [mx, my] = pt(0.5, R + 9), [mx2, my2] = pt(0.5, R - 9);
    return `<svg class="gauge" viewBox="0 0 200 104" role="img" aria-label="${noData ? 'Stima non disponibile' : `Probabilità del Sì ${pct(p)}`}">
      <path class="g-no" d="M${x0} ${y0} A${R} ${R} 0 0 1 ${x1} ${y1}"/>
      ${noData ? '' : `<path class="g-si" d="M${x0} ${y0} A${R} ${R} 0 0 1 ${xp} ${yp}"/>`}
      <line class="g-mid" x1="${mx}" y1="${my}" x2="${mx2}" y2="${my2}"/>
      ${noData ? '' : `<line class="g-needle" x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}"/><circle class="g-hub" cx="${cx}" cy="${cy}" r="5"/>`}
    </svg>`;
  }

  function formChips(games, side, isH2H) {
    if (!games.length) return '<span class="muted small">Nessun risultato inserito</span>';
    const s = C.summary(games);
    const dots = games.map(g => { const k = g.f > g.a ? 'w' : g.f === g.a ? 'd' : 'l'; return `<span class="dot ${k}" title="${g.f}-${g.a}">${isH2H ? `${g.f}-${g.a}` : { w: 'V', d: 'N', l: 'P' }[k]}</span>`; }).join('');
    const chips = isH2H
      ? [`${esc(teamName('home'))} ${s.w} · pari ${s.d} · ${esc(teamName('away'))} ${s.l}`, `media gol ${dec(s.gf + s.ga, 1)}`, `Over 2,5 ${s.o25}/${s.n}`, `Goal ${s.btts}/${s.n}`]
      : [`${s.pts} punti`, `fatti ${dec(s.gf, 1)}`, `subiti ${dec(s.ga, 1)}`, `Over 2,5 ${s.o25}/${s.n}`, `Goal ${s.btts}/${s.n}`, `porta inviolata ${s.cs}/${s.n}`];
    if (C.supportsScores(state.type)) {
      const t = T.byId(state.type), inv = isInv(t, state);
      const r = C.countEvent(state.type, state.params, games.map(g => isH2H ? C.asH2H(g) : C.asMatch(g, side)));
      if (r.n) chips.push(`<b>${esc(ansLabel('si'))} della domanda ${inv ? r.n - r.k : r.k}/${r.n}</b>`);
      else if (state.params.period && state.params.period !== 'FT') chips.push('serve il primo tempo tra parentesi');
    }
    return `<div class="dots">${dots}</div><div class="chips">${chips.map(c => `<span>${c}</span>`).join('')}</div>`;
  }

  function update() {
    const r = compute(state), S = ansLabel('si'), N = ansLabel('no');
    r.rows.forEach((row, i) => {
      $('om' + i).textContent = row.f ? pct(row.f.margin) : '—';
      $('op' + i).textContent = row.f ? pct(row.f.p) : '—';
    });
    $('omO').textContent = r.open ? pct(r.open.margin) : '—';
    $('opO').textContent = r.open ? pct(r.open.p) : '—';

    const L = oddsLabels(r.t, state);
    $('oddsHint').innerHTML = r.ways === 3
      ? `Cerca il mercato <b>${esc(r.desc.market)}</b> e inserisci le quote 1, X e 2. Il Sì è: ${esc(r.desc.si)}.`
      : `Cerca il mercato <b>${esc(r.desc.market)}</b>. Nella prima colonna va la quota del Sì (<b>${esc(L[0].replace('Sì · ', ''))}</b>), nella seconda quella del No.`;
    $('meaningBox').innerHTML = `<div class="si"><b>${esc(S.toUpperCase())}</b>${esc(r.desc.si)}</div><div class="no"><b>${esc(N.toUpperCase())}</b>${esc(r.desc.no)}</div>`;

    const os = [];
    if (r.pM == null) os.push('<span class="pill warn">Nessuna quota inserita</span>');
    else {
      os.push(`<span>Probabilità Sì dal mercato: <b>${pct(r.pM)}</b></span>`);
      if (r.open) os.push(`<span>Movimento dall'apertura: <b>${pts(r.pM - r.open.p)}</b></span>`);
      if (Math.abs(r.pM - 0.5) < 0.04) os.push('<span class="pill warn">Il mercato la vede quasi alla pari</span>');
      const bad = r.valid.find(x => x.f.margin < 0 || x.f.margin > 0.2);
      if (bad) os.push(`<span class="pill warn">Margine anomalo per ${esc(bad.bk)}: controlla le quote</span>`);
    }
    $('oddsSummary').innerHTML = os.join('');

    const ss = r.m.parts.filter(x => /^(Modello|Frequenza storica|Stima)/.test(x.label)).map(x => `<span>${esc(x.label)}: <b>${pct(x.p)}</b></span>`);
    if (r.smallSample) ss.push('<span class="pill warn">Campione piccolo: meno di 8 partite</span>');
    $('statSummary').innerHTML = ss.join('') || '<span class="pill neutral">Nessuna statistica inserita</span>';

    ['home', 'away'].forEach(side => { $('fs_' + side).innerHTML = formChips(C.parseScores(state.ctx[side].last5), side, false); });
    $('fs_h2h').innerHTML = formChips(C.parseScores(state.ctx.match.h2h), null, true);
    $('h2hLabel').textContent = `Precedenti diretti`;
    $('h2hHint').textContent = `gol ${teamName('home')}-gol ${teamName('away')}, dal più recente, a prescindere da dove si è giocato`;
    const effects = r.m.effects || [];
    $('ctxEffects').innerHTML = effects.length
      ? `<span class="efftitle">Effetto sul modello</span>${effects.map(e => `<span class="eff ${e.f < 1 ? 'down' : 'up'}">${esc(e.text)} <b>${e.pct}</b></span>`).join('')}`
      : '';

    const si = r.p >= 0.5;
    $('vQ').textContent = state.question || 'Incolla o scrivi la domanda';
    $('vExample').hidden = !state.example;
    $('exampleNote').hidden = !state.example;
    $('vGauge').innerHTML = gauge(r.p, r.noData);
    $('vAns').textContent = r.noData ? '—' : pick(r.p);
    $('vAns').className = 'answer ' + (r.noData ? '' : si ? 'si' : 'no');
    $('vSi').textContent = r.noData ? S : `${S} ${pct(r.p)}`;
    $('vNo').textContent = r.noData ? N : `${N} ${pct(1 - r.p)}`;
    $('vConf').textContent = r.noData ? 'Mancano i dati: inserisci almeno le quote.' : `${r.conf.text} (${pct(r.conf.c)})`;
    $('vBreak').innerHTML =
      `<div><span>Mercato</span><b>${r.pM == null ? '—' : pct(r.pM)}</b></div>` +
      `<div><span>Statistiche e forma</span><b>${r.m.pS == null ? '—' : pct(r.m.pS)}</b></div>` +
      `<div><span>Effetto del contesto</span><b>${Math.abs(r.ctxDelta) < 0.0005 ? '0' : pts(r.ctxDelta)}</b></div>` +
      `<div><span>Stima finale ${esc(S)}</span><b>${r.noData ? '—' : pct(r.p)}</b></div>`;
    $('vQual').innerHTML = `<div class="qhead"><span>Qualità dei dati</span><span class="pill ${r.quality.cls}">${r.quality.level}</span></div>` +
      (r.quality.tips.length ? `<ul>${r.quality.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>Dati completi.</p>');
    $('wLbl').textContent = `${Math.round(r.w * 100)}% quote · ${Math.round((1 - r.w) * 100)}% statistiche`;
    $('chipAns').textContent = r.noData ? '—' : pick(r.p);
    $('chipPct').textContent = r.noData ? '' : pct(Math.max(r.p, 1 - r.p));
    $('chip').className = 'chip ' + (r.noData ? '' : si ? 'si' : 'no');
    renderMatchup(r);
    $('promptText').textContent = buildPrompt(r);
    if (!$('view-recap').hidden) $('recap').innerHTML = recapHTML(r);
    checkQuestionMatch();
    store.set(DRAFT_KEY, state);
    return r;
  }

  function renderMatchup() {
    const h = state.event.home, a = state.event.away;
    if (!h && !a) { $('matchup').innerHTML = ''; return; }
    const quiz = state.quiz.game ? `Gioco ${esc(state.quiz.game)}${state.quiz.qn ? ` · domanda ${esc(state.quiz.qn)} di 15` : ''}` : '';
    $('matchup').innerHTML = `
      <div class="mu-meta">${esc([state.event.comp, state.event.when].filter(Boolean).join(' · '))}${quiz ? `<span class="mu-quiz">${quiz}</span>` : ''}</div>
      <div class="mu-teams"><span class="badge home lg" aria-hidden="true">${esc(initials(teamName('home')))}</span><b>${esc(teamName('home'))}</b><span class="vs">contro</span><b>${esc(teamName('away'))}</b><span class="badge away lg" aria-hidden="true">${esc(initials(teamName('away')))}</span></div>
      <div class="mu-q">${esc(state.question)}</div>`;
  }

  // ---------- riconoscimento ----------
  function describeShort(res) {
    const t = T.byId(res.type), bits = [t.name];
    const per = { '1T': '1° tempo', '2T': '2° tempo' }[res.params.period];
    if (per) bits.push(per);
    if (res.params.line && res.type !== 'generic') bits.push('soglia ' + lf(res.params.line));
    return bits.join(' · ');
  }
  function describeDetection(res) {
    const t = T.byId(res.type);
    const tmp = Object.assign(blankState(res.type), { params: Object.assign({}, t.defaults.params, res.params), event: res.event });
    const d = describe(t, tmp);
    return `<div><b>Riconosciuto:</b> ${esc(describeShort(res))}</div>
      <div>Sì = ${esc(d.si)}</div>
      ${res.event.home ? `<div>Evento: ${esc(res.event.home)}${res.event.away ? ' – ' + esc(res.event.away) : ''}${res.event.comp ? ' (' + esc(res.event.comp) + ')' : ''}</div>` : ''}
      ${res.notes.map(n => `<div class="pill warn">${esc(n)}</div>`).join('')}`;
  }
  function nextQuestionNumber(game) {
    if (!game) return '';
    const nums = diary().filter(e => String(e.game || '') === String(game)).map(e => Number(e.qn) || 0);
    return nums.length ? String(Math.min(15, Math.max(...nums) + 1)) : '';
  }
  function applyParse() {
    const text = $('pasteBox').value.trim();
    if (!text) { toast('Incolla prima il testo della domanda'); $('pasteBox').focus(); return; }
    const res = P.parse(text);
    const t = T.byId(res.type);
    const next = blankState(res.type);
    next.paste = text;
    next.question = res.question;
    next.event = Object.assign(next.event, res.event, { when: state.event.home === res.event.home ? state.event.when : '' });
    next.params = Object.assign({}, t.defaults.params, res.params);
    next.odds = state.odds.map(r => emptyRow(r.bk)).slice(0, Math.max(3, state.odds.length));
    const game = state.quiz.game;
    next.quiz = { game, qn: nextQuestionNumber(game) };
    next.w = state.example ? 60 : state.w;
    state = next;
    renderAll();
    $('qSuggest').hidden = true;
    $('detected').hidden = false;
    $('detected').innerHTML = describeDetection(res);
    toast('Domanda riconosciuta: controlla le caselle');
  }

  // Se il testo della domanda indica un tipo o una soglia diversi da quelli impostati, lo segnala.
  let qTimer;
  function checkQuestionMatch() {
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      const box = $('qSuggest'), q = (state.question || '').trim();
      if (!q) { box.hidden = true; return; }
      const header = state.event.home && state.event.away ? `${state.event.home}\nv/s\n${state.event.away}\n` : '';
      const res = P.parse(header + q);
      const t = T.byId(res.type), want = Object.assign({}, t.defaults.params, res.params);
      const same = res.type === state.type && Object.keys(want).every(k => String(want[k]) === String(state.params[k] ?? ''));
      if (same || res.type === 'generic') { box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = `<span>Il testo sembra un'altra domanda: <b>${esc(describeShort(res))}</b>. Le caselle sono impostate diversamente.</span>
        <button class="btn small" type="button" id="btnApplyQ">Usa questa impostazione</button>`;
      $('btnApplyQ').onclick = () => {
        $('pasteBox').value = header ? `${state.event.comp || ''}\n${header}${q}` : q;
        applyParse();
      };
    }, 400);
  }

  // ---------- analisi ----------
  function title(s) {
    const h = s.event.home, a = s.event.away;
    return h && a ? `${h} – ${a}` : (h || a || s.question || 'Domanda del giorno');
  }

  function verdictSentences(r) {
    const out = [], S = ansLabel('si'), N = ansLabel('no');
    if (r.pM != null && r.m.pS != null) {
      out.push(`Le quote valgono il ${Math.round(r.w * 100)}% e danno il ${S} al ${pct(r.pM)}; statistiche, forma e contesto valgono il ${Math.round((1 - r.w) * 100)}% e lo danno al ${pct(r.m.pS)}. La media pesata è ${pct(r.base)}.`);
      const gap = Math.abs(r.pM - r.m.pS);
      if (gap < 0.05) out.push('Quote e statistiche concordano: la stima è solida.');
      else if (gap < 0.10) out.push(`Quote e statistiche differiscono di ${dec(gap * 100, 1)} punti: un disaccordo normale.`);
      else out.push(`Quote e statistiche differiscono di ${dec(gap * 100, 1)} punti. Di solito il mercato sa qualcosa che i numeri non mostrano: verifica prima di decidere.`);
    } else if (r.pM != null) out.push(`Mancano le statistiche: la stima si basa sulle quote (${pct(r.pM)} per il ${S}).`);
    else if (r.m.pS != null) out.push(`Mancano le quote: la stima si basa solo su statistiche e contesto (${pct(r.m.pS)} per il ${S}). Senza quote l'incertezza è maggiore.`);
    else out.push('Mancano quote e statistiche: inserisci almeno le quote per avere una stima.');
    if (Math.abs(r.ctxDelta) >= 0.0005) out.push(`Il contesto sposta la stima finale di ${pts(r.ctxDelta)}, verso il ${r.ctxDelta > 0 ? S : N}.`);
    if (!r.noData) out.push(`Stima finale: ${S} ${pct(r.p)}, ${N} ${pct(1 - r.p)}.`);
    return out;
  }

  function keyPoints(r) {
    const S = ansLabel('si'), k = [];
    k.push(r.pM != null ? `Il mercato, tolto il margine, dà il ${S} al ${pct(r.pM)}.` : 'Nessuna quota inserita.');
    k.push(r.m.pS != null ? `Statistiche, forma e contesto danno il ${S} al ${pct(r.m.pS)}.` : 'Nessuna statistica inserita.');
    const eff = (r.m.effects || []).slice().sort((a, b) => Math.abs(b.f - 1) - Math.abs(a.f - 1)).slice(0, 3);
    if (eff.length) k.push(`Fattori principali: ${eff.map(e => `${e.text} (${e.pct})`).join('; ')}.`);
    k.push(`Qualità dei dati: ${r.quality.level.toLowerCase()}.${r.quality.tips[0] ? ' ' + r.quality.tips[0] : ''}`);
    return k;
  }

  function formRecap(side) {
    const games = C.parseScores(state.ctx[side].last5);
    if (!games.length) return '';
    const s = C.summary(games);
    return `<p><b>${esc(teamName(side))}</b>, ultime ${s.n}: ${games.map(g => `${g.f}-${g.a}`).join(', ')}. ${pl(s.w, 'vittoria', 'vittorie')}, ${pl(s.d, 'pareggio', 'pareggi')}, ${pl(s.l, 'sconfitta', 'sconfitte')} (${s.pts} punti); segna ${dec(s.gf, 1)} e subisce ${dec(s.ga, 1)} gol a partita.</p>`;
  }

  function recapHTML(r) {
    const s = state, d = r.desc, si = r.p >= 0.5, t = r.t, S = ansLabel('si'), N = ansLabel('no');
    let h = '';
    const quiz = s.quiz.game ? ` · Gioco ${esc(s.quiz.game)}${s.quiz.qn ? `, domanda ${esc(s.quiz.qn)} di 15` : ''}` : '';
    h += `<div class="eyebrow">${esc([s.event.sport, s.event.comp].filter(Boolean).join(' · ') || t.sport)}${quiz}</div>`;
    h += `<h1>${esc(title(s))}</h1>`;
    h += `<div class="meta">${esc(s.event.when || '')}</div>`;
    h += `<div class="hero"><div class="answer ${r.noData ? '' : si ? 'si' : 'no'}">${r.noData ? '—' : esc(pick(r.p))}</div>
      <div><div class="bar"><i style="width:${r.p * 100}%"></i></div>
      <div class="barlbl"><span>${esc(S)} ${r.noData ? '' : pct(r.p)}</span><span>${esc(N)} ${r.noData ? '' : pct(1 - r.p)}</span></div>
      <div style="margin-top:6px;font-size:14px">${r.noData ? 'Mancano i dati per una stima.' : `${esc(r.conf.text)}: la risposta ${esc(pick(r.p))} ha circa il ${pct(r.conf.c)} di probabilità.`}</div></div></div>`;
    h += `<div class="keypoints"><b>In sintesi</b><ul>${keyPoints(r).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`;

    h += `<h3>La domanda</h3>`;
    h += `<p class="qbox">${esc(s.question || 'Testo della domanda non inserito')}</p>`;
    h += `<div class="meaning"><div class="si"><b>${esc(S.toUpperCase())}</b>${esc(d.si)}</div><div class="no"><b>${esc(N.toUpperCase())}</b>${esc(d.no)}</div></div>`;
    h += `<dl class="kv"><dt>Tipo</dt><dd>${esc(t.name)}</dd><dt>Mercato da cercare</dt><dd>${esc(d.market)}</dd></dl>`;
    if (d.rules.length) h += `<ul>${d.rules.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;

    h += `<h3>Le quote</h3>`;
    if (r.valid.length) {
      const L = oddsLabels(t, s);
      h += `<div class="tablewrap"><table><thead><tr><th>Bookmaker</th><th>${esc(L[0])}</th><th>${esc(L[1])}</th>${r.ways === 3 ? `<th>${esc(L[2])}</th>` : ''}<th class="num">Margine</th><th class="num">Prob. ${esc(S)}</th></tr></thead><tbody>`;
      s.odds.forEach((o, i) => {
        const f = r.rows[i].f; if (!f) return;
        h += `<tr><td>${esc(o.bk || 'Bookmaker')}</td><td class="num">${esc(lf(o.a))}</td><td class="num">${esc(lf(o.b))}</td>${r.ways === 3 ? `<td class="num">${esc(lf(o.c))}</td>` : ''}<td class="num">${pct(f.margin)}</td><td class="num">${pct(f.p)}</td></tr>`;
      });
      h += `</tbody></table></div>`;
      h += `<p>Tolto il margine del bookmaker, il mercato dà il ${esc(S)} al <b>${pct(r.pM)}</b>${r.valid.length > 1 ? ` (media di ${r.valid.length} bookmaker)` : ''}.${r.bestSi ? ` La quota più alta sul ${esc(S)} è ${lf(r.bestSi.toFixed(2))}.` : ''}</p>`;
      if (r.open) {
        const dd = r.pM - r.open.p;
        h += `<p>Rispetto all'apertura (${pct(r.open.p)}) la probabilità del ${esc(S)} è ${Math.abs(dd) < 0.02 ? 'quasi ferma' : (dd > 0 ? 'salita' : 'scesa')} di ${dec(Math.abs(dd) * 100, 1)} punti${Math.abs(dd) >= 0.02 ? `: il mercato crede di più nel ${dd > 0 ? esc(S) : esc(N)}` : ''}.</p>`;
      }
      if (Math.abs(r.pM - 0.5) < 0.04) h += `<div class="callout">Per il mercato è quasi un testa o croce: statistiche e contesto diventano decisivi.</div>`;
    } else h += `<p>Nessuna quota inserita. Cerca il mercato "${esc(d.market)}" su OddsChecker o sul sito di un bookmaker.</p>`;
    h += `<p class="muted">Nel quiz la quota non paga: conta solo quale risposta è più probabile.</p>`;

    h += `<h3>Statistiche e forma</h3>`;
    h += r.m.lines.length ? r.m.lines.map(x => `<p>${esc(x)}</p>`).join('') : `<p>Nessuna statistica inserita.</p>`;
    if (r.m.dist) {
      const mx = Math.max(...r.m.dist.map(x => x.p));
      h += `<div class="dist" aria-label="Distribuzione delle probabilità">${r.m.dist.map(x => `<div class="row"><span>${esc(x.label)}</span><div class="track"><div class="fill ${x.si ? 'si' : ''}" style="width:${(x.p / mx) * 100}%"></div></div><span class="num">${pct(x.p)}</span></div>`).join('')}</div>`;
      h += `<p class="muted">In verde gli esiti che danno il ${esc(S)}, in rosso quelli che danno il ${esc(N)}.</p>`;
    }
    h += formRecap('home') + formRecap('away');
    const hh = C.parseScores(s.ctx.match.h2h);
    if (hh.length) { const hs = C.summary(hh); h += `<p><b>Precedenti diretti</b>: ${hh.map(g => `${g.f}-${g.a}`).join(', ')}. ${esc(teamName('home'))} ${pl(hs.w, 'vittoria', 'vittorie')}, ${pl(hs.d, 'pareggio', 'pareggi')}, ${esc(teamName('away'))} ${pl(hs.l, 'vittoria', 'vittorie')}; ${dec(hs.gf + hs.ga, 1)} gol a partita.</p>`; }
    if (r.smallSample) h += `<div class="callout">Campione piccolo (meno di 8 partite per almeno una squadra): le statistiche oscillano molto, conviene dare più peso alle quote.</div>`;
    if (s.statNotes) h += `<p><b>Note:</b> ${esc(s.statNotes)}</p>`;

    let sc = t.scenarios(s, r.m);
    if (r.inv) sc = { si: sc.no, no: sc.si };
    h += `<h3>Come va per il ${esc(S)}, come va per il ${esc(N)}</h3>`;
    h += `<div class="meaning"><div class="si"><b>${esc(S.toUpperCase())} SE</b><ul>${sc.si.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div class="no"><b>${esc(N.toUpperCase())} SE</b><ul>${sc.no.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`;

    h += `<h3>Il contesto</h3>`;
    const eff = r.m.effects || [];
    h += eff.length ? `<ul class="ctxlist">${eff.map(e => `<li><span class="pill ${e.f < 1 ? 'no' : 'si'}">${e.pct}</span><span>${esc(e.text)}</span></li>`).join('')}</ul>` : `<p>Nessun fattore di contesto che cambi il calcolo.</p>`;
    ['home', 'away'].forEach(side => {
      const c = s.ctx[side], bits = [];
      if (c.pos) bits.push(`${c.pos}° in classifica`);
      if (c.rest) bits.push(`${c.rest} giorni di riposo`);
      if (c.notes) bits.push(c.notes);
      if (bits.length) h += `<p><b>${esc(teamName(side))}</b>: ${esc(bits.join('. '))}.</p>`;
    });
    if (s.ctxNotes) h += `<p>${esc(s.ctxNotes)}</p>`;

    h += `<h3>Il verdetto</h3>`;
    h += verdictSentences(r).map(x => `<p>${esc(x)}</p>`).join('');
    if (!r.noData) h += `<p><b>Risposta consigliata: ${esc(pick(r.p))}</b> (${esc(si ? d.si : d.no)}).</p>`;
    if (!r.noData && r.conf.level === 0) h += `<div class="callout">Siamo sotto il 55%: scegli il lato indicato, ma il margine è minimo. Notizie dell'ultima ora (formazioni, meteo) possono ribaltare la scelta.</div>`;

    h += `<h3>Prima di confermare</h3><ul>${(t.checklist || []).concat(T.COMMON_CHECK).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    h += `<h3>Dove controllare</h3><div class="srcs">${srcLinks([...new Set(T.oddsSourcesFor(t).concat(T.statSourcesFor(t)).concat([T.SRC.salva]))])}</div>`;
    h += `<p class="disclaimer">Stima statistica a scopo informativo per un quiz gratuito: nessun risultato è garantito.</p>`;
    return h;
  }

  function recapText(r) {
    const s = state, d = r.desc, S = ansLabel('si'), N = ansLabel('no');
    const L = [];
    L.push(`BOTTINO LAB — ${title(s)}`);
    const meta = [s.event.comp, s.event.when, s.quiz.game ? `Gioco ${s.quiz.game}${s.quiz.qn ? `, domanda ${s.quiz.qn}/15` : ''}` : ''].filter(Boolean);
    if (meta.length) L.push(meta.join(' · '));
    L.push('');
    L.push(`Domanda: ${s.question || '—'}`);
    L.push(`${S} = ${d.si}`);
    L.push(`${N} = ${d.no}`);
    L.push(`Mercato: ${d.market}`);
    L.push('');
    L.push(r.noData ? 'RISPOSTA CONSIGLIATA: mancano i dati' : `RISPOSTA CONSIGLIATA: ${pick(r.p)} (${S} ${pct(r.p)} · ${N} ${pct(1 - r.p)}) — ${r.conf.text}`);
    L.push('');
    L.push('In sintesi');
    keyPoints(r).forEach(x => L.push('- ' + x));
    L.push('');
    L.push('Quote');
    if (r.valid.length) s.odds.forEach((o, i) => { const f = r.rows[i].f; if (f) L.push(`- ${o.bk || 'Bookmaker'}: ${[o.a, o.b, r.ways === 3 ? o.c : null].filter(x => x != null).map(lf).join(' / ')} → ${S} ${pct(f.p)} (margine ${pct(f.margin)})`); });
    else L.push('- nessuna quota inserita');
    L.push('');
    L.push('Statistiche e forma');
    (r.m.lines.length ? r.m.lines : ['nessuna statistica inserita']).forEach(x => L.push('- ' + x));
    L.push('');
    L.push('Contesto');
    const eff = r.m.effects || [];
    if (eff.length) eff.forEach(e => L.push(`- ${e.text} (${e.pct})`)); else L.push('- nessun fattore che cambi il calcolo');
    if (s.ctxNotes) L.push(`- ${s.ctxNotes}`);
    L.push('');
    L.push('Verdetto');
    verdictSentences(r).forEach(x => L.push('- ' + x));
    return L.join('\n');
  }

  function buildPrompt(r) {
    const s = state, d = r.desc, needs = r.t.promptNeeds(s);
    const goalType = C.supportsScores(s.type);
    const extra = goalType ? [
      'Risultati delle ultime 5 partite di ciascuna squadra, dalla più recente, nel formato gol fatti-gol subiti con il primo tempo tra parentesi, per esempio 2-1 (1-0).',
      `Risultati degli ultimi 5 precedenti diretti nel formato gol ${s.event.home || 'casa'}-gol ${s.event.away || 'ospite'}, con il primo tempo tra parentesi.`
    ] : [];
    const all = needs.map(x => x[0].toUpperCase() + x.slice(1) + '.').concat(extra, [
      'Assenze: per ciascuna squadra dimmi se mancano titolari in attacco o in difesa (nessuno, uno, due o più, il miglior marcatore, il portiere) con i nomi.',
      'Giorni di riposo dall\'ultima partita, impegni importanti nei 4 giorni successivi, posizione in classifica e motivazione.',
      'Tipo di partita (normale, derby, big match, decisiva) e meteo previsto.'
    ]);
    return `Domanda di oggi di Salva il Bottino (Sisal): "${s.question || '[domanda]'}"
Evento: ${title(s)}${s.event.comp ? ` (${s.event.comp})` : ''}${s.event.when ? `, ${s.event.when}` : ''}.
Sì = ${d.si}. No = ${d.no}. Mercato equivalente: ${d.market}.

Cerca sul web e riportami, con le fonti:
${all.map((x, i) => `${i + 1}. ${x}`).join('\n')}

Chiudi con i dati pronti da copiare nelle caselle di Bottino Lab: quote, statistiche, ultime partite, precedenti e contesto.`;
  }

  // ---------- storico ----------
  const diary = () => store.get(DIARY_KEY, []);
  const saveDiary = d => { if (!store.set(DIARY_KEY, d)) toast('Spazio del browser esaurito: esporta lo storico e cancella le voci vecchie'); };
  function snapshot() {
    const s = clone(state);
    delete s.paste; delete s.example;
    return s;
  }
  function saveToDiary() {
    const r = compute(state);
    if (r.noData) { toast('Inserisci almeno le quote prima di salvare'); return; }
    const d = diary(), now = new Date();
    const entry = {
      id: String(now.getTime()), ts: now.toISOString(),
      date: now.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      game: state.quiz.game || '', qn: state.quiz.qn || '',
      type: state.type, params: clone(state.params), question: state.question, event: title(state),
      home: state.event.home || '', away: state.event.away || '', comp: state.event.comp || '',
      pickSide: r.p >= 0.5 ? 'si' : 'no', pick: pick(r.p), p: r.p, conf: r.conf.c, pM: r.pM, pS: r.m.pS, quality: r.quality.level,
      result: { ft: '', ht: '', val: '' }, outcome: '', res: '', snap: snapshot()
    };
    // Stessa domanda già salvata (stesso gioco, numero e testo): la aggiorna invece di duplicarla.
    const i = d.findIndex(e => e.question === entry.question && e.event === entry.event && String(e.game || '') === entry.game && String(e.qn || '') === entry.qn);
    if (i >= 0) { entry.id = d[i].id; entry.result = d[i].result || entry.result; d[i] = judge(entry); toast('Risposta aggiornata nello storico'); }
    else { d.push(entry); toast('Salvata nello storico'); }
    saveDiary(d); renderDiary();
  }

  // Valuta l'esito dal risultato inserito: per gol ed esito usa il punteggio, per corner/cartellini/punti il totale, per il resto Sì/No.
  function resultKind(type) {
    if (C.supportsScores(type)) return 'score';
    if (['corners', 'cards', 'points_total'].includes(type)) return 'total';
    return 'yesno';
  }
  function judge(e) {
    // Voci del vecchio diario: esito segnato a mano e nessun risultato inserito. Restano come sono.
    if (!e.result && (e.res === 'ok' || e.res === 'ko')) return e;
    e.outcome = ''; e.res = '';
    const kind = resultKind(e.type), res = e.result || {}, params = e.params || {};
    let positive = null;
    if (kind === 'score') {
      const ft = C.parseScores(res.ft)[0];
      if (ft) {
        const ht = C.parseScores(res.ht)[0];
        const sc = { h: ft.f, a: ft.a, hh: ht && ht.f <= ft.f && ht.a <= ft.a ? ht.f : undefined, ha: ht && ht.f <= ft.f && ht.a <= ft.a ? ht.a : undefined };
        positive = C.evalEvent(e.type, params, sc);
      }
    } else if (kind === 'total') {
      const v = E.num(res.val), line = E.num(params.line);
      if (v != null && line != null) positive = v > line;
    } else if (res.val === 'si' || res.val === 'no') {
      e.outcome = res.val;
    }
    if (positive != null) e.outcome = (params.side === 'neg' ? !positive : positive) ? 'si' : 'no';
    if (e.outcome) e.res = e.outcome === (e.pickSide || (/^S/i.test(e.pick) ? 'si' : 'no')) ? 'ok' : 'ko';
    return e;
  }
  const isDone = e => e.res === 'ok' || e.res === 'ko';

  function resultEditor(e) {
    const kind = resultKind(e.type), r = e.result || {};
    if (kind === 'score') {
      const needHT = (e.params || {}).period && e.params.period !== 'FT';
      return `<label>Risultato finale<input type="text" inputmode="numeric" data-res="${esc(e.id)}" data-k="ft" value="${esc(r.ft)}" placeholder="2-1"></label>
        <label>Primo tempo${needHT ? '' : ' <small>facoltativo</small>'}<input type="text" inputmode="numeric" data-res="${esc(e.id)}" data-k="ht" value="${esc(r.ht)}" placeholder="1-0"></label>`;
    }
    if (kind === 'total') {
      const what = { corners: 'Corner totali', cards: 'Cartellini totali', points_total: 'Punti totali' }[e.type];
      return `<label>${what}<input type="text" inputmode="numeric" data-res="${esc(e.id)}" data-k="val" value="${esc(r.val)}" placeholder="—"></label>`;
    }
    return `<label>Com'è finita la domanda<select data-res="${esc(e.id)}" data-k="val"><option value="">In attesa</option><option value="si"${r.val === 'si' ? ' selected' : ''}>Sì</option><option value="no"${r.val === 'no' ? ' selected' : ''}>No</option></select></label>`;
  }

  function renderDiary() {
    const all = diary().map(judge);
    const filter = $('diaryFilter').value;
    const list = all.slice().reverse().filter(e => filter === 'all' || (filter === 'pending' ? !isDone(e) : e.res === filter));
    $('diaryEmpty').hidden = all.length > 0;
    $('diaryList').innerHTML = list.map(e => {
      const st = e.res === 'ok' ? ['ok', 'Giusta'] : e.res === 'ko' ? ['ko', 'Sbagliata'] : ['wait', 'Da completare'];
      const pickSi = (e.pickSide || (/^S/i.test(e.pick) ? 'si' : 'no')) === 'si';
      const q = encodeURIComponent(`${e.home || e.event} ${e.away || ''} risultato`.trim());
      return `<article class="entry ${st[0]}">
        <div class="e-head">
          <div class="e-meta"><span class="mono">${esc(e.date)}</span>${e.game ? `<span>Gioco ${esc(e.game)}${e.qn ? ` · domanda ${esc(e.qn)}` : ''}</span>` : ''}<span>${esc(T.byId(e.type).name)}</span></div>
          <span class="status ${st[0]}">${st[1]}</span>
        </div>
        <div class="e-title"><b>${esc(e.event)}</b><span>${esc(e.question)}</span></div>
        <div class="e-pick"><span class="pill ${pickSi ? 'si' : 'no'}">Scelta: ${esc(e.pick)}</span><span class="muted small">fiducia ${pct(e.conf)} · dati ${esc((e.quality || '—').toLowerCase())}</span>${e.outcome ? `<span class="muted small">uscito: ${e.outcome === 'si' ? 'Sì' : 'No'}</span>` : ''}</div>
        <div class="e-res">${resultEditor(e)}</div>
        <div class="e-actions">
          <a class="btn ghost small" href="https://www.google.com/search?q=${q}" target="_blank" rel="noopener">Cerca il risultato</a>
          ${e.snap ? `<button class="btn ghost small" type="button" data-open="${esc(e.id)}">Riapri l'analisi</button>` : ''}
          <button class="btn ghost small" type="button" data-del="${esc(e.id)}">Elimina</button>
        </div>
      </article>`;
    }).join('') || (all.length ? '<p class="empty">Nessuna domanda con questo filtro.</p>' : '');

    const done = all.filter(isDone), ok = done.filter(e => e.res === 'ok').length;
    $('dTot').textContent = all.length;
    $('dAcc').textContent = done.length ? `${Math.round(ok / done.length * 100)}%` : '—';
    let streak = 0;
    for (let i = all.length - 1; i >= 0; i--) { if (all[i].res === 'ok') streak++; else if (all[i].res === 'ko') break; }
    $('dStreak').textContent = streak;
    $('dCal').textContent = done.length ? pct(E.mean(done.map(e => e.conf))) : '—';

    // Giochi del quiz: fin dove si è arrivati in ogni gioco.
    const games = {};
    all.filter(e => e.game).forEach(e => { (games[e.game] = games[e.game] || []).push(e); });
    const gk = Object.keys(games).sort((a, b) => Number(b) - Number(a));
    $('gamesBox').innerHTML = gk.length ? `<h3 class="subh">Giochi</h3><div class="games">${gk.map(g => {
      const es = games[g].sort((a, b) => (Number(a.qn) || 0) - (Number(b.qn) || 0));
      const ko = es.find(e => e.res === 'ko'), okN = es.filter(e => e.res === 'ok').length;
      const status = ko ? ['ko', `Perso alla domanda ${ko.qn || '?'}`] : okN >= 15 ? ['ok', 'Bottino salvato'] : ['wait', `In corso · ${okN} di 15 superate`];
      const cells = Array.from({ length: 15 }, (_, i) => {
        const e = es.find(x => Number(x.qn) === i + 1);
        const k = !e ? '' : e.res === 'ok' ? 'ok' : e.res === 'ko' ? 'ko' : 'wait';
        return `<span class="cell ${k}" title="Domanda ${i + 1}${e ? `: ${esc(e.question)}` : ''}">${i + 1}</span>`;
      }).join('');
      return `<div class="game"><div class="g-head"><b>Gioco ${esc(g)}</b><span class="status ${status[0]}">${status[1]}</span></div><div class="cells" aria-label="Domande del gioco ${esc(g)}">${cells}</div></div>`;
    }).join('')}</div>` : '';

    const by = {};
    done.forEach(e => { (by[e.type] = by[e.type] || { n: 0, ok: 0, conf: [] }); by[e.type].n++; if (e.res === 'ok') by[e.type].ok++; by[e.type].conf.push(e.conf); });
    const keys = Object.keys(by);
    $('byType').innerHTML = keys.length ? `<h3 class="subh">Per tipo di domanda</h3>
      <p class="hint">Se la percentuale di risposte giuste è molto sotto la fiducia media stimata, il metodo è troppo ottimista su quel tipo.</p>
      <div class="tablewrap"><table><thead><tr><th>Tipo</th><th class="num">Risposte</th><th class="num">Giuste</th><th class="num">Fiducia media</th></tr></thead><tbody>
      ${keys.map(k => `<tr><td>${esc(T.byId(k).name)}</td><td class="num">${by[k].n}</td><td class="num">${Math.round(by[k].ok / by[k].n * 100)}%</td><td class="num">${pct(E.mean(by[k].conf))}</td></tr>`).join('')}
      </tbody></table></div>` : '';

    let bytes = 0;
    try { bytes = (localStorage.getItem(DIARY_KEY) || '').length * 2; } catch (e) { /* storage non disponibile */ }
    $('storageInfo').textContent = all.length ? `Lo storico occupa circa ${Math.max(1, Math.round(bytes / 1024))} KB dei circa 5 MB disponibili nel browser (spazio per qualche migliaio di domande).` : '';
  }

  // ---------- utilità ----------
  let tt;
  function toast(m) { $('toast').textContent = m; clearTimeout(tt); tt = setTimeout(() => { $('toast').textContent = ''; }, 3000); }
  async function copyText(text, okMsg, fallbackEl) {
    try { await navigator.clipboard.writeText(text); toast(okMsg); }
    catch (e) {
      if (fallbackEl) { const rg = document.createRange(); rg.selectNodeContents(fallbackEl); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rg); }
      toast('Copia non disponibile: testo selezionato, usa Ctrl+C');
    }
  }

  // ---------- viste ----------
  const VIEWS = ['dati', 'recap', 'diario', 'guida'];
  function showView() {
    const v = VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'dati';
    VIEWS.forEach(x => { $('view-' + x).hidden = x !== v; });
    document.querySelectorAll('.tabs a').forEach(a => { if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (v === 'recap') $('recap').innerHTML = recapHTML(compute(state));
    if (v === 'diario') renderDiary();
    window.scrollTo(0, 0);
  }

  // ---------- eventi ----------
  let nameTimer;
  document.addEventListener('input', e => {
    const el = e.target, g = el.dataset.group;
    if (el.dataset.res) { onResult(el); return; }
    if (g === 'params') { state.params[el.dataset.k] = el.value.replace(',', '.'); }
    else if (g === 'stats') state.stats[el.dataset.k] = el.value;
    else if (g === 'odds') state.odds[Number(el.dataset.i)][el.dataset.k] = el.value;
    else if (g === 'opening') state.opening[el.dataset.k] = el.value;
    else if (g === 'ctx') state.ctx[el.dataset.side][el.dataset.k] = el.value;
    else if (el.id === 'question') state.question = el.value;
    else if (el.id === 'pasteBox') { state.paste = el.value; store.set(DRAFT_KEY, state); return; }
    else if (el.id === 'quiz_game' || el.id === 'quiz_qn') state.quiz[el.id.slice(5)] = el.value.trim();
    else if (el.id === 'ans_si' || el.id === 'ans_no') state.answers[el.id.slice(4)] = el.value;
    else if (el.id.startsWith('ev_')) {
      state.event[el.id.slice(3)] = el.value;
      if (el.id === 'ev_home' || el.id === 'ev_away') { clearTimeout(nameTimer); nameTimer = setTimeout(() => { renderForm(); renderContext(); update(); }, 500); }
    }
    else if (el.id === 'nH' || el.id === 'nA') state.sample[el.id] = el.value;
    else if (el.id === 'statNotes' || el.id === 'ctxNotes') state[el.id] = el.value;
    else if (el.id === 'w') state.w = Number(el.value);
    else return;
    update();
  });
  function onResult(el) {
    const d = diary(), it = d.find(x => x.id === el.dataset.res);
    if (!it) return;
    it.result = Object.assign({ ft: '', ht: '', val: '' }, it.result || {}, { [el.dataset.k]: el.value });
    judge(it);
    saveDiary(d);
    // aggiorna solo lo stato della scheda, senza ridisegnare il campo in cui si sta scrivendo
    const card = el.closest('.entry');
    const st = it.res === 'ok' ? ['ok', 'Giusta'] : it.res === 'ko' ? ['ko', 'Sbagliata'] : ['wait', 'Da completare'];
    card.className = `entry ${st[0]}`;
    const badge = card.querySelector('.e-head .status');
    badge.className = `status ${st[0]}`; badge.textContent = st[1];
  }
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.dataset.res) { onResult(el); renderDiary(); return; }
    if (el.id === 'type') {
      const t = T.byId(el.value);
      state.type = t.id;
      state.params = Object.assign({}, t.defaults.params);
      state.stats = Object.assign({}, t.defaults.stats || {});
      if (!state.event.sport || T.list.some(x => x.sport === state.event.sport)) state.event.sport = t.sport;
      renderAll(); return;
    }
    if (el.dataset.group === 'params' && el.tagName === 'SELECT') {
      state.params[el.dataset.k] = el.value;
      if (el.dataset.k === 'side') renderOdds();
      update(); return;
    }
    if (el.dataset.group === 'ctx' && el.tagName === 'SELECT') { state.ctx[el.dataset.side][el.dataset.k] = el.value; update(); return; }
    if (el.id === 'diaryFilter') { renderDiary(); return; }
    if (el.id === 'importFile' && el.files[0]) {
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const data = JSON.parse(fr.result);
          if (!Array.isArray(data)) throw new Error('formato');
          const cur = diary(), ids = new Set(cur.map(x => x.id));
          const merged = cur.concat(data.filter(x => x && x.id && !ids.has(x.id))).sort((a, b) => Number(a.id) - Number(b.id));
          saveDiary(merged); renderDiary(); toast(`Importate ${merged.length - cur.length} risposte`);
        } catch (err) { toast('File non valido: serve un file esportato da Bottino Lab'); }
        el.value = '';
      };
      fr.readAsText(el.files[0]);
    }
  });
  document.addEventListener('click', e => {
    const del = e.target.closest('[data-del]');
    if (del) { saveDiary(diary().filter(x => x.id !== del.dataset.del)); renderDiary(); toast('Domanda eliminata dallo storico'); return; }
    const open = e.target.closest('[data-open]');
    if (open) {
      const it = diary().find(x => x.id === open.dataset.open);
      const s = it && migrate(Object.assign({ v: 4 }, it.snap));
      if (s) { state = s; renderAll(); $('detected').hidden = true; location.hash = '#recap'; toast('Analisi riaperta'); }
    }
  });

  $('btnParse').addEventListener('click', applyParse);
  $('pasteBox').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) applyParse(); });
  // Il testo incollato sostituisce quello già presente: la casella contiene una domanda alla volta.
  $('pasteBox').addEventListener('paste', e => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text || !text.trim()) return;
    e.preventDefault();
    $('pasteBox').value = text.trim();
    applyParse();
  });
  // Un blocco di più righe incollato nella casella della domanda viene riconosciuto come se fosse incollato sopra.
  $('question').addEventListener('paste', e => {
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (text && /\n/.test(text.trim())) {
      e.preventDefault();
      $('pasteBox').value = text;
      applyParse();
    }
  });
  $('btnAddRow').addEventListener('click', () => {
    if (state.odds.length >= MAX_ROWS) return;
    state.odds.push(emptyRow()); renderOdds(); update();
    $(`o_odds_${state.odds.length - 1}_bk`).focus();
  });
  $('btnNew').addEventListener('click', () => {
    const game = state.quiz.game;
    state = blankState(state.type);
    state.quiz = { game, qn: nextQuestionNumber(game) };
    renderAll(); $('detected').hidden = true; $('pasteBox').focus(); toast('Pronto per una nuova domanda');
  });
  $('btnExample').addEventListener('click', () => { state = clone(EXAMPLE); renderAll(); $('detected').hidden = true; toast('Esempio PSG–Lione caricato'); });
  $('btnSave').addEventListener('click', saveToDiary);
  $('btnSave2').addEventListener('click', saveToDiary);
  $('btnCopyRecap').addEventListener('click', () => copyText(recapText(compute(state)), 'Analisi copiata', $('recap')));
  $('btnPrompt').addEventListener('click', () => copyText($('promptText').textContent, 'Prompt copiato', $('promptText')));
  $('btnPrint').addEventListener('click', () => window.print());
  $('btnExport').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(diary(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `bottino-lab-storico-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  window.addEventListener('hashchange', showView);

  if (/(?:^|;\s*)bl_session=1/.test(document.cookie)) $('logout').hidden = false;

  // ---------- aggiornamenti ----------
  // La versione caricata è scritta in index.html al momento della pubblicazione.
  // Ogni 5 minuti, e quando torni sulla scheda, il sito controlla version.json:
  // se è uscita una versione nuova mostra la barra "Aggiorna ora".
  const CURRENT = (document.querySelector('meta[name="app-version"]') || {}).content || 'dev';
  let latest = null;
  $('versionInfo').textContent = CURRENT === 'dev' ? 'Versione di sviluppo (aperta dal computer).' : `Versione ${CURRENT}.`;
  async function checkUpdate() {
    if (CURRENT === 'dev' || location.protocol === 'file:') return;
    try {
      const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json();
      if (j.version && j.version !== CURRENT) { latest = j.version; $('updateBar').hidden = false; }
    } catch (e) { /* offline: riprova al prossimo controllo */ }
  }
  $('btnUpdate').addEventListener('click', () => {
    store.set(DRAFT_KEY, state);
    location.replace(`${location.pathname}?v=${encodeURIComponent(latest || Date.now())}${location.hash}`);
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkUpdate(); });
  setInterval(checkUpdate, 5 * 60 * 1000);
  checkUpdate();

  buildTypeSelect();
  renderAll();
  showView();
})();
