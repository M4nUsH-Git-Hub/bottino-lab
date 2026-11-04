"""Bottino Lab · dati delle partite per l'analisi delle domande.

Gira su GitHub Actions (.github/workflows/match-data.yml) e scrive matches.json, che il sito usa per
compilare da solo statistiche, forma, precedenti, riposo e impegni delle squadre riconosciute nella domanda.

Fonti:
  - football-data.org (API ufficiale, chiave gratuita nel segreto FOOTBALL_DATA_TOKEN): partite della
    stagione con risultato finale e del primo tempo, classifiche, precedenti. Competizioni del piano gratuito:
    Champions League, Serie A, Premier League, Liga, Bundesliga, Ligue 1, Eredivisie, Primeira Liga.
  - Google News, solo testate affidabili e prima Sky Sport: notizie delle squadre che giocano a breve.
  - Probabili di Fantacalcio.it (dal file della sezione Fanta): indisponibili e squalificati di Serie A.

Uso:
  FOOTBALL_DATA_TOKEN=... python scripts/match/matchdata.py --out matches.json [--fanta fanta.json] [--prev matches.json]
"""

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fanta"))
import update as F  # noqa: E402  (stesse funzioni per notizie e testo della sezione Fanta)

API = "https://api.football-data.org/v4"
COMPS = ["CL", "SA", "PL", "PD", "BL1", "FL1", "DED", "PPL"]
LEAGUES = {"SA", "PL", "PD", "BL1", "FL1", "DED", "PPL"}
CALL_GAP = 6.5            # piano gratuito: 10 chiamate al minuto
UPCOMING_DAYS = 6
NEWS_HOURS = 60           # notizie per le partite entro due giorni e mezzo
H2H_MAX = 24
TEAM_MATCHES = 30
NEWS_PER_TEAM = 8

ALERT_WORDS = {
    "turnover": ["turnover", "rotazion", "riposo per", "risparmia", "risparmiare", "far rifiatare", "rifiatare"],
}


def log(msg):
    print(msg, flush=True)


