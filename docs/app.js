/* Bottino Lab — interfaccia: incolla e riconosci, moduli, analisi, diario, guida. */
(function () {
  'use strict';
  const E = window.BLEngine, T = window.BLTemplates, P = window.BLParser;
  const { pct, dec, lf } = T.fmt;
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));

  const DRAFT_KEY = 'bl3_draft', DIARY_KEY = 'bl2_diary', MAX_ROWS = 6;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage non disponibile */ } }
  };

  // ---------- stato ----------
  const emptyRow = (bk = '') => ({ bk, a: '', b: '', c: '' });
  function blankState(type) {
    const t = T.byId(type || 'goals_total');
    return {
      v: 3, type: t.id, question: '', paste: '',
      answers: { si: 'Sì', no: 'No' },
      event: { sport: t.sport, comp: '', home: '', away: '', when: '' },
      params: Object.assign({}, t.defaults.params),
      odds: [emptyRow('Sisal'), emptyRow(), emptyRow()],
      opening: emptyRow(),
      stats: Object.assign({}, t.defaults.stats || {}),
      sample: { nH: '', nA: '' },
      ctx: {}, statNotes: '', ctxNotes: '', w: 60
    };
  }

  const EXAMPLE = {
    v: 3, example: true, type: 'goals_total', question: 'Almeno 2 goal segnati nel 1° tempo?',
    paste: 'FRA Ligue 1\nParis Saint-Germain\nv/s\nLione\nAlmeno 2 goal segnati nel 1° tempo?',
    answers: { si: 'Sì', no: 'No' },
    event: { sport: 'Calcio', comp: 'Ligue 1, 8ª giornata', home: 'Paris Saint-Germain', away: 'Lione', when: 'Lun 26/10/2026, 20:30' },
    params: { period: '1T', line: '1.5', side: 'pos' },
    odds: [{ bk: 'Sisal', a: '1,85', b: '1,80', c: '' }, emptyRow(), emptyRow()],
    opening: emptyRow(),
    stats: { hS: '0,43', hC: '0,57', aS: '0,86', aC: '0,43', hPct: '14', aPct: '43' },
    sample: { nH: '7', nA: '7' },
    ctx: { big: -1, tired: -1, early: -1, h2h: 1 },
    statNotes: 'Ligue 1 2026/27, medie di tutta la stagione (le medie casa/trasferta hanno solo 2-5 partite). PSG: 3 gol fatti e 4 subiti nei primi tempi, solo il 21% dei suoi gol prima dell\'intervallo; in casa 0 primi tempi su 2 con 2+ gol. Lione: 46% dei gol nel 1T, ma in trasferta 0 primi tempi su 3 con 2+ gol.',
    ctxNotes: 'Prima contro seconda, entrambe a 14 punti. Partita rinviata da domenica a lunedì su ordine della prefettura. PSG senza João Neves e reduce dalla Champions contro il Barcellona di martedì. Il PSG ha segnato 3+ gol in 5 degli ultimi 6 PSG–Lione di campionato (partita intera).',
    w: 60
  };

  function migrate(s) {
    if (!s || (s.v !== 3 && s.v !== 2)) return null;
    const b = blankState(s.type);
    const out = Object.assign(b, s, { v: 3 });
    out.answers = Object.assign({ si: 'Sì', no: 'No' }, s.answers || {});
    out.params = Object.assign({}, T.byId(out.type).defaults.params, s.params || {});
    out.opening = Object.assign(emptyRow(), s.opening || {});
    return out;
  }
  let state = migrate(store.get(DRAFT_KEY, null)) || clone(EXAMPLE);

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
  const ansLabel = k => (state.answers[k] || (k === 'si' ? 'Sì' : 'No')).trim() || (k === 'si' ? 'Sì' : 'No');

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

  function renderFactors() {
    const t = T.byId(state.type);
    $('factors').innerHTML = T.factorsFor(t).map(([k, title, d]) => `
      <div class="factor"><div><div class="t">${esc(title)}</div><div class="d">${esc(d)}</div></div>
      <div class="seg" role="group" aria-label="${esc(title)}">
        ${[['s', 'Sì', 1], ['n', '—', 0], ['x', 'No', -1]].map(([c, l, v]) =>
          `<button type="button" class="${c}" data-factor="${k}" data-v="${v}" aria-pressed="${(state.ctx[k] || 0) === v}">${l}</button>`).join('')}
      </div></div>`).join('');
  }

  const srcLinks = list => list.map(x => `<a href="${x.u}" target="_blank" rel="noopener"><b>${esc(x.n)}</b><span>${esc(x.w)}</span></a>`).join('');

  function fillStatic() {
    $('type').value = state.type;
    $('question').value = state.question;
    $('pasteBox').value = state.paste || '';
    $('ans_si').value = state.answers.si; $('ans_no').value = state.answers.no;
    ['sport', 'comp', 'home', 'away', 'when'].forEach(k => { $('ev_' + k).value = state.event[k] || ''; });
    $('nH').value = state.sample.nH; $('nA').value = state.sample.nA;
    $('statNotes').value = state.statNotes; $('ctxNotes').value = state.ctxNotes;
    $('w').value = state.w;
  }

  function renderAll() { fillStatic(); renderParams(); renderOdds(); renderStatFields(); renderFactors(); update(); }

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

    const raw = t.model(s);
    const m = Object.assign({}, raw, { lines: raw.lines.slice() });
    if (inv) {
      m.parts = raw.parts.map(x => ({ label: x.label, p: 1 - x.p }));
      m.pS = raw.pS == null ? null : 1 - raw.pS;
      if (raw.dist) m.dist = raw.dist.map(d => Object.assign({}, d, { si: !d.si }));
      if (raw.pS != null) m.lines.push(`La domanda chiede il caso opposto, quindi la probabilità del Sì è 100% − ${pct(raw.pS)} = ${pct(1 - raw.pS)}.`);
    }

    const adj = E.contextAdj(s.ctx);
    const w = (Number(s.w) || 0) / 100;
    const { base, p } = E.blend({ pM, pS: m.pS, adj, w });
    const nH = E.num(s.sample.nH), nA = E.num(s.sample.nA);
    const smallSample = [nH, nA].some(n => n != null && n < 8);
    const r = { t, ways, sel, inv, rows, valid, pM, open, bestSi, m, adj, w, base, p, conf: E.confidenceLabel(p), smallSample, desc: describe(t, s) };
    r.quality = quality(r, s);
    return r;
  }

  function quality(r, s) {
    const tips = [];
    let sc = 0;
    const nb = r.valid.length;
    if (nb >= 2) sc += 2;
    else if (nb === 1) { sc += 1; tips.push('Aggiungi la quota di un secondo bookmaker.'); }
    else tips.push('Inserisci almeno una quota: è il dato più affidabile.');
    const np = r.m.parts.length;
    if (np >= 2) sc += 2;
    else if (np === 1) { sc += 1; tips.push('Completa le statistiche: manca una delle due stime.'); }
    else tips.push('Inserisci le statistiche delle due squadre.');
    const nctx = Object.values(s.ctx).filter(v => Number(v) !== 0).length;
    if (nctx >= 2) sc += 1; else tips.push('Valuta almeno due fattori di contesto.');
    if (r.smallSample) { sc -= 1; tips.push('Campione piccolo: conviene alzare il peso delle quote.'); }
    if (r.pM != null && r.m.pS != null && Math.abs(r.pM - r.m.pS) >= 0.10) { sc -= 1; tips.push('Quote e statistiche non concordano: cerca il motivo prima di decidere.'); }
    const level = sc >= 4 ? 'Alta' : sc >= 2 ? 'Media' : 'Bassa';
    return { level, cls: sc >= 4 ? 'si' : sc >= 2 ? 'warn' : 'no', tips };
  }

  const pick = p => Math.abs(p - 0.5) < 0.005 ? '50/50' : (p >= 0.5 ? ansLabel('si') : ansLabel('no')).toUpperCase();
  const pts = x => (x > 0 ? '+' : '') + (x * 100).toFixed(1).replace('.', ',') + ' pt';

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

    const ss = r.m.parts.map(x => `<span>${esc(x.label)}: <b>${pct(x.p)}</b></span>`);
    if (r.smallSample) ss.push('<span class="pill warn">Campione piccolo: meno di 8 partite</span>');
    $('statSummary').innerHTML = ss.join('') || '<span class="pill neutral">Nessuna statistica inserita</span>';

    const si = r.p >= 0.5, noData = r.pM == null && r.m.pS == null;
    $('vQ').textContent = state.question || 'Incolla o scrivi la domanda';
    $('vExample').hidden = !state.example;
    $('exampleNote').hidden = !state.example;
    $('vAns').textContent = noData ? '—' : pick(r.p);
    $('vAns').className = 'answer ' + (noData ? '' : si ? 'si' : 'no');
    $('vBar').style.width = (r.p * 100) + '%';
    $('vSi').textContent = noData ? S : `${S} ${pct(r.p)}`;
    $('vNo').textContent = noData ? N : `${N} ${pct(1 - r.p)}`;
    $('vConf').textContent = noData ? 'Mancano i dati: inserisci almeno le quote.' : `${r.conf.text} (${pct(r.conf.c)})`;
    $('vBreak').innerHTML =
      `<div><span>Mercato</span><b>${r.pM == null ? '—' : pct(r.pM)}</b></div>` +
      `<div><span>Statistiche</span><b>${r.m.pS == null ? '—' : pct(r.m.pS)}</b></div>` +
      `<div><span>Contesto</span><b>${r.adj === 0 ? '0' : pts(r.adj)}</b></div>` +
      `<div><span>Stima finale ${esc(S)}</span><b>${pct(r.p)}</b></div>`;
    $('vQual').innerHTML = `<div class="qhead"><span>Qualità dei dati</span><span class="pill ${r.quality.cls}">${r.quality.level}</span></div>` +
      (r.quality.tips.length ? `<ul>${r.quality.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p>Dati completi.</p>');
    $('wLbl').textContent = `${Math.round(r.w * 100)}% quote · ${Math.round((1 - r.w) * 100)}% statistiche`;
    $('chipAns').textContent = noData ? '—' : pick(r.p);
    $('chipPct').textContent = noData ? '' : pct(Math.max(r.p, 1 - r.p));
    $('chip').className = 'chip ' + (noData ? '' : si ? 'si' : 'no');
    checkQuestionMatch();
    $('promptText').textContent = buildPrompt(r);
    if (!$('view-recap').hidden) $('recap').innerHTML = recapHTML(r);
    store.set(DRAFT_KEY, state);
    return r;
  }

  // ---------- riconoscimento ----------
  function describeDetection(res) {
    const t = T.byId(res.type);
    const tmp = Object.assign(blankState(res.type), { params: Object.assign({}, t.defaults.params, res.params), event: res.event });
    const d = describe(t, tmp);
    const bits = [t.name];
    const per = { '1T': '1° tempo', '2T': '2° tempo' }[res.params.period];
    if (per) bits.push(per);
    if (res.params.line && res.type !== 'generic') bits.push('soglia ' + lf(res.params.line));
    return `<div><b>Riconosciuto:</b> ${esc(bits.join(' · '))}</div>
      <div>Sì = ${esc(d.si)}</div>
      ${res.event.home ? `<div>Evento: ${esc(res.event.home)}${res.event.away ? ' – ' + esc(res.event.away) : ''}${res.event.comp ? ' (' + esc(res.event.comp) + ')' : ''}</div>` : ''}
      ${res.notes.map(n => `<div class="pill warn">${esc(n)}</div>`).join('')}`;
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
        const keepEvent = Object.assign({}, state.event);
        $('pasteBox').value = header ? `${keepEvent.comp}\n${header}${q}` : q;
        applyParse();
        if (!header) Object.assign(state.event, { home: keepEvent.home, away: keepEvent.away });
      };
    }, 400);
  }
  function describeShort(res) {
    const t = T.byId(res.type), bits = [t.name];
    const per = { '1T': '1° tempo', '2T': '2° tempo' }[res.params.period];
    if (per) bits.push(per);
    if (res.params.line) bits.push('soglia ' + lf(res.params.line));
    return bits.join(' · ');
  }

  // ---------- analisi ----------
  function title(s) {
    const h = s.event.home, a = s.event.away;
    return h && a ? `${h} – ${a}` : (h || a || s.question || 'Domanda del giorno');
  }

  function verdictSentences(r) {
    const out = [], S = ansLabel('si'), N = ansLabel('no');
    if (r.pM != null && r.m.pS != null) {
      out.push(`Le quote valgono il ${Math.round(r.w * 100)}% e danno il ${S} al ${pct(r.pM)}; le statistiche valgono il ${Math.round((1 - r.w) * 100)}% e lo danno al ${pct(r.m.pS)}. La media pesata è ${pct(r.base)}.`);
      const gap = Math.abs(r.pM - r.m.pS);
      if (gap < 0.05) out.push('Quote e statistiche concordano: la stima è solida.');
      else if (gap < 0.10) out.push(`Quote e statistiche differiscono di ${dec(gap * 100, 1)} punti: un disaccordo normale.`);
      else out.push(`Quote e statistiche differiscono di ${dec(gap * 100, 1)} punti. Di solito il mercato sa qualcosa che i numeri stagionali non mostrano (assenze, forma recente): verifica prima di decidere.`);
    } else if (r.pM != null) out.push(`Mancano le statistiche: la stima si basa sulle quote (${pct(r.pM)} per il ${S}).`);
    else if (r.m.pS != null) out.push(`Mancano le quote: la stima si basa solo sulle statistiche (${pct(r.m.pS)} per il ${S}). Senza quote l'incertezza è maggiore.`);
    else out.push('Mancano quote e statistiche: inserisci almeno le quote per avere una stima.');
    if (r.adj !== 0) out.push(`Il contesto sposta la stima di ${pts(r.adj)}, verso il ${r.adj > 0 ? S : N}.`);
    out.push(`Stima finale: ${S} ${pct(r.p)}, ${N} ${pct(1 - r.p)}.`);
    return out;
  }

  function keyPoints(r) {
    const S = ansLabel('si'), N = ansLabel('no'), k = [];
    k.push(r.pM != null ? `Il mercato, tolto il margine, dà il ${S} al ${pct(r.pM)}.` : 'Nessuna quota inserita.');
    k.push(r.m.pS != null ? `Le statistiche danno il ${S} al ${pct(r.m.pS)}.` : 'Nessuna statistica inserita.');
    const fs = T.factorsFor(r.t), ctx = state.ctx;
    const toSi = fs.filter(([x]) => ctx[x] > 0).map(f => f[1].toLowerCase());
    const toNo = fs.filter(([x]) => ctx[x] < 0).map(f => f[1].toLowerCase());
    if (toSi.length || toNo.length) {
      const parts = [];
      if (toNo.length) parts.push(`verso il ${N}: ${toNo.join(', ')}`);
      if (toSi.length) parts.push(`verso il ${S}: ${toSi.join(', ')}`);
      k.push(`Contesto ${parts.join('; ')}.`);
    }
    k.push(`Qualità dei dati: ${r.quality.level.toLowerCase()}.${r.quality.tips[0] ? ' ' + r.quality.tips[0] : ''}`);
    return k;
  }

  function recapHTML(r) {
    const s = state, d = r.desc, si = r.p >= 0.5, t = r.t, S = ansLabel('si'), N = ansLabel('no');
    let h = '';
    h += `<div class="eyebrow">${esc([s.event.sport, s.event.comp].filter(Boolean).join(' · ') || t.sport)}</div>`;
    h += `<h1>${esc(title(s))}</h1>`;
    h += `<div class="meta">${esc(s.event.when || '')}</div>`;
    h += `<div class="hero"><div class="answer ${si ? 'si' : 'no'}">${esc(pick(r.p))}</div>
      <div><div class="bar"><i style="width:${r.p * 100}%"></i></div>
      <div class="barlbl"><span>${esc(S)} ${pct(r.p)}</span><span>${esc(N)} ${pct(1 - r.p)}</span></div>
      <div style="margin-top:6px;font-size:14px">${esc(r.conf.text)}: la risposta ${esc(pick(r.p))} ha circa il ${pct(r.conf.c)} di probabilità.</div></div></div>`;
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

    h += `<h3>Le statistiche</h3>`;
    h += r.m.lines.length ? r.m.lines.map(x => `<p>${esc(x)}</p>`).join('') : `<p>Nessuna statistica inserita.</p>`;
    if (r.m.dist) {
      const mx = Math.max(...r.m.dist.map(x => x.p));
      h += `<div class="dist" aria-label="Distribuzione delle probabilità">${r.m.dist.map(x => `<div class="row"><span>${esc(x.label)}</span><div class="track"><div class="fill ${x.si ? 'si' : ''}" style="width:${(x.p / mx) * 100}%"></div></div><span class="num">${pct(x.p)}</span></div>`).join('')}</div>`;
      h += `<p class="muted">In verde gli esiti che danno il ${esc(S)}, in rosso quelli che danno il ${esc(N)}.</p>`;
    }
    if (r.smallSample) h += `<div class="callout">Campione piccolo (meno di 8 partite per almeno una squadra): le statistiche oscillano molto, conviene dare più peso alle quote.</div>`;
    if (s.statNotes) h += `<p><b>Note:</b> ${esc(s.statNotes)}</p>`;

    let sc = t.scenarios(s, r.m);
    if (r.inv) sc = { si: sc.no, no: sc.si };
    h += `<h3>Come va per il ${esc(S)}, come va per il ${esc(N)}</h3>`;
    h += `<div class="meaning"><div class="si"><b>${esc(S.toUpperCase())} SE</b><ul>${sc.si.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div><div class="no"><b>${esc(N.toUpperCase())} SE</b><ul>${sc.no.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div></div>`;

    h += `<h3>Il contesto</h3>`;
    const active = T.factorsFor(t).filter(([k]) => (s.ctx[k] || 0) !== 0);
    h += active.length ? `<ul class="ctxlist">${active.map(([k, ti]) => {
      const v = s.ctx[k];
      return `<li><span class="pill ${v > 0 ? 'si' : 'no'}">verso ${esc(v > 0 ? S : N)}</span><span>${esc(ti)}</span></li>`;
    }).join('')}</ul>` : `<p>Nessun fattore di contesto segnato.</p>`;
    if (s.ctxNotes) h += `<p>${esc(s.ctxNotes)}</p>`;

    h += `<h3>Il verdetto</h3>`;
    h += verdictSentences(r).map(x => `<p>${esc(x)}</p>`).join('');
    h += `<p><b>Risposta consigliata: ${esc(pick(r.p))}</b> (${esc(si ? d.si : d.no)}).</p>`;
    if (r.conf.level === 0) h += `<div class="callout">Siamo sotto il 55%: scegli il lato indicato, ma il margine è minimo. Notizie dell'ultima ora (formazioni, meteo) possono ribaltare la scelta.</div>`;

    h += `<h3>Prima di confermare</h3><ul>${(t.checklist || []).concat(T.COMMON_CHECK).map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    h += `<h3>Dove controllare</h3><div class="srcs">${srcLinks([...new Set(T.oddsSourcesFor(t).concat(T.statSourcesFor(t)).concat([T.SRC.salva]))])}</div>`;
    h += `<p class="disclaimer">Stima statistica a scopo informativo per un quiz gratuito: nessun risultato è garantito.</p>`;
    return h;
  }

  function recapText(r) {
    const s = state, d = r.desc, t = r.t, S = ansLabel('si'), N = ansLabel('no');
    const L = [];
    L.push(`BOTTINO LAB — ${title(s)}`);
    if (s.event.comp || s.event.when) L.push([s.event.comp, s.event.when].filter(Boolean).join(' · '));
    L.push('');
    L.push(`Domanda: ${s.question || '—'}`);
    L.push(`${S} = ${d.si}`);
    L.push(`${N} = ${d.no}`);
    L.push(`Mercato: ${d.market}`);
    L.push('');
    L.push(`RISPOSTA CONSIGLIATA: ${pick(r.p)} (${S} ${pct(r.p)} · ${N} ${pct(1 - r.p)}) — ${r.conf.text}`);
    L.push('');
    L.push('In sintesi');
    keyPoints(r).forEach(x => L.push('- ' + x));
    L.push('');
    L.push('Quote');
    if (r.valid.length) s.odds.forEach((o, i) => { const f = r.rows[i].f; if (f) L.push(`- ${o.bk || 'Bookmaker'}: ${[o.a, o.b, r.ways === 3 ? o.c : null].filter(x => x != null).map(lf).join(' / ')} → ${S} ${pct(f.p)} (margine ${pct(f.margin)})`); });
    else L.push('- nessuna quota inserita');
    L.push('');
    L.push('Statistiche');
    (r.m.lines.length ? r.m.lines : ['nessuna statistica inserita']).forEach(x => L.push('- ' + x));
    L.push('');
    const active = T.factorsFor(t).filter(([k]) => (s.ctx[k] || 0) !== 0);
    L.push('Contesto');
    if (active.length) active.forEach(([k, ti]) => L.push(`- ${ti}: verso ${s.ctx[k] > 0 ? S : N}`)); else L.push('- nessun fattore segnato');
    if (s.ctxNotes) L.push(`- ${s.ctxNotes}`);
    L.push('');
    L.push('Verdetto');
    verdictSentences(r).forEach(x => L.push('- ' + x));
    return L.join('\n');
  }

  function buildPrompt(r) {
    const s = state, d = r.desc, needs = r.t.promptNeeds(s);
    return `Domanda di oggi di Salva il Bottino (Sisal): "${s.question || '[domanda]'}"
Evento: ${title(s)}${s.event.comp ? ` (${s.event.comp})` : ''}${s.event.when ? `, ${s.event.when}` : ''}.
Sì = ${d.si}. No = ${d.no}. Mercato equivalente: ${d.market}.

Cerca sul web e riportami, con le fonti:
${needs.map((x, i) => `${i + 1}. ${x[0].toUpperCase() + x.slice(1)}.`).join('\n')}
${needs.length + 1}. Formazioni probabili, infortuni e squalifiche.
${needs.length + 2}. Contesto: impegni ravvicinati, classifica e motivazioni, meteo, precedenti diretti.

Chiudi con i numeri pronti da inserire nelle caselle di Bottino Lab e indica per ogni fattore di contesto se spinge verso Sì, No o è neutro.`;
  }

  // ---------- diario ----------
  const diary = () => store.get(DIARY_KEY, []);
  function saveToDiary() {
    const r = compute(state), d = diary(), now = new Date();
    d.push({
      id: String(now.getTime()), ts: now.toISOString(),
      date: now.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      type: state.type, question: state.question, event: title(state),
      pick: pick(r.p), side: r.p >= 0.5 ? 'si' : 'no', p: r.p, conf: r.conf.c, pM: r.pM, pS: r.m.pS, quality: r.quality.level, res: ''
    });
    store.set(DIARY_KEY, d); renderDiary(); toast('Salvata nel diario');
  }
  function renderDiary() {
    const d = diary();
    $('diaryEmpty').hidden = d.length > 0;
    $('diaryBody').innerHTML = d.slice().reverse().map(e => {
      const isSi = e.side ? e.side === 'si' : e.pick === 'SÌ';
      return `<tr>
      <td class="mono">${esc(e.date)}</td>
      <td>${esc(e.event)}<div class="muted small">${esc(e.question)}</div></td>
      <td>${esc(T.byId(e.type).name)}</td>
      <td><span class="pill ${isSi ? 'si' : 'no'}">${esc(e.pick)}</span></td>
      <td class="num">${pct(e.conf)}</td>
      <td><select data-diary="${esc(e.id)}" aria-label="Esito"><option value="">In attesa</option><option value="ok"${e.res === 'ok' ? ' selected' : ''}>Giusta</option><option value="ko"${e.res === 'ko' ? ' selected' : ''}>Sbagliata</option></select></td>
      <td><button class="btn ghost small" data-del="${esc(e.id)}" type="button" aria-label="Elimina">✕</button></td></tr>`;
    }).join('');
    const done = d.filter(e => e.res), ok = done.filter(e => e.res === 'ok').length;
    $('dTot').textContent = d.length;
    $('dAcc').textContent = done.length ? Math.round(ok / done.length * 100) + '%' : '—';
    let streak = 0;
    for (let i = d.length - 1; i >= 0; i--) { if (d[i].res === 'ok') streak++; else if (d[i].res === 'ko') break; }
    $('dStreak').textContent = streak;
    $('dCal').textContent = done.length ? pct(E.mean(done.map(e => e.conf))) : '—';
    const by = {};
    done.forEach(e => { (by[e.type] = by[e.type] || { n: 0, ok: 0, conf: [] }); by[e.type].n++; if (e.res === 'ok') by[e.type].ok++; by[e.type].conf.push(e.conf); });
    const keys = Object.keys(by);
    $('byType').innerHTML = keys.length ? `<h2 class="subh">Per tipo di domanda</h2>
      <p class="hint">Se la percentuale di risposte giuste è molto sotto la fiducia media stimata, il metodo è troppo ottimista su quel tipo.</p>
      <div class="tablewrap"><table><thead><tr><th>Tipo</th><th class="num">Risposte</th><th class="num">Giuste</th><th class="num">Fiducia media</th></tr></thead><tbody>
      ${keys.map(k => `<tr><td>${esc(T.byId(k).name)}</td><td class="num">${by[k].n}</td><td class="num">${Math.round(by[k].ok / by[k].n * 100)}%</td><td class="num">${pct(E.mean(by[k].conf))}</td></tr>`).join('')}
      </tbody></table></div>` : '';
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
  document.addEventListener('input', e => {
    const el = e.target, g = el.dataset.group;
    if (g === 'params') { state.params[el.dataset.k] = el.value.replace(',', '.'); }
    else if (g === 'stats') state.stats[el.dataset.k] = el.value;
    else if (g === 'odds') state.odds[Number(el.dataset.i)][el.dataset.k] = el.value;
    else if (g === 'opening') state.opening[el.dataset.k] = el.value;
    else if (el.id === 'question') state.question = el.value;
    else if (el.id === 'pasteBox') { state.paste = el.value; store.set(DRAFT_KEY, state); return; }
    else if (el.id === 'ans_si' || el.id === 'ans_no') state.answers[el.id.slice(4)] = el.value;
    else if (el.id.startsWith('ev_')) state.event[el.id.slice(3)] = el.value;
    else if (el.id === 'nH' || el.id === 'nA') state.sample[el.id] = el.value;
    else if (el.id === 'statNotes' || el.id === 'ctxNotes') state[el.id] = el.value;
    else if (el.id === 'w') state.w = Number(el.value);
    else return;
    update();
  });
  document.addEventListener('change', e => {
    const el = e.target;
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
    if (el.dataset.diary) {
      const d = diary(), it = d.find(x => x.id === el.dataset.diary);
      if (it) { it.res = el.value; store.set(DIARY_KEY, d); renderDiary(); }
      return;
    }
    if (el.id === 'importFile' && el.files[0]) {
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const data = JSON.parse(fr.result);
          if (!Array.isArray(data)) throw new Error('formato');
          const cur = diary(), ids = new Set(cur.map(x => x.id));
          const merged = cur.concat(data.filter(x => x && x.id && !ids.has(x.id))).sort((a, b) => Number(a.id) - Number(b.id));
          store.set(DIARY_KEY, merged); renderDiary(); toast(`Importate ${merged.length - cur.length} risposte`);
        } catch (err) { toast('File non valido: serve un file esportato da Bottino Lab'); }
        el.value = '';
      };
      fr.readAsText(el.files[0]);
    }
  });
  document.addEventListener('click', e => {
    const f = e.target.closest('[data-factor]');
    if (f) {
      state.ctx[f.dataset.factor] = Number(f.dataset.v);
      f.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b === f)));
      update(); return;
    }
    const del = e.target.closest('[data-del]');
    if (del) { store.set(DIARY_KEY, diary().filter(x => x.id !== del.dataset.del)); renderDiary(); toast('Risposta eliminata dal diario'); }
  });

  $('btnParse').addEventListener('click', applyParse);
  $('pasteBox').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) applyParse(); });
  // Incollando il testo, il riconoscimento parte da solo.
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
    state = blankState(state.type); renderAll(); $('detected').hidden = true; $('pasteBox').focus(); toast('Pronto per una nuova domanda');
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
    a.download = `bottino-lab-diario-${new Date().toISOString().slice(0, 10)}.json`;
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
