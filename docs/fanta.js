/* Bottino Lab — sezione Fanta: rosa, probabili, formazione consigliata, cambi e notizie.
   I dati arrivano da fanta.json, scritto ogni 30 minuti dal workflow "Fanta · notizie e probabili"
   sul ramo fanta-data del repository. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dec = (x, d = 2) => (x == null || !Number.isFinite(x)) ? '—' : Number(x).toFixed(d).replace('.', ',');

  const REPO_DATA = 'https://raw.githubusercontent.com/M4nUsH-Git-Hub/bottino-lab/fanta-data/fanta.json';
  const SEEN_KEY = 'bl_fanta_seen', MODULE_KEY = 'bl_fanta_module';
  const ROLE = { P: 'Portieri', D: 'Difensori', C: 'Centrocampisti', A: 'Attaccanti' };
  const STATO = {
    titolare: ['Titolare', 'si'], panchina: ['Panchina', 'neutral'], dubbio: ['In dubbio', 'warn'],
    indisponibile: ['Indisponibile', 'no'], squalificato: ['Squalificato', 'no'], citato: ['Citato', 'neutral'],
    assente: ['Non nelle probabili', 'no']
  };
  const CAT = {
    infortunio: 'Infortunio', squalifica: 'Squalifica', recupero: 'Recupero', formazione: 'Formazione',
    gol: 'Gol e assist', mercato: 'Mercato', news: 'Notizia'
  };
  const MODULES = ['3-4-3', '3-5-2', '4-3-3', '4-4-2', '4-5-1', '5-3-2', '5-4-1'];

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage non disponibile */ } }
  };

  let data = null, loading = false, lastError = '';
  const prevVisit = Number(store.get(SEEN_KEY, '0')) || 0;
  const filters = { player: '', cat: '', sky: false };

  // ---------- tempo ----------
  function ago(isoStr) {
    if (!isoStr) return '—';
    const t = Date.parse(isoStr);
    if (!Number.isFinite(t)) return '—';
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return 'adesso';
    if (m < 60) return `${m} min fa`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} ${h === 1 ? 'ora' : 'ore'} fa`;
    const g = Math.round(h / 24);
    return `${g} ${g === 1 ? 'giorno' : 'giorni'} fa`;
  }
  const when = isoStr => {
    const t = Date.parse(isoStr);
    return Number.isFinite(t) ? new Date(t).toLocaleString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  };

  // ---------- caricamento ----------
  async function load(force) {
    if (loading) return;
    loading = true; lastError = '';
    render();
    const urls = location.protocol === 'file:' ? ['fanta/sample.json'] : [`${REPO_DATA}?t=${force ? Date.now() : Math.floor(Date.now() / 120000)}`, 'fanta/sample.json'];
    for (const u of urls) {
      try {
        const res = await fetch(u, { cache: force ? 'no-store' : 'default' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        data = await res.json();
        data._sample = u.startsWith('fanta/');
        break;
      } catch (e) { lastError = e.message; }
    }
    loading = false;
    render();
  }

  // ---------- probabilità di giocare e valore atteso ----------
  function playInfo(p) {
    const prob = data.probabili;
    if (!prob) return { prob: 0.7, known: false, info: null };
    const info = prob[p.nome];
    if (!info) return { prob: 0.3, known: true, info: null };
    let pr;
    if (info.pct != null) pr = info.pct / 100;
    else pr = { titolare: 0.85, citato: 0.5, dubbio: 0.4, panchina: 0.2, indisponibile: 0, squalificato: 0, assente: 0.05 }[info.stato] ?? 0.5;
    if ((info.flags || []).includes('in dubbio')) pr *= 0.8;
    if (info.stato === 'indisponibile' || info.stato === 'squalificato') pr = 0;
    if (info.pct == null && (info.flags || []).includes('ballottaggio')) pr = Math.min(pr, 0.5);
    return { prob: pr, known: true, info };
  }
  function baseFm(p) {
    if (p.pv > 0 && p.fm > 0) return p.fm;
    return p.ruolo === 'P' ? 4.5 : 5.5;
  }
  const expected = p => baseFm(p) * playInfo(p).prob;

  function bestXI(rosa, forced) {
    const by = r => rosa.filter(p => p.ruolo === r).slice().sort((a, b) => expected(b) - expected(a));
    const P = by('P'), D = by('D'), C = by('C'), A = by('A');
    const options = (forced ? [forced] : MODULES).map(m => {
      const [d, c, a] = m.split('-').map(Number);
      if (D.length < d || C.length < c || A.length < a || !P.length) return null;
      const xi = [P[0], ...D.slice(0, d), ...C.slice(0, c), ...A.slice(0, a)];
      return { m, xi, total: xi.reduce((s, p) => s + expected(p), 0) };
    }).filter(Boolean).sort((x, y) => y.total - x.total);
    const best = options[0];
    if (!best) return null;
    const inXI = new Set(best.xi.map(p => p.nome));
    const bench = ['P', 'D', 'C', 'A'].flatMap(r => by(r).filter(p => !inXI.has(p.nome)));
    return Object.assign(best, { bench, ranking: options });
  }

  // ---------- pezzi di interfaccia ----------
  function statusBadge(p) {
    const pi = playInfo(p);
    if (!data.probabili) return '<span class="pill neutral">Probabili non disponibili</span>';
    if (!pi.info) return '<span class="pill neutral">Non tra i probabili</span>';
    const [label, cls] = STATO[pi.info.stato] || ['—', 'neutral'];
    const pct = pi.info.pct != null ? ` ${pi.info.pct}%` : '';
    const fl = { ballottaggio: 'Ballottaggio', diffidato: 'Diffidato', 'in dubbio': 'In dubbio' };
    const flags = (pi.info.flags || []).map(f => `<span class="pill warn">${fl[f] || f}${f === 'ballottaggio' && pi.info.partner ? ` con ${esc(pi.info.partner)}` : ''}</span>`).join('');
    return `<span class="pill ${cls}">${label}${pct}</span>${flags}`;
  }
  function probBar(p) {
    const pr = playInfo(p).prob;
    return `<span class="pbar" title="Probabilità di giocare stimata ${Math.round(pr * 100)}%"><i style="width:${Math.round(pr * 100)}%"></i></span>`;
  }
  function matchShort(p) {
    const m = (playInfo(p).info || {}).match;
    if (!m) return '';
    const opp = m.casa ? m.away : m.home;
    const ko = (m.kickoff || '').replace(/^(\w{3})\w*\s+(\d+)\s+\w+,?\s*/, '$1 $2, ');
    return `${m.casa ? 'contro' : 'a casa del'} ${opp}${ko ? ` · ${ko}` : ''}`;
  }
  function chip(p, extra) {
    const opp = matchShort(p);
    return `<div class="pchip r-${p.ruolo}" title="${esc(opp)}"><span class="role">${p.ruolo}</span><div class="pc-main"><b>${esc(p.nome)}</b><span>${esc(p.squadra)}</span></div>${extra || ''}</div>`;
  }

  function renderHead() {
    const s = (data && data.sources) || {};
    const src = (key, label) => {
      const x = s[key];
      if (!x) return `<span class="srcst"><i class="led off"></i>${label}: non ancora letto</span>`;
      const detail = key === 'probabili' ? (x.ok ? `${x.found} giocatori trovati` : esc(x.error || 'errore')) : (x.ok ? `${x.feeds} ricerche` : esc(x.error || 'errore'));
      return `<span class="srcst" title="${esc(x.error || '')}"><i class="led ${x.ok ? 'on' : 'err'}"></i>${label}: ${detail} · ${ago(x.when)}</span>`;
    };
    $('fHead').innerHTML = `
      <div>
        <div class="eyebrow">Fantacalcio · Serie A</div>
        <h1 class="fteam">Alma Football Club</h1>
        <div class="muted small">${data ? `Dati aggiornati ${ago(data.updated)}${data._sample ? ' · copia di prova locale' : ''}` : loading ? 'Caricamento…' : `Dati non disponibili${lastError ? ` (${esc(lastError)})` : ''}`}</div>
      </div>
      <div class="fh-side">
        <div class="srcs-st">${src('news', 'Notizie')}${src('probabili', 'Probabili Fantacalcio.it')}</div>
        <button class="btn ghost small" type="button" id="fReload">${loading ? 'Carico…' : 'Ricarica i dati'}</button>
      </div>`;
  }

  function renderXI() {
    const saved = store.get(MODULE_KEY, 'auto');
    const res = bestXI(data.rosa, saved === 'auto' ? null : saved);
    if (!res) { $('fXI').innerHTML = '<p class="empty">Rosa incompleta.</p>'; return; }
    const rows = ['A', 'C', 'D', 'P'].map(r => `<div class="prow">${res.xi.filter(p => p.ruolo === r).map(p => chip(p, probBar(p))).join('')}</div>`).join('');
    const opts = ['auto'].concat(MODULES).map(m => `<option value="${m}"${m === saved ? ' selected' : ''}>${m === 'auto' ? `Automatico (${res.m})` : m}</option>`).join('');
    const noProb = !data.probabili;
    $('fXI').innerHTML = `
      <div class="panel-head"><h2>Formazione consigliata</h2>
        <label class="filter">Modulo <select id="fModule">${opts}</select></label></div>
      <p class="hint">Sceglie, ruolo per ruolo, chi ha il valore atteso più alto: fantamedia × probabilità di giocare${noProb ? ' (le probabili non sono ancora disponibili: per ora pesa solo la fantamedia)' : ' presa dalle probabili di Fantacalcio.it'}. Controlla sempre le formazioni ufficiali.</p>
      <div class="pitch" aria-label="Formazione ${res.m}">${rows}</div>
      <div class="xi-total"><span>Modulo <b>${res.m}</b></span><span>Valore atteso <b>${dec(res.total, 1)}</b></span>${res.ranking && res.ranking.length > 1 ? `<span class="muted small">Secondo modulo: ${res.ranking[1].m} (${dec(res.ranking[1].total, 1)})</span>` : ''}</div>
      <h3 class="subh">Panchina, in ordine</h3>
      <div class="bench">${res.bench.map(p => chip(p, `<span class="ev">${dec(expected(p), 1)}</span>`)).join('')}</div>`;
  }

  function renderRosa() {
    const rows = ['P', 'D', 'C', 'A'].map(r => {
      const ps = data.rosa.filter(p => p.ruolo === r);
      return `<tr class="rg"><th colspan="9">${ROLE[r]}</th></tr>` + ps.map(p => {
        const note = (playInfo(p).info || {}).note;
        return `<tr>
        <td><span class="role r-${p.ruolo}">${p.ruolo}</span> <b>${esc(p.nome)}</b></td>
        <td>${esc(p.squadra)}</td>
        <td class="stcell">${statusBadge(p)}${note ? `<span class="pnote">${esc(note)}</span>` : ''}</td>
        <td class="small">${esc(matchShort(p))}</td>
        <td class="num">${p.fm ? dec(p.fm) : '—'}</td>
        <td class="num">${p.mv ? dec(p.mv) : '—'}</td>
        <td class="num">${p.pv ?? '—'}</td>
        <td class="num">${p.qt ?? '—'}</td>
        <td class="num">${p.costo ?? '—'}</td></tr>`;
      }).join('');
    }).join('');
    $('fRosa').innerHTML = `
      <div class="panel-head"><h2>La rosa</h2><span class="muted small">${data.probabili_updated ? `Probabili lette ${ago(data.probabili_updated)}` : ''}</span></div>
      <div class="tablewrap"><table class="rosa">
        <thead><tr><th>Giocatore</th><th>Squadra</th><th>Nelle probabili</th><th>Prossima partita</th><th class="num">FM</th><th class="num">MV</th><th class="num">PV</th><th class="num">Quot.</th><th class="num">Costo</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      <p class="muted small">FM fantamedia, MV media voto, PV partite a voto, dall'export della rosa. Per cambiare la rosa basta sostituire data/fanta/rosa.csv nel repository (o chiederlo a Claude).</p>`;
  }

  function renderChanges() {
    const ch = (data.changes || []).slice(0, 20);
    const lab = x => { if (!x) return 'non tra i probabili'; const s = (STATO[x.stato] || [x.stato])[0]; return `${s}${x.pct != null ? ` ${x.pct}%` : ''}${(x.flags || []).length ? ` (${x.flags.join(', ')})` : ''}`; };
    $('fChanges').innerHTML = `<h2>Cambi nelle probabili</h2>
      <p class="hint">Quando cambia lo stato di un tuo giocatore o la sua percentuale si muove di almeno 15 punti.</p>
      ${ch.length ? `<ol class="timeline">${ch.map(c => `<li class="${Date.parse(c.ts) > prevVisit ? 'new' : ''}"><span class="muted small">${esc(when(c.ts))}</span><div><b>${esc(c.nome)}</b> <span class="muted">(${esc(c.squadra)})</span></div><div>${esc(lab(c.da))} → <b>${esc(lab(c.a))}</b></div></li>`).join('')}</ol>` : '<p class="empty">Nessun cambio registrato finora.</p>'}`;
  }

  function renderNews() {
    const all = data.news || [];
    const players = data.rosa.map(p => p.nome);
    const cats = [...new Set(all.map(n => n.category))];
    const list = all.filter(n => (!filters.player || (n.players || []).includes(filters.player))
      && (!filters.cat || n.category === filters.cat) && (!filters.sky || n.sky));
    const newCount = all.filter(n => Date.parse(n.first_seen) > prevVisit).length;
    $('fNews').innerHTML = `
      <div class="panel-head"><h2>Notizie${newCount && prevVisit ? ` <span class="pill si">${newCount} nuove</span>` : ''}</h2></div>
      <p class="hint">Ultimi 7 giorni, solo da Sky Sport, Fantacalcio.it, Gazzetta, Corriere dello Sport, Tuttosport, ANSA, Rai Sport, DAZN e SOS Fanta.</p>
      <div class="nfilters">
        <label class="filter">Giocatore <select id="fPlayer"><option value="">Tutti</option>${players.map(n => `<option${n === filters.player ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>
        <div class="catchips" role="group" aria-label="Categoria">
          <button type="button" class="cchip" data-cat="" aria-pressed="${!filters.cat}">Tutte</button>
          ${cats.map(c => `<button type="button" class="cchip c-${c}" data-cat="${c}" aria-pressed="${filters.cat === c}">${CAT[c] || c}</button>`).join('')}
        </div>
        <label class="skytoggle"><input type="checkbox" id="fSky"${filters.sky ? ' checked' : ''}> Solo Sky Sport</label>
      </div>
      <div class="newslist">${list.length ? list.slice(0, 80).map(n => `
        <article class="nitem ${n.sky ? 'sky' : ''} ${Date.parse(n.first_seen) > prevVisit && prevVisit ? 'new' : ''}">
          <div class="n-meta"><span class="ncat c-${n.category}">${CAT[n.category] || 'Notizia'}</span><b>${esc(n.source)}</b><span>${esc(ago(n.ts || n.first_seen))}</span>${Date.parse(n.first_seen) > prevVisit && prevVisit ? '<span class="pill si">Nuova</span>' : ''}</div>
          <a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
          ${(n.players || []).length ? `<div class="n-players">${n.players.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
        </article>`).join('') : `<p class="empty">${all.length ? 'Nessuna notizia con questi filtri.' : 'Ancora nessuna notizia: arriveranno al prossimo giro di raccolta.'}</p>`}</div>`;
  }

  function render() {
    if ($('view-fanta').hidden) return;
    renderHead();
    const ready = !!(data && data.rosa);
    $('fBody').hidden = !ready;
    if (!ready) return;
    renderXI(); renderRosa(); renderChanges(); renderNews();
  }

  // ---------- eventi ----------
  document.addEventListener('click', e => {
    if (e.target.closest('#fReload')) { load(true); return; }
    const c = e.target.closest('[data-cat]');
    if (c && c.closest('#fNews')) { filters.cat = c.dataset.cat; renderNews(); }
  });
  document.addEventListener('change', e => {
    if (e.target.id === 'fModule') { store.set(MODULE_KEY, e.target.value); renderXI(); }
    else if (e.target.id === 'fPlayer') { filters.player = e.target.value; renderNews(); }
    else if (e.target.id === 'fSky') { filters.sky = e.target.checked; renderNews(); }
  });
  // Segna come lette le notizie quando si lascia la sezione.
  window.addEventListener('hashchange', () => { if (location.hash !== '#fanta' && data) store.set(SEEN_KEY, String(Date.now())); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && location.hash === '#fanta' && data) store.set(SEEN_KEY, String(Date.now())); });

  window.BLFanta = {
    show() {
      if (!data) load(false); else render();
      if (data && Date.now() - Date.parse(data.updated) > 10 * 60000) load(false);
    },
    _bestXI: bestXI, _expected: expected
  };
})();