class Api:
    def __init__(self, token):
        self.token, self.calls, self.last = token, 0, 0.0

    def get(self, path):
        wait = CALL_GAP - (time.time() - self.last)
        if wait > 0:
            time.sleep(wait)
        for attempt in range(2):
            req = urllib.request.Request(API + path, headers={"X-Auth-Token": self.token, "User-Agent": "BottinoLab"})
            self.last = time.time()
            self.calls += 1
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    return json.loads(r.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt == 0:
                    log(f"[api] limite raggiunto su {path}: attendo 61 secondi")
                    time.sleep(61)
                    continue
                raise


def team_info(t):
    return {"id": t.get("id"), "name": t.get("name") or "", "short": t.get("shortName") or t.get("name") or "",
            "tla": t.get("tla") or ""}


def score_of(m):
    s = m.get("score") or {}
    ft, ht = s.get("fullTime") or {}, s.get("halfTime") or {}
    return ft.get("home"), ft.get("away"), ht.get("home"), ht.get("away")


def build(matches, standings, comps_names, now):
    """Partite di tutte le competizioni → squadre (risultati, classifica, prossimi impegni) e partite in arrivo."""
    teams, fixtures = {}, []
    for m in matches:
        h, a = team_info(m["homeTeam"]), team_info(m["awayTeam"])
        if not h["id"] or not a["id"]:
            continue
        for t in (h, a):
            teams.setdefault(t["id"], dict(t, matches=[], next=[], pos=None))
        when = datetime.fromisoformat(m["utcDate"].replace("Z", "+00:00"))
        comp = m["_comp"]
        if m.get("status") == "FINISHED":
            fh, fa, hh, ha = score_of(m)
            if fh is None or fa is None:
                continue
            day = when.strftime("%Y-%m-%d")
            teams[h["id"]]["matches"].append([day, comp, 1, a["short"], fh, fa, hh, ha])
            teams[a["id"]]["matches"].append([day, comp, 0, h["short"], fa, fh, ha, hh])
        elif m.get("status") in ("SCHEDULED", "TIMED", "IN_PLAY", "PAUSED", "POSTPONED"):
            if when < now - timedelta(hours=3):
                continue
            teams[h["id"]]["next"].append([when.strftime("%Y-%m-%dT%H:%MZ"), comp, 1, a["short"]])
            teams[a["id"]]["next"].append([when.strftime("%Y-%m-%dT%H:%MZ"), comp, 0, h["short"]])
            if when <= now + timedelta(days=UPCOMING_DAYS):
                fixtures.append({"id": m["id"], "utc": when.strftime("%Y-%m-%dT%H:%MZ"), "comp": comp,
                                 "compName": comps_names.get(comp, comp), "matchday": m.get("matchday"),
                                 "stage": m.get("stage"), "home": h["id"], "away": a["id"], "status": m.get("status")})
    for t in teams.values():
        t["matches"].sort(key=lambda x: x[0], reverse=True)
        t["matches"] = t["matches"][:TEAM_MATCHES]
        t["next"].sort(key=lambda x: x[0])
        t["next"] = t["next"][:4]
    for comp, table in standings.items():
        for row in table:
            tid = (row.get("team") or {}).get("id")
            if tid in teams and (teams[tid]["pos"] is None or comp in LEAGUES):
                teams[tid]["pos"] = {"comp": comp, "position": row.get("position"), "points": row.get("points"),
                                     "played": row.get("playedGames"), "gd": row.get("goalDifference")}
    fixtures.sort(key=lambda f: f["utc"])
    return teams, fixtures


def h2h_rows(resp, home_id):
    """Precedenti dal punto di vista della squadra di casa di oggi: [data, comp, gol casa-oggi, gol ospite-oggi, primo tempo]."""
    out = []
    for m in (resp or {}).get("matches", []):
        if m.get("status") != "FINISHED":
            continue
        fh, fa, hh, ha = score_of(m)
        if fh is None:
            continue
        same = (m.get("homeTeam") or {}).get("id") == home_id
        out.append([m["utcDate"][:10], (m.get("competition") or {}).get("code", ""),
                    fh if same else fa, fa if same else fh, (hh if same else ha), (ha if same else hh)])
    out.sort(key=lambda x: x[0], reverse=True)
    return out[:6]


# ── Notizie per squadra ───────────────────────────────────────────────────────

def load_aliases(path):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f).get("aliases", {})
    except (OSError, ValueError):
        return {}


def team_terms(t, aliases):
    """Parole con cui una squadra compare nei titoli: nome corto, nome completo e nomi italiani."""
    names = {F.norm(t["short"]), F.norm(t["name"])}
    for it, variants in aliases.items():
        if F.norm(t["short"]) in [F.norm(v) for v in variants] or F.norm(t["name"]) in [F.norm(v) for v in variants]:
            names.add(F.norm(it))
    return [n for n in names if len(n) >= 3]


def alerts_of(text_norm):
    keys = []
    cat = F.category(text_norm)
    if cat in ("infortunio", "squalifica", "recupero"):
        keys.append(cat)
    for k, words in ALERT_WORDS.items():
        if any(w in text_norm for w in words):
            keys.append(k)
    return cat, keys


def team_news(t, aliases, now, sleep=1.0):
    terms = team_terms(t, aliases)
    q = t["short"]
    feeds = [F.gnews_url(f'site:sport.sky.it "{q}" when:3d'), F.gnews_url(f'"{q}" calcio when:2d')]
    raw, errors = [], 0
    for u in feeds:
        try:
            raw += F.parse_feed(F.http_get(u))
        except Exception:
            errors += 1
        time.sleep(sleep)
    out, seen = [], set()
    for it in raw:
        if it["ts"] and now - it["ts"] > timedelta(days=4):
            continue
        src = F.trusted_source(it)
        tn = F.norm(it["title"] + " " + it["desc"])
        iid = F.item_id(it["title"])
        if not src or iid in seen or not any(f" {x} " in f" {tn} " or tn.startswith(x) for x in terms):
            continue
        seen.add(iid)
        cat, alerts = alerts_of(tn)
        out.append({"title": it["title"], "link": it["link"], "source": src, "sky": F.is_sky(it),
                    "ts": F.iso(it["ts"]), "category": cat, "alerts": alerts})
    out.sort(key=lambda n: (not n["sky"], -(datetime.fromisoformat(n["ts"].replace("Z", "+00:00")).timestamp() if n["ts"] else 0)))
    return out[:NEWS_PER_TEAM], errors


