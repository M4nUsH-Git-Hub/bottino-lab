"""Bottino Lab · Fanta: raccoglie notizie e probabili formazioni sui giocatori della rosa.

Gira su GitHub Actions (vedi .github/workflows/fanta.yml) e scrive un file JSON che la
sezione Fanta del sito legge. Fonti:
  - Google News RSS, una ricerca per giocatore, tenendo solo le testate affidabili
    (Sky Sport, Fantacalcio.it, Gazzetta, Corriere dello Sport, Tuttosport, ANSA, Rai Sport, DAZN, SOS Fanta);
  - probabili formazioni di Fantacalcio.it (percentuale di titolarità e stato), lette con un
    browser vero e solo se robots.txt lo consente.

Uso:
  python scripts/fanta/update.py --rosa data/fanta/rosa.csv --prev vecchio.json --out fanta.json
  opzioni: --no-news, --no-fc
"""

import argparse
import csv
import html
import io
import json
import re
import sys
import time
import unicodedata
import urllib.request
import urllib.robotparser
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus

UA_BROWSER = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
UA_ROBOTS = "BottinoLab"
NEWS_KEEP_DAYS = 7
NEWS_MAX = 400
CHANGES_MAX = 150
FC_URL = "https://www.fantacalcio.it/probabili-formazioni-serie-a"
FC_MIN_DELTA = 15
FC_PARSER_VERSION = 2
FC_SECTIONS = ("panchina", "ballottaggi", "indisponibili", "in dubbio", "squalificati", "diffidati")

# Cognomi ambigui (omonimi famosi o parole comuni): serve anche la squadra nel testo.
AMBIGUOUS = {"jones", "adams", "vitinha", "ramon", "atta", "diao", "neres", "gila",
             "corvi", "daffara", "zortea", "modric", "politano"}

TEAM_ALIASES = {
    "juventus": ["juventus", "juve", "bianconer"], "inter": ["inter", "nerazzurr"],
    "milan": ["milan", "rossoner"], "napoli": ["napoli", "azzurri", "partenope"],
    "atalanta": ["atalanta", " dea", "bergamo"], "torino": ["torino", "toro", "granata"],
    "fiorentina": ["fiorentina", "viola"], "genoa": ["genoa", "grifone", "rossoblu"],
    "bologna": ["bologna", "rossoblu", "felsine"], "roma": ["roma", "giallorossi"],
    "lazio": ["lazio", "biancocelest"], "udinese": ["udinese", "friulan", "bianconer"],
    "parma": ["parma", "crociat", "ducali"], "como": ["como", "lariani"],
    "monza": ["monza", "brianzol"], "cagliari": ["cagliari", "rossobl"],
    "lecce": ["lecce", "salentin", "giallorossi"], "verona": ["verona", "hellas", "gialloblu"],
    "sassuolo": ["sassuolo", "neroverdi"], "cremonese": ["cremonese", "grigiorossi"],
    "pisa": ["pisa", "nerazzurr"], "empoli": ["empoli"], "venezia": ["venezia", "lagunari"],
    "palermo": ["palermo", "rosanero"], "frosinone": ["frosinone", "ciociar"],
}

CATEGORIES = [  # (chiave, parole) nell'ordine di priorità
    ("infortunio", ["infortun", "lesion", "risentimento", "affaticamento", "stop ", "ko ", " ko", "out ", " out",
                    "si ferma", "operat", "frattura", "distorsione", "stiramento", "contrattura",
                    "tempi di recupero", "salta", "non convocat", "esclus", "acciacc", "indisponibil", "forfait"]),
    ("squalifica", ["squalific", "espuls", "giudice sportivo", "diffidat", "cartellino rosso"]),
    ("recupero", ["recuperat", "torna in gruppo", "rientr", "convocat", "guarit", "a disposizione", "torna disponibile"]),
    ("formazione", ["probabil", "formazion", "titolar", "panchina", "ballottaggio", "undici", "scelte di",
                    "dal 1'", "dal primo minuto", "turnover"]),
    ("gol", ["gol", "doppietta", "tripletta", "rigore", "assist", "segna", " rete"]),
    ("mercato", ["mercato", "cessione", "trattativa", "rinnovo", "offerta", "trasferiment"]),
]

