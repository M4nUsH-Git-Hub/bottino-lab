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
  const COMP = { CL: 'Champions League', SA: 'Serie A', PL: 'Premier League', PD: 'Liga', BL1: 'Bundesliga', FL1: 'Ligue 1', DED: 'Eredivisie', PPL: 'Primeira Liga' };
  // Prossime partite della squadra con la competizione, dai dati partite (football-data.org).
  function nextFixtures(p) {
    const M = window.BLMatch;
    const t = M && M.data ? M.findTeam(p.squadra) : null;
    if (!t || !(t.next || []).length) return [];
    return t.next.filter(n => Date.parse(n[0]) > Date.now() - 2 * 3600e3).slice(0, 2).map(n => ({
      comp: n[1], compName: COMP[n[1]] || n[1], casa: n[2] === 1, opp: n[3],
      when: new Date(n[0]).toLocaleString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    }));
  }
  function fixturesCell(p) {
    const nx = nextFixtures(p);
    if (!nx.length) return esc(matchShort(p));
    return nx.map(n => `<div class="nfx"><span class="comp c-${n.comp}">${esc(n.compName)}</span> ${n.casa ? 'contro' : 'a casa del'} ${esc(n.opp)} <span class="muted">· ${esc(n.when)}</span></div>`).join('');
  }
  function compOfNews(title) {
    const t = title.toLowerCase();
    if (/champions/.test(t)) return 'Champions League';
    if (/europa league/.test(t)) return 'Europa League';
    if (/conference/.test(t)) return 'Conference League';
    if (/coppa italia/.test(t)) return 'Coppa Italia';
    if (/nazional/.test(t)) return 'Nazionale';
    return '';
  }

  async function load(force) {
    if (window.BLMatch) window.BLMatch.load(force).then(() => { if (data) render(); });
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
    const pct = pi.info.pct != null && ['titolare', 'panchina'].includes(pi.info.stato) ? ` ${pi.info.pct}%` : '';
    const fl = { ballottaggio: 'Ballottaggio', diffidato: 'Diffidato', 'in dubbio': 'In dubbio' };
    const flags = (pi.info.flags || []).map(f => `<span class="pill warn">${fl[f] || f}${f === 'ballottaggio' && pi.info.partner ? ` con ${esc(pi.info.partner)}` : ''}</span>`).join('');
    return `<span class="pill ${cls}">${label}${pct}</span>${flags}`;
  }
  function probBar(p) {
    const pr = playInfo(p).prob;
    return `<span class="pbar" title="Probabilità di giocare stimata ${Math.round(pr * 100)}%"><i style="width:${Math.round(pr * 100)}%"></i></span>`;
  }
  // "Mercoledì 28 Ottobre, 20:45" → data (anno corrente, o il precedente se cade troppo avanti)
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  function kickoffDate(s) {
    const m = String(s || '').toLowerCase().match(/(\d{1,2})\s+([a-zà-ù]+),?\s+(\d{1,2})[:.](\d{2})/);
    if (!m || MESI.indexOf(m[2]) < 0) return null;
    const now = new Date();
    let d = new Date(now.getFullYear(), MESI.indexOf(m[2]), +m[1], +m[3], +m[4]);
    if (d - now > 200 * 864e5) d = new Date(now.getFullYear() - 1, MESI.indexOf(m[2]), +m[1], +m[3], +m[4]);
    return d;
  }
  function matchShort(p) {
    const m = (playInfo(p).info || {}).match;
    if (!m) return '';
    const opp = m.casa ? m.away : m.home;
    const ko = (m.kickoff || '').replace(/^(\S{3})\S*\s+(\d+)\s+\S+,?\s*/, '$1 $2, ');
    const d = kickoffDate(m.kickoff);
    const played = d && Date.now() - d.getTime() > 2 * 3600e3;
    return `${m.casa ? 'contro' : 'a casa del'} ${opp}${ko ? ` · ${ko}` : ''}${played ? ' · giocata' : ''}`;
  }
  function chip(p, extra) {
    const opp = matchShort(p);
    return `<div class="pchip r-${p.ruolo}" title="${esc(opp)}"><span class="role">${p.ruolo}</span><div class="pc-main"><b>${esc(p.nome)}</b><span>${esc(p.squadra)}</span></div>${extra || ''}</div>`;
  }

  function renderHead() {
    const s = Object.assign({}, (data && data.sources) || {}, data && data.nazionali ? { nazionali: Object.assign({ when: data.nazionali.updated }, data.nazionali) } : {});
    const src = (key, label) => {
      const x = s[key];
      if (!x) return `<span class="srcst"><i class="led off"></i>${label}: non ancora letto</span>`;
      const detail = key === 'nazionali' ? (x.ok ? `${x.found} giocatori riconosciuti` : esc((x.errors || [])[0] || 'errore')) : key === 'probabili' ? (x.ok ? `${x.found} giocatori trovati` : esc(x.error || 'errore')) : (x.ok ? `${x.feeds} ricerche` : esc(x.error || 'errore'));
      return `<span class="srcst" title="${esc(x.error || '')}"><i class="led ${x.ok ? 'on' : 'err'}"></i>${label}: ${detail} · ${ago(x.when)}</span>`;
    };
    $('fHead').innerHTML = `
      <div>
        <div class="eyebrow">Fantacalcio · Serie A</div>
        <h1 class="fteam">Alma Football Club</h1>
        <div class="muted small">${data ? `Dati aggiornati ${ago(data.updated)}${data._sample ? ' · copia di prova locale' : ''}` : loading ? 'Caricamento…' : `Dati non disponibili${lastError ? ` (${esc(lastError)})` : ''}`}</div>
      </div>
      <div class="fh-side">
        <div class="srcs-st">${src('news', 'Notizie')}${src('probabili', 'Probabili Fantacalcio.it')}${data && data.nazionali ? src('nazionali', 'Nazionali') : ''}</div>
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

  function nazBadge(p) {
    const x = data.nazionali && data.nazionali.players && data.nazionali.players[p.nome];
    if (!x || !(x.fixtures || []).length || !['convocato', 'lasciato'].includes(x.status)) return '';
    return ` <span class="pill ${x.status === 'convocato' ? 'si' : 'warn'}" title="${esc(x.note || '')}">${x.status === 'convocato' ? 'In nazionale' : 'Lasciato la nazionale'}</span>`;
  }
  function renderRosa() {
    const rows = ['P', 'D', 'C', 'A'].map(r => {
      const ps = data.rosa.filter(p => p.ruolo === r);
      return `<tr class="rg"><th colspan="9">${ROLE[r]}</th></tr>` + ps.map(p => {
        const note = (playInfo(p).info || {}).note;
        return `<tr>
        <td><span class="role r-${p.ruolo}">${p.ruolo}</span> <b>${esc(p.nome)}</b></td>
        <td>${esc(p.squadra)}</td>
        <td class="stcell">${statusBadge(p)}${nazBadge(p)}${note ? `<span class="pnote">${esc(note)}</span>` : ''}</td>
        <td class="small fxcell">${fixturesCell(p)}</td>
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
        <thead><tr><th>Giocatore</th><th>Squadra</th><th>Nelle probabili</th><th>Prossime partite</th><th class="num">FM</th><th class="num">MV</th><th class="num">PV</th><th class="num">Quot.</th><th class="num">Costo</th></tr></thead>
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
          <div class="n-meta"><span class="ncat c-${n.category}">${CAT[n.category] || 'Notizia'}</span>${compOfNews(n.title) ? `<span class="comp">${compOfNews(n.title)}</span>` : ''}<b>${esc(n.source)}</b><span>${esc(ago(n.ts || n.first_seen))}</span>${Date.parse(n.first_seen) > prevVisit && prevVisit ? '<span class="pill si">Nuova</span>' : ''}</div>
          <a href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.title)}</a>
          ${(n.players || []).length ? `<div class="n-players">${n.players.map(x => `<span>${esc(x)}</span>`).join('')}</div>` : ''}
        </article>`).join('') : `<p class="empty">${all.length ? 'Nessuna notizia con questi filtri.' : 'Ancora nessuna notizia: arriveranno al prossimo giro di raccolta.'}</p>`}</div>`;
  }

  // ---------- nazionali ----------
  const NZ = {
    lasciato: ['Ha lasciato il ritiro', 'warn', 0], convocato: ['Convocato', 'si', 1], in_attesa: ['Lista non ancora uscita', 'neutral', 2],
    non_convocato: ['Non convocato', 'no', 3], nessuna_sosta: ['Nessuna partita in vista', 'neutral', 4],
    fuori: ['Fuori dal giro', 'neutral', 5], sconosciuto: ['Da verificare', 'neutral', 6]
  };
  const dday = iso => new Date(iso + 'T12:00:00');
  const dshort = iso => dday(iso).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });
  const wikiUrl = t => `https://en.wikipedia.org/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}`;
  // Prima partita di Serie A del club dopo il rientro dalla nazionale.
  function nextSerieA(p, after) {
    const M = window.BLMatch;
    const t = M && M.data ? M.findTeam(p.squadra) : null;
    if (!t) return null;
    const n = (t.next || []).find(x => x[1] === 'SA' && Date.parse(x[0]) > dday(after).getTime());
    return n ? { when: new Date(n[0]), casa: n[2] === 1, opp: n[3] } : null;
  }
  function nazCard(p, x) {
    const st = NZ[x.status] || NZ.sconosciuto;
    const fx = (x.fixtures || []).map(f => {
      const res = f.score ? `<b>${esc(f.score)}</b>` : `<span class="muted">${esc(f.time || '')}</span>`;
      return `<li><span class="nz-d">${esc(dshort(f.date))}</span><span>${esc(f.home)} – ${esc(f.away)} ${res}</span><span class="comp">${esc(f.comp)}</span>${f.scored ? `<span class="pill si">${f.scored > 1 ? f.scored + ' gol' : 'gol'}</span>` : ''}</li>`;
    }).join('');
    const sa = x.return && ['convocato', 'lasciato'].includes(x.status) ? nextSerieA(p, x.return) : null;
    const gap = sa ? Math.round((sa.when - dday(x.return)) / 864e5) : null;
    const facts = [];
    if (x.status === 'convocato' && x.return) facts.push(`${x.done ? 'Sosta finita' : 'Impegnato fino al'} ${esc(dshort(x.return))}${sa ? ` · poi ${sa.casa ? 'contro' : 'a casa del'} ${esc(sa.opp)} ${esc(sa.when.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' }))}${gap != null && gap <= 4 ? ` <b>(solo ${gap} giorni dopo)</b>` : ''}` : ''}`);
    if (x.status === 'convocato' && x.long_trip) facts.push('<span class="nz-warn">Viaggio intercontinentale: rientro tardivo e stanchezza, occhio alla prima giornata dopo la sosta</span>');
    if (x.played != null) facts.push(x.played ? `Ha giocato ${x.played} ${x.played === 1 ? 'partita' : 'partite'} nella sosta` : 'Finora non ha giocato nella sosta');
    if (x.caps != null) facts.push(`${x.caps} presenze${x.goals_tot != null ? `, ${x.goals_tot} gol` : ''} in nazionale`);
    const news = (x.news || []).slice(0, 3).map(n => `<a href="${esc(n.link)}" target="_blank" rel="noopener"><b>${esc(n.source)}</b> ${esc(n.title)} <span class="muted">· ${esc(ago(n.ts))}</span></a>`).join('');
    return `<article class="nzcard nz-${x.status}">
      <div class="nz-top"><span class="role r-${p.ruolo}">${p.ruolo}</span><div class="nz-who"><b>${esc(p.nome)}</b><span>${esc(p.squadra)}${x.nat ? ` · ${esc(x.nat)}` : ''}</span></div><span class="pill ${st[1]}">${st[0]}</span></div>
      ${x.note ? `<div class="nz-note">${esc(x.note)}</div>` : ''}
      ${fx ? `<ul class="nz-fx">${fx}</ul>` : ''}
      ${facts.length ? `<div class="nz-facts">${facts.map(f => `<span>${f}</span>`).join('')}</div>` : ''}
      ${news ? `<div class="nz-news">${news}</div>` : ''}
      ${x.team && x.team.page ? `<a class="nz-src muted small" href="${esc(wikiUrl(x.team.page))}" target="_blank" rel="noopener">Lista e calendario della nazionale ↗</a>` : ''}
    </article>`;
  }
  function renderNaz() {
    const N = data.nazionali, box = $('fNaz');
    if (!N || !N.players) { box.hidden = true; return; }
    box.hidden = false;
    const rows = data.rosa.map(p => [p, N.players[p.nome] || { status: 'sconosciuto' }]);
    const active = rows.filter(([, x]) => (x.fixtures || []).length);
    const dates = active.flatMap(([, x]) => x.fixtures.map(f => f.date)).sort();
    const count = k => rows.filter(([, x]) => x.status === k).length;
    const main = rows.filter(([, x]) => (NZ[x.status] || NZ.sconosciuto)[2] <= 3).sort((a, b) => (NZ[a[1].status][2] - NZ[b[1].status][2]) || a[0].nome.localeCompare(b[0].nome));
    const rest = rows.filter(([, x]) => (NZ[x.status] || NZ.sconosciuto)[2] > 3);
    const ch = (N.changes || []).filter(c => Date.now() - Date.parse(c.ts) < 10 * 864e5).slice(0, 20);
    const chLi = c => `<li class="${Date.parse(c.ts) > prevVisit ? 'new' : ''}"><span class="muted small">${esc(when(c.ts))}</span><div><b>${esc(c.nome)}</b>${c.nat ? ` <span class="muted">(${esc(c.nat)})</span>` : ''}: ${esc(c.da)} → <b>${esc(c.a)}</b></div>${c.note ? `<div class="muted small">${esc(c.note)}</div>` : ''}</li>`;
    const brk = dates.length ? `Sosta dal ${dshort(dates[0])} al ${dshort(dates[dates.length - 1])}` : 'Nessuna sosta per le nazionali nelle prossime 3 settimane';
    // In sosta la sezione va in cima; fuori sosta scende in fondo, compatta.
    const body = $('fBody');
    if (dates.length) body.insertBefore(box, body.firstChild); else body.appendChild(box);
    box.innerHTML = `
      <div class="panel-head"><h2>Nazionali</h2><span class="muted small">${esc(brk)} · aggiornato ${esc(ago(N.updated))}</span></div>
      <div class="nz-sum">
        ${[['convocato', 'Convocati'], ['lasciato', 'Hanno lasciato il ritiro'], ['in_attesa', 'In attesa della lista'], ['non_convocato', 'Non convocati']].map(([k, l]) => count(k) ? `<span class="nz-c nz-${k}"><b>${count(k)}</b> ${l}</span>` : '').join('')}
      </div>
      ${ch.length ? `<h3 class="subh">Novità</h3><ol class="timeline">${ch.slice(0, 4).map(chLi).join('')}</ol>${ch.length > 4 ? `<details class="nz-more"><summary>Altre ${ch.length - 4} novità</summary><ol class="timeline">${ch.slice(4).map(chLi).join('')}</ol></details>` : ''}` : ''}
      ${main.length ? `<div class="nzgrid">${main.map(([p, x]) => nazCard(p, x)).join('')}</div>` : `<p class="empty">${dates.length ? 'Nessun tuo giocatore è nel giro delle nazionali in questa sosta.' : 'Quando si avvicina una sosta qui trovi chi è convocato e chi no.'}</p>`}
      ${rest.length ? `<details class="nz-rest"><summary>Altri ${rest.length} giocatori: ${esc([...new Set(rest.map(([, x]) => (NZ[x.status] || NZ.sconosciuto)[0].toLowerCase()))].join(', '))}</summary><div class="nzgrid">${rest.map(([p, x]) => nazCard(p, x)).join('')}</div></details>` : ''}
      <p class="muted small">Fonte: liste ufficiali delle nazionali riportate su Wikipedia, più le notizie di Sky Sport, Gazzetta e le altre testate affidabili. Le liste si aggiornano pochi minuti o qualche ora dopo l'annuncio del CT. Se un giocatore è abbinato alla nazionale sbagliata, si corregge in data/fanta/nazionali.json (o chiedilo a Claude).</p>`;
  }

  function render() {
    if ($('view-fanta').hidden) return;
    renderHead();
    const ready = !!(data && data.rosa);
    $('fBody').hidden = !ready;
    if (!ready) return;
    renderNaz(); renderXI(); renderRosa(); renderChanges(); renderNews();
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
  // Se la pagina si apre già sulla sezione Fanta, parte da qui (fanta.js si carica dopo app.js).
  if (location.hash === '#fanta') window.BLFanta.show();
})();