# ── Assenze di Serie A dalla sezione Fanta ────────────────────────────────────

def serie_a_absences(fanta):
    return (fanta or {}).get("serie_a") or {}


def attach_absences(teams, absences):
    for t in teams.values():
        for name, info in absences.items():
            if F.norm(name) in (F.norm(t["short"]), F.norm(t["name"])) or F.norm(t["short"]).startswith(F.norm(name) + " "):
                t["absences"] = info
                break


# ── Giro completo ─────────────────────────────────────────────────────────────

def run(token, aliases, fanta=None, prev=None, do_news=True):
    now = datetime.now(timezone.utc)
    status = {"ok": False, "when": F.iso(now), "calls": 0, "error": "", "comps": []}
    if not token:
        status["error"] = "manca la chiave FOOTBALL_DATA_TOKEN"
        log("[dati] " + status["error"])
        out = dict(prev or {})
        out.update({"version": 1, "updated": (prev or {}).get("updated"), "source": status})
        return out
    api = Api(token)
    matches, standings, names = [], {}, {}
    for c in COMPS:
        try:
            r = api.get(f"/competitions/{c}/matches")
            names[c] = ((r.get("competition") or {}).get("name")) or c
            for m in r.get("matches", []):
                m["_comp"] = c
            matches += r.get("matches", [])
            status["comps"].append(c)
        except Exception as e:
            log(f"[dati] {c}: {type(e).__name__}: {e}")
            status["error"] = f"{c}: {e}"[:160]
        try:
            st = api.get(f"/competitions/{c}/standings")
            tables = [s for s in st.get("standings", []) if s.get("type") == "TOTAL"]
            if tables:
                standings[c] = [row for tbl in tables for row in tbl.get("table", [])]
        except Exception as e:
            log(f"[dati] classifica {c}: {e}")
    teams, fixtures = build(matches, standings, names, now)
    log(f"[dati] competizioni {len(status['comps'])}/{len(COMPS)}, partite {len(matches)}, squadre {len(teams)}, in arrivo {len(fixtures)}")

    # precedenti per le partite più vicine
    soon = [f for f in fixtures if datetime.fromisoformat(f["utc"].replace("Z", "+00:00")) <= now + timedelta(hours=NEWS_HOURS)]
    for f in soon[:H2H_MAX]:
        try:
            f["h2h"] = h2h_rows(api.get(f"/matches/{f['id']}/head2head?limit=6"), f["home"])
        except Exception as e:
            log(f"[dati] precedenti {f['id']}: {e}")
            break
    status["calls"] = api.calls

    if do_news:
        ids = {f["home"] for f in soon} | {f["away"] for f in soon}
        n_items, n_err = 0, 0
        for tid in ids:
            items, errs = team_news(teams[tid], aliases, now)
            teams[tid]["news"] = items
            n_items += len(items)
            n_err += errs
        log(f"[notizie] squadre {len(ids)}, notizie {n_items}, errori {n_err}")

    attach_absences(teams, serie_a_absences(fanta))
    status["ok"] = bool(status["comps"])
    return {"version": 1, "updated": F.iso(now), "source": status, "competitions": names,
            "fixtures": fixtures, "teams": {str(k): v for k, v in teams.items()},
            "fanta_updated": (fanta or {}).get("probabili_updated")}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--fanta")
    ap.add_argument("--prev")
    ap.add_argument("--aliases", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "docs", "data", "aliases.json"))
    ap.add_argument("--no-news", action="store_true")
    a = ap.parse_args(argv)

    def load(p):
        try:
            with open(p, encoding="utf-8") as f:
                return json.load(f)
        except (OSError, ValueError, TypeError):
            return None
    data = run(os.environ.get("FOOTBALL_DATA_TOKEN", "").strip(), load_aliases(a.aliases),
               fanta=load(a.fanta), prev=load(a.prev), do_news=not a.no_news)
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    log(f"[fatto] scritto {a.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