TRUSTED = {
    "sport.sky.it": "Sky Sport", "sky.it": "Sky Sport", "fantacalcio.it": "Fantacalcio.it",
    "gazzetta.it": "Gazzetta dello Sport", "corrieredellosport.it": "Corriere dello Sport",
    "tuttosport.com": "Tuttosport", "ansa.it": "ANSA", "rainews.it": "Rai Sport",
    "dazn.com": "DAZN", "sosfanta.com": "SOS Fanta",
}


def log(msg):
    print(msg, flush=True)


def now_utc():
    return datetime.now(timezone.utc)


def iso(dt):
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if dt else None


def norm(s):
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return re.sub(r"\s+", " ", s.lower()).strip()


def surname(nome):
    """'Jones C.' -> 'Jones', 'De Ketelaere' -> 'De Ketelaere'."""
    parts = [p for p in nome.split() if not re.fullmatch(r"[A-Za-zÀ-ÿ]\.", p)]
    return " ".join(parts) or nome


def num(s):
    s = (s or "").strip().replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


# ── Rosa ──────────────────────────────────────────────────────────────────────

def parse_rosa_csv(raw: bytes) -> list:
    """Export di Fantacalcio.it: separatore ; o , e virgola decimale."""
    text = raw.decode("utf-8-sig", errors="replace")
    first = text.splitlines()[0] if text.strip() else ""
    delim = ";" if first.count(";") >= first.count(",") else ","
    rows = list(csv.reader(io.StringIO(text), delimiter=delim))
    header_idx = next((i for i, r in enumerate(rows[:10]) if any(norm(c) == "nome" for c in r)), None)
    if header_idx is None:
        raise ValueError("Non trovo la colonna 'Nome' nel file.")
    head = [norm(c) for c in rows[header_idx]]

    def col(*names):
        for n in names:
            for i, h in enumerate(head):
                if h == n or h.startswith(n):
                    return i
        return None

    ci = {"ruolo": col("ruolo", "r"), "nome": col("nome"), "squadra": col("squadra"),
          "costo": col("costo"), "qt": col("quotazione attuale", "qt.a", "qt a", "quotazione"),
          "fvm": col("fvmp", "fvm"), "mv": col("media voto", "mv"), "fm": col("fanta media", "fm", "fantamedia"),
          "pv": col("partite giocate", "pv", "presenze")}
    out = []
    for r in rows[header_idx + 1:]:
        def g(k):
            i = ci.get(k)
            return r[i].strip() if i is not None and i < len(r) else ""
        if not g("nome"):
            continue
        out.append({"ruolo": (g("ruolo") or "?").upper()[:1], "nome": g("nome"), "squadra": g("squadra"),
                    "costo": num(g("costo")), "qt": num(g("qt")), "fvm": num(g("fvm")),
                    "mv": num(g("mv")), "fm": num(g("fm")), "pv": num(g("pv"))})
    if not out:
        raise ValueError("Il file non contiene giocatori.")
    return out


# ── Notizie ───────────────────────────────────────────────────────────────────

def gnews_url(query):
    return f"https://news.google.com/rss/search?q={quote_plus(query)}&hl=it&gl=IT&ceid=IT:it"


