/* Bottino Lab — motore di calcolo.
   Funzioni pure: quote senza margine, Poisson, distribuzione normale, fusione delle stime.
   Funziona sia nel browser (window.BLEngine) sia in Node (module.exports) per i test. */
(function (root) {
  'use strict';

  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  // Converte un valore del form in numero (accetta la virgola italiana). Vuoto = null.
  function num(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).trim().replace(',', '.');
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // Media dei soli valori presenti.
  function mean(values) {
    const v = values.filter(x => x !== null && x !== undefined && Number.isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  }

  function poissonPmf(lambda, k) {
    let t = Math.exp(-lambda);
    for (let i = 1; i <= k; i++) t *= lambda / i;
    return t;
  }

  // P(X > line) con X ~ Poisson(lambda). Linea 1.5 => almeno 2.
  function poissonOver(lambda, line) {
    const k = Math.floor(line);
    let cdf = 0;
    for (let i = 0; i <= k; i++) cdf += poissonPmf(lambda, i);
    return clamp(1 - cdf, 0, 1);
  }

  // Distribuzione 0..maxK-1 esatti, più il blocco "maxK o più".
  function poissonDist(lambda, maxK) {
    const out = [];
    let rest = 1;
    for (let k = 0; k < maxK; k++) {
      const p = poissonPmf(lambda, k);
      out.push({ k, p, plus: false });
      rest -= p;
    }
    out.push({ k: maxK, p: Math.max(0, rest), plus: true });
    return out;
  }

  // Esito finale da due Poisson indipendenti (casa, ospite).
  function matchProbs(lh, la, max = 12) {
    let h = 0, d = 0, a = 0;
    for (let i = 0; i <= max; i++) {
      const pi = poissonPmf(lh, i);
      for (let j = 0; j <= max; j++) {
        const p = pi * poissonPmf(la, j);
        if (i > j) h += p; else if (i === j) d += p; else a += p;
      }
    }
    const s = h + d + a;
    return { home: h / s, draw: d / s, away: a / s };
  }

  // Funzione d'errore (Abramowitz-Stegun 7.1.26), errore < 1.5e-7.
  function erf(x) {
    const sign = Math.sign(x);
    x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return sign * y;
  }
  const normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
  const normalOver = (mean, sd, line) => 1 - normCdf((line - mean) / sd);

  // Quote di una riga -> probabilità "pulita" del Sì e margine del bookmaker.
  // ways = 2: a = quota Sì, b = quota No. ways = 3: a/b/c = 1/X/2 e sel = indice dell'esito Sì.
  function fairFromOdds(row, ways, sel) {
    if (!row) return null;
    if (ways === 3) {
      const o = [num(row.a), num(row.b), num(row.c)];
      if (!o.every(x => x !== null && x > 1)) return null;
      const inv = o.map(x => 1 / x);
      const s = inv[0] + inv[1] + inv[2];
      return { p: inv[sel] / s, margin: s - 1, siOdd: o[sel] };
    }
    const a = num(row.a), b = num(row.b);
    if (!(a > 1 && b > 1)) return null;
    const ia = 1 / a, ib = 1 / b, s = ia + ib;
    return { p: ia / s, margin: s - 1, siOdd: a, noOdd: b };
  }

  // Fattori di contesto: +1 verso Sì, -1 verso No. Ogni fattore vale 2,5 punti, massimo 12,5.
  function contextAdj(ctx, step = 0.025, cap = 0.125) {
    let s = 0;
    for (const k in ctx || {}) s += Number(ctx[k]) || 0;
    return clamp(s * step, -cap, cap);
  }

  // Fusione: quote e statistiche pesate, poi correzione di contesto.
  function blend({ pM, pS, adj = 0, w = 0.6 }) {
    let base;
    if (pM != null && pS != null) base = w * pM + (1 - w) * pS;
    else if (pM != null) base = pM;
    else if (pS != null) base = pS;
    else base = 0.5;
    return { base, p: clamp(base + adj, 0.03, 0.97) };
  }

  function confidenceLabel(p) {
    const c = Math.max(p, 1 - p);
    if (c < 0.55) return { level: 0, text: 'Testa o croce', c };
    if (c < 0.60) return { level: 1, text: 'Fiducia lieve', c };
    if (c < 0.70) return { level: 2, text: 'Fiducia buona', c };
    return { level: 3, text: 'Fiducia alta', c };
  }

  const api = { clamp, num, mean, poissonPmf, poissonOver, poissonDist, matchProbs, erf, normCdf, normalOver, fairFromOdds, contextAdj, blend, confidenceLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BLEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