def http_get(url, timeout=20):
    req = urllib.request.Request(url, headers={"User-Agent": UA_BROWSER, "Accept-Language": "it-IT,it;q=0.9"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read()


def parse_feed(body: bytes) -> list:
    """[{title, link, source, source_url, desc, ts}] da un feed RSS o Atom."""
    root = ET.fromstring(body)
    items = []
    for it in root.iter():
        if it.tag.split("}")[-1] not in ("item", "entry"):
            continue

        def child(*names):
            for n in names:
                for c in it:
                    if c.tag.split("}")[-1] == n:
                        return c
            return None
        t, l, d = child("title"), child("link"), child("description", "summary")
        p, s = child("pubDate", "published", "updated"), child("source")
        link = ((l.text or l.get("href", "")) if l is not None else "").strip()
        ts = None
        if p is not None and p.text:
            try:
                ts = parsedate_to_datetime(p.text)
            except (TypeError, ValueError):
                try:
                    ts = datetime.fromisoformat(p.text.replace("Z", "+00:00"))
                except ValueError:
                    ts = None
            if ts and ts.tzinfo is None:
                ts = ts.replace(tzinfo=timezone.utc)
        title = html.unescape((t.text or "") if t is not None else "").strip()
        source = (s.text or "").strip() if s is not None else ""
        if source and " - " in title:
            head, tail = title.rsplit(" - ", 1)
            if norm(tail) and (norm(tail) in norm(source) or norm(source) in norm(tail)):
                title = head.strip()
        desc = re.sub(r"<[^>]+>", " ", html.unescape((d.text or "") if d is not None else ""))
        items.append({"title": title, "link": link, "source": source,
                      "source_url": s.get("url", "") if s is not None else "",
                      "desc": re.sub(r"\s+", " ", desc).strip(), "ts": ts})
    return items


def trusted_source(item):
    blob = (item.get("source_url", "") + " " + item.get("link", "")).lower()
    for dom, name in TRUSTED.items():
        if dom in blob:
            return name
    src = norm(item.get("source", ""))
    for name in TRUSTED.values():
        if norm(name) in src or src in ("la gazzetta dello sport", "sky sport 24", "sky tg24"):
            return name
    return None


def is_sky(item):
    blob = (item.get("source", "") + " " + item.get("source_url", "") + " " + item.get("link", "")).lower()
    return "sky" in blob and "skysports.com" not in blob


def _word_hit(w, text_norm):
    # Le voci con uno spazio ai lati ("ko ", " out") valgono solo come parole intere:
    # così "ko" non scatta dentro "Koopmeiners".
    if w != w.strip():
        return re.search(rf"(?<![a-z]){re.escape(w.strip())}(?![a-z])", text_norm) is not None
    return w in text_norm


def category(text_norm):
    for key, words in CATEGORIES:
        if any(_word_hit(w, text_norm) for w in words):
            return key
    return "news"


def match_players(text_norm, players):
    found = []
    for p in players:
        sur = norm(surname(p["nome"]))
        if not sur or not re.search(rf"(?<![a-z]){re.escape(sur)}(?![a-z])", text_norm):
            continue
        if sur in AMBIGUOUS or len(sur) < 5:
            aliases = TEAM_ALIASES.get(norm(p["squadra"]), [norm(p["squadra"])])
            if not any(a in text_norm for a in aliases):
                continue
        found.append(p)
    return found


def item_id(title):
    return norm(title)[:140]


def news_feeds(rosa):
    feeds = [("rosa", gnews_url(f"\"{surname(p['nome'])}\" {p['squadra']} when:2d")) for p in rosa]
    feeds += [
        ("generale", gnews_url("site:sport.sky.it serie a when:1d")),
        ("generale", gnews_url("\"probabili formazioni\" serie a when:1d")),
        ("generale", gnews_url("fantacalcio infortunio OR squalificato OR rientro when:1d")),
    ]
    return feeds


def build_news(raw_items, rosa, now):
    """Filtra per testate affidabili e giocatori della rosa; restituisce notizie pronte per il sito."""
    out, seen = [], set()
    for it in raw_items:
        if it["ts"] and (now - it["ts"]) > timedelta(days=NEWS_KEEP_DAYS):
            continue
        iid = item_id(it["title"])
        if not iid or iid in seen:
            continue
        src = trusted_source(it)
        if not src:
            continue
        text_norm = norm(it["title"] + " " + it["desc"])
        mine = match_players(text_norm, rosa)
        prob_sky = "probabili formazioni" in text_norm and is_sky(it)
        if not mine and not prob_sky:
            continue
        seen.add(iid)
        cat = "formazione" if "probabili formazioni" in text_norm else category(text_norm)
        out.append({"id": iid, "title": it["title"], "link": it["link"], "source": src,
                    "sky": is_sky(it), "ts": iso(it["ts"]), "players": [p["nome"] for p in mine],
                    "category": cat})
    return out


def collect_news(rosa, sleep=1.2):
    raw, ok, errors = [], 0, []
    for kind, url in news_feeds(rosa):
        try:
            raw += parse_feed(http_get(url))
            ok += 1
        except Exception as e:  # una fonte che non risponde non deve fermare le altre
            errors.append(f"{kind}: {type(e).__name__}: {e}"[:160])
        time.sleep(sleep)
    return raw, ok, errors


def merge_news(fresh, previous, now):
    """Unisce alle notizie del giro precedente: tiene la data di prima comparsa, scarta le vecchie."""
    prev = {n["id"]: n for n in previous or []}
    merged = {}
    for n in fresh:
        old = prev.get(n["id"])
        n["first_seen"] = (old or {}).get("first_seen") or iso(now)
        merged[n["id"]] = n
    for nid, n in prev.items():
        if nid not in merged:
            merged[nid] = n
    limit = now - timedelta(days=NEWS_KEEP_DAYS)

    def when(n):
        s = n.get("ts") or n.get("first_seen")
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except (AttributeError, ValueError):
            return now
    items = [n for n in merged.values() if when(n) >= limit]
    items.sort(key=when, reverse=True)
    return items[:NEWS_MAX]


# ── Probabili formazioni di Fantacalcio.it ────────────────────────────────────

WEEKDAY_RX = re.compile(r"^(lunedi|martedi|mercoledi|giovedi|venerdi|sabato|domenica)\s+\d{1,2}\s+[a-z]+,?\s+\d{1,2}[:.]\d{2}$")
PCT_RX = re.compile(r"^(\d{1,3})\s*%$")
MODULE_RX = re.compile(r"^\d(-\d){2,3}$")
SECTION_NAMES = {"ballottaggi": "ballottaggi", "squalificati": "squalificati", "diffidati": "diffidati",
                 "infortunati": "infortunati", "in dubbio": "dubbio"}


def _pairs(lines, i, end, stop):
    """Legge coppie nome / percentuale fino a quando stop(i) è vero."""
    out = []
    while i < end and not stop(i):
        m = PCT_RX.match(lines[i + 1]) if i + 1 < end else None
        if m and not PCT_RX.match(lines[i]):
            out.append((lines[i], int(m.group(1))))
            i += 2
        else:
            i += 1
    return out, i


def fc_blocks(text):
    """Divide la pagina in partite. Ogni partita inizia con le due squadre e lo schieramento
    senza percentuali, poi data e ora, stadio, squadra di casa, modulo e i titolari con le percentuali."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    dates = [i for i, l in enumerate(lines) if WEEKDAY_RX.match(norm(l)) and i + 3 < len(lines)]
    starts = []
    for d in dates:
        home = norm(lines[d + 2])
        s = next((k for k in range(d - 1, max(-1, d - 60), -1) if norm(lines[k]) == home), d)
        starts.append((s, d))
    blocks = []
    for n, (s, d) in enumerate(starts):
        e = starts[n + 1][0] if n + 1 < len(starts) else len(lines)
        blocks.append(_parse_block(lines, d, e))
    return blocks


def _parse_block(lines, d, e):
    b = {"kickoff": lines[d], "stadium": lines[d + 1], "home": lines[d + 2], "away": "",
         "modules": [], "starters": {}, "bench": {}, "updated": "",
         "ballottaggi": [], "squalificati": [], "diffidati": [], "infortunati": {}, "dubbio": {}}
    i = d + 3
    if i < e and MODULE_RX.match(lines[i]):
        b["modules"].append(lines[i])
        i += 1
    is_panchina = lambda k: norm(lines[k]) == "panchina"
    away_head = lambda k: k + 1 < e and MODULE_RX.match(lines[k + 1]) is not None
    hs, i = _pairs(lines, i, e, lambda k: away_head(k) or is_panchina(k))
    for nm, pct in hs:
        b["starters"][norm(nm)] = (pct, "home")
    if i < e and away_head(i):
        b["away"] = lines[i]
        b["modules"].append(lines[i + 1])
        i += 2
    aw, i = _pairs(lines, i, e, is_panchina)
    for nm, pct in aw:
        b["starters"][norm(nm)] = (pct, "away")
    if i < e and is_panchina(i):
        bench, i = _pairs(lines, i + 1, e, lambda k: norm(lines[k]).startswith(("ultimo aggiornamento", "presentazione squadre")))
        for nm, pct in bench:
            b["bench"][norm(nm)] = pct
    if i < e and norm(lines[i]).startswith("ultimo aggiornamento"):
        b["updated"] = lines[i][len("Ultimo aggiornamento"):].strip()
    sec, items = None, {k: [] for k in set(SECTION_NAMES.values())}
    for k in range(i, e):
        n = norm(lines[k])
        if n in SECTION_NAMES:
            sec = SECTION_NAMES[n]
        elif sec and not n.startswith("nessun"):
            items[sec].append(lines[k])
    bal, _ = _pairs(items["ballottaggi"], 0, len(items["ballottaggi"]), lambda k: False)
    b["ballottaggi"] = bal
    b["squalificati"] = [norm(x) for x in items["squalificati"]]
    b["diffidati"] = [norm(x) for x in items["diffidati"]]
    for key in ("infortunati", "dubbio"):
        lst = items[key]
        for k, nm in enumerate(lst):
            nxt = lst[k + 1] if k + 1 < len(lst) else ""
            b[key][norm(nm)] = nxt if len(nxt) > 25 else ""
    return b


def _same_team(a, b):
    a, b = norm(a), norm(b)
    return bool(a) and (a == b or a.startswith(b + " ") or b.startswith(a + " "))


def fc_parse(text, players):
    """Per ogni giocatore della rosa: stato nelle probabili, percentuale, flag, nota e partita."""
    blocks = fc_blocks(text)
    out = {}
    for p in players:
        name = norm(p["nome"])
        blk = next((b for b in blocks if _same_team(b["home"], p["squadra"]) or _same_team(b["away"], p["squadra"])), None)
        if not blk:
            continue
        casa = _same_team(blk["home"], p["squadra"])
        info = {"stato": "assente", "pct": None, "flags": [], "note": "", "partner": "",
                "match": {"home": blk["home"], "away": blk["away"], "casa": casa, "kickoff": blk["kickoff"],
                          "stadium": blk["stadium"], "aggiornato": blk["updated"]}}
        if name in blk["starters"]:
            info["stato"], info["pct"] = "titolare", blk["starters"][name][0]
        elif name in blk["bench"]:
            info["stato"], info["pct"] = "panchina", blk["bench"][name]
        if name in blk["dubbio"]:
            if info["stato"] == "assente":
                info["stato"] = "dubbio"
            else:
                info["flags"].append("in dubbio")
            info["note"] = blk["dubbio"][name]
        if name in blk["infortunati"]:
            info["stato"], info["pct"], info["note"] = "indisponibile", 0, blk["infortunati"][name]
        if name in blk["squalificati"]:
            info["stato"], info["pct"] = "squalificato", 0
        names = [norm(n) for n, _ in blk["ballottaggi"]]
        if name in names:
            k = names.index(name)
            info["flags"].append("ballottaggio")
            j = k + 1 if k % 2 == 0 else k - 1
            if 0 <= j < len(blk["ballottaggi"]):
                info["partner"] = blk["ballottaggi"][j][0]
        if name in blk["diffidati"]:
            info["flags"].append("diffidato")
        out[p["nome"]] = info
    return out


def robots_allows(url):
    rp = urllib.robotparser.RobotFileParser()
    base = re.match(r"https?://[^/]+", url).group(0)
    try:
        req = urllib.request.Request(base + "/robots.txt", headers={"User-Agent": UA_ROBOTS})
        with urllib.request.urlopen(req, timeout=15) as resp:
            rp.parse(resp.read().decode("utf-8", "replace").splitlines())
    except Exception as e:
        log(f"[probabili] robots.txt non leggibile ({e}): procedo con prudenza")
        return True
    return rp.can_fetch(UA_ROBOTS, url) and rp.can_fetch("*", url)


def fc_fetch_text():
    from playwright.sync_api import sync_playwright
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=UA_BROWSER, locale="it-IT")
        ctx.route("**/*", lambda r: r.abort() if r.request.resource_type in ("image", "media", "font") else r.continue_())
        page = ctx.new_page()
        page.goto(FC_URL, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(3000)
        for _ in range(8):  # scorre la pagina per caricare tutte le partite
            page.mouse.wheel(0, 4000)
            page.wait_for_timeout(400)
        text = page.eval_on_selector("body", "e => e.innerText")
        browser.close()
    return text


def _key(x):
    return {"stato": x.get("stato"), "pct": x.get("pct"), "flags": sorted(x.get("flags") or [])} if x else None


def diff_probabili(old, new, rosa, now):
    """Cambi di stato, di flag o di percentuale (almeno 15 punti) rispetto al giro precedente."""
    changes = []
    if old is None:
        return changes
    for p in rosa:
        a, b = _key(old.get(p["nome"])), _key(new.get(p["nome"]))
        if p["nome"] not in old or a == b:
            continue
        sa, sb = (a or {}).get("stato"), (b or {}).get("stato")
        pa, pb = (a or {}).get("pct"), (b or {}).get("pct")
        big = pa is not None and pb is not None and abs(pb - pa) >= FC_MIN_DELTA
        if sa != sb or big or (a or {}).get("flags") != (b or {}).get("flags"):
            changes.append({"ts": iso(now), "nome": p["nome"], "squadra": p["squadra"], "da": a, "a": b})
    return changes


# ── Giro completo ─────────────────────────────────────────────────────────────

def fc_debug_excerpt(text, names, before=70, after=25):
    """Righe della pagina attorno ad alcuni giocatori: serve solo a tarare il parser."""
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    out = []
    for name in names:
        idx = [i for i, l in enumerate(lines) if norm(name) in norm(l)]
        out.append(f"===== {name}: {len(idx)} righe contengono il nome =====")
        if idx:
            i = idx[0]
            out += [f"{k:5d} | {lines[k][:160]}" for k in range(max(0, i - before), min(len(lines), i + after))]
    return "\n".join(out)


DEBUG_FC = None


def run(rosa, prev, do_news=True, do_fc=True):
    now = now_utc()
    prev = prev or {}
    out = {"version": 1, "updated": iso(now), "rosa": rosa,
           "sources": dict(prev.get("sources") or {}),
           "news": prev.get("news") or [], "probabili": prev.get("probabili"),
           "probabili_updated": prev.get("probabili_updated"),
           "probabili_parser": prev.get("probabili_parser"),
           "changes": prev.get("changes") or []}

    if do_news:
        raw, ok, errors = collect_news(rosa)
        fresh = build_news(raw, rosa, now)
        out["news"] = merge_news(fresh, prev.get("news"), now)
        out["sources"]["news"] = {"ok": ok > 0, "when": iso(now), "feeds": ok, "errors": len(errors),
                                  "items": len(fresh), "error": errors[0] if errors else ""}
        log(f"[notizie] feed letti {ok}, errori {len(errors)}, notizie utili in questo giro {len(fresh)}, totale {len(out['news'])}")
        for e in errors[:3]:
            log(f"[notizie]   {e}")

    if do_fc:
        status = {"ok": False, "when": iso(now), "found": 0, "error": ""}
        try:
            if not robots_allows(FC_URL):
                raise RuntimeError("robots.txt di Fantacalcio.it non consente la lettura automatica")
            text = fc_fetch_text()
            if text.count("%") < 100:
                raise RuntimeError(f"pagina incompleta o bloccata ({text.count('%')} percentuali)")
            if DEBUG_FC:
                with open(DEBUG_FC, "w", encoding="utf-8") as f:
                    f.write(fc_debug_excerpt(text, ["Mercoledì 28 Ottobre, 20:45"], before=2, after=120))
            snap = fc_parse(text, rosa)
            # Dati di un parser precedente non sono confrontabili: in quel caso niente cambi.
            old = prev.get("probabili") if prev.get("probabili_parser") == FC_PARSER_VERSION else None
            out["changes"] = (diff_probabili(old, snap, rosa, now) + out["changes"])[:CHANGES_MAX]
            out["probabili"], out["probabili_updated"] = snap, iso(now)
            out["probabili_parser"] = FC_PARSER_VERSION
            status.update(ok=True, found=len(snap))
            log(f"[probabili] partite lette {len(fc_blocks(text))}, giocatori trovati {len(snap)} su {len(rosa)}")
        except Exception as e:
            status["error"] = f"{type(e).__name__}: {e}"[:200]
            log(f"[probabili] ERRORE {status['error']}")
        out["sources"]["probabili"] = status
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--rosa", required=True)
    ap.add_argument("--prev")
    ap.add_argument("--out", required=True)
    ap.add_argument("--no-news", action="store_true")
    ap.add_argument("--no-fc", action="store_true")
    ap.add_argument("--debug-fc", help="scrive un estratto della pagina delle probabili per tarare il parser")
    a = ap.parse_args(argv)
    global DEBUG_FC
    DEBUG_FC = a.debug_fc
    with open(a.rosa, "rb") as f:
        rosa = parse_rosa_csv(f.read())
    prev = None
    if a.prev:
        try:
            with open(a.prev, encoding="utf-8") as f:
                prev = json.load(f)
        except (OSError, ValueError):
            log("[stato] nessun file precedente: primo giro")
    data = run(rosa, prev, do_news=not a.no_news, do_fc=not a.no_fc)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    log(f"[fatto] scritto {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
