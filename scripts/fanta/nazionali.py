"""Bottino Lab · Fanta: convocazioni in nazionale dei giocatori della rosa.

Per ogni giocatore trova la nazionale e, durante le soste, dice se è convocato, non convocato,
se ha lasciato il ritiro (infortunio, rinuncia), quando gioca la nazionale, se ha giocato o segnato
e quando rientra. Aggiunge le notizie sulle convocazioni dalle testate affidabili.

Fonti:
  - Wikipedia in inglese, tramite l'interfaccia ufficiale per i programmi (api.php):
    pagina del giocatore (nazionale attuale), pagina della nazionale ("Current squad",
    "Recent call-ups" con le note INJ/WD/PRE, risultati e calendario con i marcatori);
  - Google News RSS, solo testate affidabili (stesse regole della raccolta notizie).

Uso (dopo update.py, sullo stesso file):
  python scripts/fanta/nazionali.py --fanta fanta.json --prev prev.json [--overrides data/fanta/nazionali.json]
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.request
from datetime import date, datetime, timedelta
from urllib.parse import urlencode

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import update as F  # noqa: E402

API = "https://en.wikipedia.org/w/api.php"
UA = "BottinoLab/1.0 (https://github.com/M4nUsH-Git-Hub/bottino-lab; fantacalcio personale)"
RESOLVE_DAYS = 7          # ogni quanto ricontrollare la nazionale di un giocatore
WINDOW_BACK = 4           # partite giocate fino a 4 giorni fa contano ancora nella sosta
WINDOW_AHEAD = 21         # partite entro 3 settimane = sosta in arrivo
CHANGES_MAX = 120
PARSER_VERSION = 3        # cambia quando cambia la lettura: i dati vecchi non si confrontano
MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"]
DEBUG = None
TRACE = []

MONTHS = {m: i + 1 for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july",
                                          "august", "september", "october", "november", "december"])}

# Squadre di Serie A come le scrive Wikipedia (serve a riconoscere la pagina giusta del giocatore).
CLUB_EN = {"inter": "Inter Milan", "milan": "AC Milan", "juventus": "Juventus", "napoli": "Napoli",
           "roma": "Roma", "lazio": "Lazio", "atalanta": "Atalanta", "fiorentina": "Fiorentina",
           "bologna": "Bologna", "torino": "Torino", "genoa": "Genoa", "udinese": "Udinese", "parma": "Parma",
           "como": "Como", "monza": "Monza", "cagliari": "Cagliari", "lecce": "Lecce", "verona": "Hellas Verona",
           "sassuolo": "Sassuolo", "cremonese": "Cremonese", "pisa": "Pisa", "empoli": "Empoli",
           "venezia": "Venezia", "palermo": "Palermo", "frosinone": "Frosinone", "salernitana": "Salernitana"}

# Codici FIFA → nome in italiano (quelli che mancano restano col codice).
COUNTRY = {
    "ITA": "Italia", "FRA": "Francia", "BEL": "Belgio", "ESP": "Spagna", "GER": "Germania", "NED": "Paesi Bassi",
    "POR": "Portogallo", "ENG": "Inghilterra", "SCO": "Scozia", "WAL": "Galles", "NIR": "Irlanda del Nord",
    "IRL": "Irlanda", "SUI": "Svizzera", "AUT": "Austria", "CRO": "Croazia", "SRB": "Serbia", "SVN": "Slovenia",
    "SVK": "Slovacchia", "CZE": "Repubblica Ceca", "POL": "Polonia", "HUN": "Ungheria", "ROU": "Romania",
    "BUL": "Bulgaria", "GRE": "Grecia", "TUR": "Turchia", "UKR": "Ucraina", "DEN": "Danimarca", "SWE": "Svezia",
    "NOR": "Norvegia", "FIN": "Finlandia", "ISL": "Islanda", "ALB": "Albania", "KVX": "Kosovo", "MKD": "Macedonia del Nord",
    "MNE": "Montenegro", "BIH": "Bosnia ed Erzegovina", "GEO": "Georgia", "ARM": "Armenia", "AZE": "Azerbaigian",
    "ISR": "Israele", "CYP": "Cipro", "MLT": "Malta", "LUX": "Lussemburgo", "EST": "Estonia", "LVA": "Lettonia",
    "LTU": "Lituania", "MDA": "Moldavia", "BLR": "Bielorussia", "KAZ": "Kazakistan", "FRO": "Fær Øer",
    "AND": "Andorra", "SMR": "San Marino", "LIE": "Liechtenstein", "GIB": "Gibilterra", "RUS": "Russia",
    "USA": "Stati Uniti", "CAN": "Canada", "MEX": "Messico", "CRC": "Costa Rica", "PAN": "Panama", "JAM": "Giamaica",
    "HON": "Honduras", "SLV": "El Salvador", "GUA": "Guatemala", "HAI": "Haiti", "CUW": "Curaçao", "TRI": "Trinidad e Tobago",
    "BRA": "Brasile", "ARG": "Argentina", "URU": "Uruguay", "COL": "Colombia", "CHI": "Cile", "ECU": "Ecuador",
    "PER": "Perù", "PAR": "Paraguay", "VEN": "Venezuela", "BOL": "Bolivia",
    "SEN": "Senegal", "MAR": "Marocco", "ALG": "Algeria", "TUN": "Tunisia", "EGY": "Egitto", "NGA": "Nigeria",
    "GHA": "Ghana", "CIV": "Costa d'Avorio", "CMR": "Camerun", "MLI": "Mali", "BFA": "Burkina Faso", "GUI": "Guinea",
    "GAB": "Gabon", "COD": "RD Congo", "CPV": "Capo Verde", "RSA": "Sudafrica", "ZAM": "Zambia", "GAM": "Gambia",
    "ANG": "Angola", "BEN": "Benin", "TOG": "Togo", "GNB": "Guinea-Bissau", "UGA": "Uganda", "KEN": "Kenya",
    "JPN": "Giappone", "KOR": "Corea del Sud", "AUS": "Australia", "IRN": "Iran", "KSA": "Arabia Saudita",
    "QAT": "Qatar", "UAE": "Emirati Arabi", "IRQ": "Iraq", "UZB": "Uzbekistan", "JOR": "Giordania", "CHN": "Cina",
    "NZL": "Nuova Zelanda", "COM": "Comore", "SDN": "Sudan", "SGP": "Singapore", "MTN": "Mauritania", "LBY": "Libia",
    "MOZ": "Mozambico", "NAM": "Namibia", "ZIM": "Zimbabwe", "TAN": "Tanzania", "RWA": "Ruanda", "MAD": "Madagascar",
}
CODE_OF = {"Italy": "ITA", "France": "FRA", "Belgium": "BEL", "Spain": "ESP", "Germany": "GER", "Netherlands": "NED",
           "Portugal": "POR", "England": "ENG", "Scotland": "SCO", "Switzerland": "SUI", "Croatia": "CRO",
           "Kosovo": "KVX", "Colombia": "COL", "Brazil": "BRA", "Senegal": "SEN", "United States": "USA",
           "Mali": "MLI", "Serbia": "SRB", "Denmark": "DEN", "Austria": "AUT", "Poland": "POL", "Argentina": "ARG",
           "Uruguay": "URU", "Nigeria": "NGA", "Morocco": "MAR", "Ivory Coast": "CIV", "Ghana": "GHA",
           "Turkey": "TUR", "Albania": "ALB", "Norway": "NOR", "Sweden": "SWE", "Georgia": "GEO", "Slovenia": "SVN",
           "Slovakia": "SVK", "Czech Republic": "CZE", "Ukraine": "UKR", "Greece": "GRE", "Mexico": "MEX", "Canada": "CAN",
           "Belgium ": "BEL", "Wales": "WAL", "Republic of Ireland": "IRL", "Hungary": "HUN", "Romania": "ROU",
           "Bosnia and Herzegovina": "BIH", "North Macedonia": "MKD", "Montenegro": "MNE", "Iceland": "ISL",
           "Finland": "FIN", "Japan": "JPN", "South Korea": "KOR", "Australia": "AUS", "Cameroon": "CMR",
           "Algeria": "ALG", "Tunisia": "TUN", "Egypt": "EGY", "Ecuador": "ECU", "Paraguay": "PAR", "Peru": "PER",
           "Venezuela": "VEN", "Chile": "CHI", "Jamaica": "JAM", "Costa Rica": "CRC", "Panama": "PAN"}
EN_IT = {k: COUNTRY[v] for k, v in CODE_OF.items() if v in COUNTRY}
EN_IT.update({"Chile": "Cile", "Haiti": "Haiti", "Sudan": "Sudan", "Israel": "Israele", "Republic of Ireland": "Irlanda",
              "Japan": "Giappone", "Singapore": "Singapore", "Finland": "Finlandia", "San Marino": "San Marino",
              "Romania": "Romania", "North Macedonia": "Macedonia del Nord", "Estonia": "Estonia", "Hungary": "Ungheria",
              "Wales": "Galles", "Iceland": "Islanda", "Republic Of Ireland": "Irlanda", "South Korea": "Corea del Sud"})
UEFA = {"ITA", "FRA", "BEL", "ESP", "GER", "NED", "POR", "ENG", "SCO", "WAL", "NIR", "IRL", "SUI", "AUT", "CRO",
        "SRB", "SVN", "SVK", "CZE", "POL", "HUN", "ROU", "BUL", "GRE", "TUR", "UKR", "DEN", "SWE", "NOR", "FIN",
        "ISL", "ALB", "KVX", "MKD", "MNE", "BIH", "GEO", "ARM", "AZE", "ISR", "CYP", "MLT", "LUX", "EST", "LVA",
        "LTU", "MDA", "BLR", "KAZ", "FRO", "AND", "SMR", "LIE", "GIB", "RUS"}
NOTE_CODES = {"INJ": "lasciato il ritiro per infortunio", "WD": "lasciato il ritiro (rinuncia o motivi personali)",
              "PRE": "solo nella lista provvisoria", "SUS": "squalificato", "RET": "ritirato dalla nazionale",
              "SEN": "passato in nazionale maggiore", "U21": "aggregato all'Under 21", "COV": "positivo al Covid",
              "ILL": "lasciato il ritiro per malattia"}
STATUS_LABEL = {"convocato": "Convocato", "non_convocato": "Non convocato", "lasciato": "Ha lasciato il ritiro",
                "in_attesa": "Lista non ancora uscita", "nessuna_sosta": "Nessuna partita in vista",
                "fuori": "Fuori dal giro", "sconosciuto": "Da verificare"}


def log(msg):
    F.log(f"[nazionali] {msg}")


# ── Wikipedia ─────────────────────────────────────────────────────────────────

def api(params, retries=2):
    q = dict(params, format="json", formatversion="2", maxlag="5")
    url = f"{API}?{urlencode(q)}"
    for k in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
            with urllib.request.urlopen(req, timeout=30) as r:
                data = json.loads(r.read().decode("utf-8"))
            if "error" in data:
                TRACE.append(f"API errore {data['error'].get('code')}: {data['error'].get('info', '')[:120]}")
                if data["error"].get("code") == "maxlag" and k < retries:
                    time.sleep(5)
                    continue
            return data
        except Exception:
            if k == retries:
                raise
            time.sleep(3)
    return {}


def search(q, n=5):
    d = api({"action": "query", "list": "search", "srsearch": q, "srlimit": n, "srnamespace": 0})
    return [x["title"] for x in d.get("query", {}).get("search", [])]


def wikitexts(titles):
    """{titolo richiesto: (titolo finale, wikitext)}; segue i redirect."""
    out = {}
    titles = [t for t in dict.fromkeys(titles) if t]
    for i in range(0, len(titles), 10):
        chunk = titles[i:i + 10]
        d = api({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                 "redirects": 1, "titles": "|".join(chunk)})
        q = d.get("query", {})
        alias = {}
        for kind in ("normalized", "redirects"):
            for x in q.get(kind, []):
                alias[x["from"]] = x["to"]
        pages = {p["title"]: p for p in q.get("pages", [])}
        for t in chunk:
            final = t
            while final in alias:
                final = alias[final]
            p = pages.get(final)
            if p and not p.get("missing") and p.get("revisions"):
                out[t] = (final, p["revisions"][0]["slots"]["main"]["content"])
        time.sleep(0.5)
    return out


# ── Wikitext ──────────────────────────────────────────────────────────────────

def templates(wt, name_rx):
    """Tutti i template {{nome|...}} il cui nome corrisponde a name_rx: [(nome, {param: valore}, [posizionali])]."""
    out, rx = [], re.compile(name_rx, re.I)
    i = 0
    while True:
        i = wt.find("{{", i)
        if i < 0:
            break
        depth, j = 0, i
        while j < len(wt) - 1:
            two = wt[j:j + 2]
            if two == "{{":
                depth += 1
                j += 2
            elif two == "}}":
                depth -= 1
                j += 2
                if depth == 0:
                    break
            else:
                j += 1
        body = wt[i + 2:j - 2]
        parts = split_top(body)
        name = parts[0].strip() if parts else ""
        if rx.fullmatch(name):
            named, pos = {}, []
            for p in parts[1:]:
                if "=" in p and not p.split("=", 1)[0].strip().count("["):
                    k, v = p.split("=", 1)
                    named[k.strip().lower()] = v.strip()
                else:
                    pos.append(p.strip())
            out.append((name, named, pos))
            i = j
        else:
            i += 2
    return out


def split_top(body):
    parts, buf, d1, d2, k = [], [], 0, 0, 0
    while k < len(body):
        two = body[k:k + 2]
        if two == "{{":
            d1 += 1; buf.append(two); k += 2; continue
        if two == "}}":
            d1 -= 1; buf.append(two); k += 2; continue
        if two == "[[":
            d2 += 1; buf.append(two); k += 2; continue
        if two == "]]":
            d2 -= 1; buf.append(two); k += 2; continue
        c = body[k]
        if c == "|" and d1 == 0 and d2 == 0:
            parts.append("".join(buf)); buf = []
        else:
            buf.append(c)
        k += 1
    parts.append("".join(buf))
    return parts


def link(s):
    """Primo [[Destinazione|Testo]] → (destinazione, testo)."""
    m = re.search(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]", s or "")
    if not m:
        t = plain(s)
        return t, t
    return m.group(1).strip(), (m.group(2) or m.group(1)).strip()


def flag_code(s):
    m = re.search(r"\{\{\s*(?:fb|fb-rt|fbu|fbw|fb-big|flagicon)[^|}]*\|\s*([A-Z]{3})\b", s or "")
    return m.group(1) if m else ""


def plain(s):
    s = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", s or "", flags=re.S)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"\{\{\s*(?:sup|abbr)\s*\|\s*([^|}]+)[^}]*\}\}", r" \1 ", s, flags=re.I)
    s = re.sub(r"\{\{\s*(?:fb|fb-rt|fbu|fb-big)[^|}]*\|\s*([A-Z]{3})[^}]*\}\}", lambda m: COUNTRY.get(m.group(1), m.group(1)), s)
    for _ in range(3):
        s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]+)\]\]", r"\1", s)
    s = re.sub(r"<[^>]+>", " ", s)
    s = s.replace("'''", "").replace("''", "").replace("&nbsp;", " ").replace("&ndash;", "–")
    return re.sub(r"\s+", " ", s).strip()


def sections(wt):
    """[(livello, titolo, testo)] con il testo fino al titolo successivo dello stesso livello o superiore."""
    hs = [(m.start(), m.end(), len(m.group(1)), plain(m.group(2))) for m in re.finditer(r"^(={2,6})\s*(.+?)\s*\1\s*$", wt, re.M)]
    out = []
    for k, (s, e, lvl, title) in enumerate(hs):
        end = len(wt)
        for s2, _, lvl2, _ in hs[k + 1:]:
            if lvl2 <= lvl:
                end = s2
                break
        out.append((lvl, title, wt[e:end]))
    return out


def find_section(wt, rx):
    for lvl, title, body in sections(wt):
        if re.fullmatch(rx, title, re.I):
            return body
    return ""


MONTH_RX = r"(January|February|March|April|May|June|July|August|September|October|November|December)"


def dates_in(text, default_year=None):
    """Date scritte all'inglese: '12 and 15 November 2026', '13 November and 16 November 2026',
    'November 14 and 17, 2026', '5, 9 and 13 October'. Se manca l'anno vale quello della data scritta dopo."""
    t = plain(text)
    days_rx = r"((?:(?<!\d)\d{1,2}(?!\d)(?:st|nd|rd|th)?\s*(?:,|and|&|–|-)\s*)*(?<!\d)\d{1,2}(?!\d))(?:st|nd|rd|th)?"
    found = []  # (posizione, mese, giorni, anno o None)
    for m in re.finditer(days_rx + r"\s+" + MONTH_RX + r"(?:,?\s+(\d{4}))?", t):
        found.append((m.start(), MONTHS[m.group(2).lower()], m.group(1), int(m.group(3)) if m.group(3) else None))
    for m in re.finditer(MONTH_RX + r"\s+" + days_rx + r"(?:,?\s*(\d{4}))?", t):
        found.append((m.start(), MONTHS[m.group(1).lower()], m.group(2), int(m.group(3)) if m.group(3) else None))
    found.sort()
    out = []
    for k, (_, mo, days, y) in enumerate(found):
        if y is None:
            y = next((x[3] for x in found[k + 1:] if x[3]), default_year)
        if not y:
            continue
        for d in re.findall(r"\d{1,2}", days):
            try:
                out.append(date(y, mo, int(d)))
            except ValueError:
                pass
    return sorted(set(out))


def months_in(text):
    """'matches in November 2026' → [(2026, 11)] quando non ci sono i giorni."""
    return [(int(y), MONTHS[m.lower()]) for m, y in re.findall(MONTH_RX + r"\s+(\d{4})", plain(text))]


def opponents_in(text):
    """Avversari dalla frase della lista: '... matches against France and Belgium on ...'."""
    t = plain(text)
    each = re.findall(r"(?:against|and)\s+(?:the\s+)?([A-Z][A-Za-z' .-]+?)\s+on\s+(?:\d|[A-Z][a-z]+ \d)", t)
    if len(each) >= 2:
        return [x.strip() for x in each]
    m = re.search(r"against (.+?)(?: on | in |,? to be |\.|$)", t)
    if not m:
        return []
    parts = re.split(r",\s*|\s+and\s+|\s*&\s*", re.sub(r"\bthe\b", "", m.group(1)))
    return [x.strip() for x in parts if x.strip() and not re.search(r"\d", x)]


def start_date(s):
    m = re.search(r"\{\{\s*start date[^|]*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})", s or "", re.I)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    ds = dates_in(s or "")
    return ds[0] if ds else None


# ── Giocatore → nazionale ────────────────────────────────────────────────────

def infobox(wt):
    boxes = templates(wt, r"infobox (?:football biography|footballer)(?:\s*\d)?")
    if not boxes:
        return None
    # Wikipedia usa sia "nationalteam1" sia "national_team1": senza trattini bassi sono uguali.
    p = {k.replace("_", ""): v for k, v in boxes[0][1].items()}
    teams = []
    for k in range(1, 30):
        t = p.get(f"nationalteam{k}")
        if not t:
            continue
        target, shown = link(t)
        years = plain(p.get(f"nationalyears{k}", "")).replace("-", "–").replace(" ", "")
        caps = re.sub(r"\D", "", plain(p.get(f"nationalcaps{k}", "")))
        goals = re.sub(r"\D", "", plain(p.get(f"nationalgoals{k}", "")))
        teams.append({"page": target, "shown": shown, "years": years, "open": bool(re.search(r"\d{4}–$", years)),
                      "caps": int(caps) if caps else None, "goals": int(goals) if goals else None})
    club_t, club_s = link(p.get("currentclub") or p.get("club") or "")
    return {"teams": teams, "club": club_t + " " + club_s, "fullname": plain(p.get("fullname", "")),
            "name": plain(p.get("name", ""))}


def is_youth(page):
    return bool(re.search(r"under-?\d\d|\bu-?\d\d\b|olympic|\bb team\b|national b ", page, re.I))


def pick_team(teams):
    """Nazionale attuale: maggiore aperta; altrimenti giovanile aperta; altrimenti l'ultima maggiore (chiusa)."""
    nat = [t for t in teams if re.search(r"national.*team", t["page"], re.I)]
    senior = [t for t in nat if not is_youth(t["page"])]
    youth = [t for t in nat if is_youth(t["page"])]
    for group, level in ((senior, "A"), (youth, "giovanile")):
        open_ = [t for t in group if t["open"]]
        if open_:
            return dict(open_[-1], level=level, current=True)
    if senior:
        return dict(senior[-1], level="A", current=False)
    if youth:
        return dict(youth[-1], level="giovanile", current=False)
    return None


def club_ok(info_club, squadra):
    c, s = F.norm(info_club), F.norm(squadra)
    if s == "milan":
        return "milan" in c and "inter" not in c
    if s == "inter":
        return "inter" in c
    return s in c or F.norm(CLUB_EN.get(s, s)) in c


def resolve(p, override=None):
    """Pagina Wikipedia del giocatore e sua nazionale."""
    sur = F.surname(p["nome"])
    initial = (re.search(r"\b([A-Z])\.$", p["nome"]) or [None, ""])[1]
    club = CLUB_EN.get(F.norm(p["squadra"]), p["squadra"])
    if override and override.get("page"):
        cands = [override["page"]]
    else:
        cands = search(f'{sur} {club} hastemplate:"Infobox football biography"', 6)
        cands += [c for c in search(f"{sur} footballer {club}", 4) if c not in cands]
    texts = wikitexts(cands)
    TRACE.append(f"{p['nome']}: candidati {cands[:6]} · testi {len(texts)}")
    best = None
    for c in cands:
        if c not in texts:
            continue
        title, wt = texts[c]
        ib = infobox(wt)
        if not ib:
            continue
        sur_ok = all(w in F.norm(title + " " + ib["name"] + " " + ib["fullname"]) for w in F.norm(sur).split())
        TRACE.append(f"   {title}: infobox ok, club '{ib['club'][:40]}', cognome {'ok' if sur_ok else 'NO'}, nazionali {len(ib['teams'])}")
        if not sur_ok:
            continue
        score = (2 if club_ok(ib["club"], p["squadra"]) else 0) + (1 if initial and F.norm(title).startswith(initial.lower()) else 0)
        if override and override.get("page"):
            score += 5
        if score >= 2 and (not best or score > best[0]):
            best = (score, title, ib)
    if not best:
        return {"wiki": None}
    _, title, ib = best
    team = pick_team(ib["teams"])
    if override and override.get("team"):
        team = {"page": override["team"], "shown": override["team"], "level": "giovanile" if is_youth(override["team"]) else "A",
                "current": True, "caps": None, "goals": None, "years": ""}
    full = re.sub(r"\s*\(.*?\)\s*", "", title).strip()
    return {"wiki": title, "full": full, "team": team}


# ── Nazionale: lista, chiamati di recente, partite ───────────────────────────

def squad_rows(body):
    rows = []
    for name, prm, _ in templates(body, r"nat fs (?:g )?player|nat fs r player|nat fs g r player"):
        target, shown = link(prm.get("name", ""))
        latest = prm.get("latest", "") or prm.get("other", "")
        codes = sorted(set(re.findall(r"\b(INJ|WD|PRE|SUS|RET|SEN|U21|COV|ILL)\b", plain(latest) + " " + plain(prm.get("name", "")))))
        caps = re.sub(r"\D", "", plain(prm.get("caps", "")))
        goals = re.sub(r"\D", "", plain(prm.get("goals", "")))
        ds = dates_in(latest)
        rows.append({"page": target, "name": shown, "pos": plain(prm.get("pos", "")),
                     "caps": int(caps) if caps else None, "goals": int(goals) if goals else None,
                     "club": link(prm.get("club", ""))[1], "codes": codes,
                     "latest": plain(latest), "latest_date": ds[-1].isoformat() if ds else None})
    return rows


COMP_IT = [(r"concacaf nations league", "CONCACAF Nations League"), (r"nations league", "Nations League"), (r"world cup qualif|fifa world cup qualification", "Qualificazioni Mondiali"),
           (r"euro.*qualif|european championship qualif", "Qualificazioni Europei"),
           (r"africa cup of nations qualif|afcon qualif", "Qualificazioni Coppa d'Africa"),
           (r"africa cup of nations|afcon", "Coppa d'Africa"), (r"copa am[eé]rica", "Copa América"),
           (r"gold cup", "Gold Cup"), (r"asian cup qualif", "Qualificazioni Coppa d'Asia"), (r"asian cup", "Coppa d'Asia"),
           (r"world cup", "Mondiali"), (r"uefa euro|european championship", "Europei"), (r"friendl", "Amichevole"),
           (r"finalissima", "Finalissima"), (r"kirin", "Kirin Cup")]


def comp_it(round_):
    t = plain(round_).lower()
    for rx, lab in COMP_IT:
        if re.search(rx, t):
            return lab
    return plain(round_)[:40] or "Partita"


def fixtures(wt):
    out = []
    for _, prm, _ in templates(wt, r"football ?box(?: collapsible)?"):
        d = start_date(prm.get("date", ""))
        c1, c2 = flag_code(prm.get("team1", "")), flag_code(prm.get("team2", ""))
        if not d or not (c1 or c2):
            continue
        score = plain(prm.get("score", ""))
        m = re.search(r"(\d+)\s*[–-]\s*(\d+)", score)
        tm = re.search(r"\d{1,2}[:.]\d{2}", plain(prm.get("time", "")))
        out.append({"date": d.isoformat(), "time": tm.group(0).replace(".", ":") if tm else "", "c1": c1, "c2": c2,
                    "t1": COUNTRY.get(c1, plain(prm.get("team1", ""))), "t2": COUNTRY.get(c2, plain(prm.get("team2", ""))),
                    "score": f"{m.group(1)}–{m.group(2)}" if m else "", "comp": comp_it(prm.get("round", "")),
                    "place": plain(prm.get("location", "") or prm.get("stadium", ""))[:60],
                    "g1": prm.get("goals1", ""), "g2": prm.get("goals2", "")})
    out.sort(key=lambda x: x["date"])
    return out


def team_code(fx):
    from collections import Counter
    cnt = Counter([f["c1"] for f in fx] + [f["c2"] for f in fx])
    return cnt.most_common(1)[0][0] if cnt else ""


def parse_team(wt, today, title=""):
    cur = find_section(wt, r"current squad|current roster|latest squad|squad")
    rec = find_section(wt, r"recent call[- ]?ups")
    intro = cur.split("{{nat fs", 1)[0] if cur else ""
    # Solo la frase della lista: "The following players were called up for ...", senza "correct as of" ecc.
    intro = re.sub(r"<!--.*?-->|<ref[^>]*/>|<ref[^>]*>.*?</ref>", " ", intro, flags=re.S)
    sents = [x for x in re.split(r"(?<=[.;])\s+(?=[A-Z'*\[{])|<br\s*/?>|\n", intro) if x.strip()]
    sents = [x for x in sents if not re.search(r"as of|correct|born|eligible", x, re.I)]
    main = next((x for x in sents if re.search(r"following|called up|named|selected", x, re.I)), "")
    sq_dates = dates_in(main, today.year)
    months = months_in(main) if not sq_dates else []
    fx = fixtures(wt)
    m = re.match(r"(.+?) (?:men's )?national (?:under-\d\d )?(?:football|soccer) team", title or "")
    code = team_code(fx) or CODE_OF.get(m.group(1) if m else title_country(wt), "")
    return {"code": code, "name": COUNTRY.get(code, code), "squad": squad_rows(cur), "recent": squad_rows(rec),
            "squad_dates": [d.isoformat() for d in sq_dates], "squad_months": months,
            "opponents": opponents_in(main), "comp": comp_it(main), "intro": plain(main)[:300], "fixtures": fx,
            "sections": [t for _, t, _ in sections(wt)][:60], "raw_intro": intro[:500] if not main else ""}


def title_country(wt):
    m = re.search(r"\|\s*(?:name|Name)\s*=\s*([^\n|]+)", wt[:3000])
    return plain(m.group(1)) if m else ""


def team_window(team, today):
    """Partite della sosta: dal calendario; se la pagina non lo ha, dalla frase della lista dei convocati."""
    w = window(team["fixtures"], today)
    if w:
        return w, True
    ds = [date.fromisoformat(d) for d in team["squad_dates"]]
    near = [d for d in ds if today - timedelta(days=WINDOW_BACK) <= d <= today + timedelta(days=WINDOW_AHEAD)]
    if not near:
        return [], False
    opp = team.get("opponents") or []
    if len(opp) == 1:
        opp = opp * len(near)
    out = []
    for k, d in enumerate(near):
        o = opp[k] if k < len(opp) else ""
        out.append({"date": d.isoformat(), "time": "", "c1": team["code"], "c2": "", "t1": team["name"],
                    "t2": EN_IT.get(o, o) or "da definire", "score": "", "comp": team.get("comp") or "Partita",
                    "place": "", "g1": "", "g2": "", "approx": True})
    return out, False


def window(fx, today):
    """Partite della sosta attuale o in arrivo (stessa finestra: entro 10 giorni dalla prima)."""
    near = [f for f in fx if today - timedelta(days=WINDOW_BACK) <= date.fromisoformat(f["date"]) <= today + timedelta(days=WINDOW_AHEAD)]
    if not near:
        return []
    first = date.fromisoformat(near[0]["date"])
    return [f for f in near if date.fromisoformat(f["date"]) <= first + timedelta(days=10)]


def italian(s):
    """'v. COM, 4 October 2026' → 'contro Comore, 4 ottobre 2026'."""
    s = re.sub(r"^v\.\s*", "contro ", s or "")
    s = re.sub(r"\b([A-Z]{3})\b", lambda m: COUNTRY.get(m.group(1), m.group(1)), s)
    return re.sub(MONTH_RX, lambda m: MESI[MONTHS[m.group(1).lower()] - 1], s)


def same_player(row, wiki, full):
    if wiki and F.norm(row["page"]) == F.norm(wiki):
        return True
    return bool(full) and F.norm(row["name"]) == F.norm(full)


def goals_of(text, wiki, full):
    """Reti del giocatore in un elenco marcatori: [[Giocatore]] {{goal|23|pen.|67}} → 2."""
    n = 0
    for seg in re.split(r"(?=\[\[)", text or ""):
        if not seg.startswith("[["):
            continue
        tg, sh = link(seg)
        fn, sn = F.norm(full or ""), F.norm(sh)
        if (wiki and F.norm(tg) == F.norm(wiki)) or (fn and (sn == fn or sn == fn.split()[-1])):
            m = re.search(r"\{\{\s*goal\s*\|([^}]*)\}\}", seg, re.I)
            mins = [x for x in m.group(1).split("|") if re.match(r"\s*\d", x)] if m else []
            n += len(mins) or 1
    return n


def status_for(info, team, today, prev_entry, global_window=None):
    wiki, full = info.get("wiki"), info.get("full")
    t = info.get("team") or {}
    res = {"status": "sconosciuto", "note": "", "fixtures": [], "played": None, "scored": 0}
    if not wiki:
        res["note"] = "Giocatore non trovato su Wikipedia: si può indicare a mano in data/fanta/nazionali.json"
        return res
    if not t:
        res["status"] = "fuori"
        res["note"] = "Nessuna presenza in nazionale"
        return res
    if not team:
        res["note"] = "Pagina della nazionale non letta"
        return res
    wnd, from_cal = team_window(team, today)
    in_squad = next((r for r in team["squad"] if same_player(r, wiki, full)), None)
    in_recent = next((r for r in team["recent"] if same_player(r, wiki, full)), None)
    sq_dates = [date.fromisoformat(d) for d in team["squad_dates"]]
    wnd_dates = [date.fromisoformat(f["date"]) for f in wnd]
    sq_dates = [d for d in sq_dates if d <= today + timedelta(days=60)]
    squad_current = bool(sq_dates) and bool(wnd_dates) and max(sq_dates) >= min(wnd_dates) - timedelta(days=1)
    if not wnd and sq_dates and max(sq_dates) >= today - timedelta(days=WINDOW_BACK):
        squad_current = True
    # Lista con il solo mese ("matches in November 2026"): vale se è il mese della sosta in corso.
    if not sq_dates and team.get("squad_months") and global_window:
        squad_current = any((y, m) == (global_window[0].year, global_window[0].month) for y, m in team["squad_months"])
    for f in wnd:
        is1 = f["c1"] == team["code"]
        res["fixtures"].append({"date": f["date"], "time": f["time"], "home": f["t1"], "away": f["t2"], "comp": f["comp"],
                                "score": f["score"], "place": f["place"], "nat_home": is1,
                                "scored": goals_of(f["g1"] if is1 else f["g2"], wiki, full) if f["score"] else 0})
    res["scored"] = sum(f["scored"] for f in res["fixtures"])
    caps_now = in_squad["caps"] if in_squad else (in_recent["caps"] if in_recent else None)
    res["caps"], res["goals_tot"] = caps_now, (in_squad or in_recent or {}).get("goals")
    recent_in_window = in_recent and in_recent.get("latest_date") and wnd_dates and \
        date.fromisoformat(in_recent["latest_date"]) >= min(wnd_dates) - timedelta(days=10)
    if not t.get("current") and not in_squad and not recent_in_window:
        res["status"] = "fuori"
        res["note"] = f"Ultima nazionale: {t.get('shown')} ({t.get('years') or '—'})"
    elif not wnd and squad_current and in_squad:
        res["status"] = "convocato"
        res["note"] = "Date delle partite non ancora disponibili"
    elif not wnd and squad_current:
        res["status"] = "non_convocato"
    elif not wnd and global_window:
        res["status"] = "in_attesa"
        res["note"] = "Sosta in corso: la lista di questa nazionale non è ancora aggiornata"
    elif not wnd:
        nxt = next((f for f in team["fixtures"] if date.fromisoformat(f["date"]) > today), None)
        res["status"] = "nessuna_sosta"
        res["note"] = f"Prossima partita della nazionale: {nxt['date']}" if nxt else "Nessuna partita in calendario"
        res["next_date"] = nxt["date"] if nxt else None
    elif squad_current and in_squad:
        res["status"] = "convocato"
        codes = [c for c in in_squad["codes"] if c in NOTE_CODES]
        if codes:
            res["note"] = ", ".join(NOTE_CODES[c] for c in codes)
    elif recent_in_window and any(c in ("INJ", "WD", "ILL", "SUS", "PRE", "COV") for c in in_recent["codes"]):
        res["status"] = "lasciato"
        res["note"] = ", ".join(NOTE_CODES[c] for c in in_recent["codes"] if c in NOTE_CODES)
    elif squad_current:
        res["status"] = "non_convocato"
        if in_recent and in_recent.get("latest"):
            res["note"] = f"Ultima chiamata: {italian(in_recent['latest'])[:80]}"
    else:
        res["status"] = "in_attesa"
        res["note"] = "La nazionale non ha ancora annunciato i convocati"
    res["done"] = bool(wnd) and all(f["score"] for f in wnd) and date.fromisoformat(wnd[-1]["date"]) < today
    # Presenze nella sosta: crescita delle presenze rispetto all'inizio della sosta.
    key = wnd[0]["date"] if wnd else None
    base = None
    if prev_entry and prev_entry.get("window") == key and prev_entry.get("caps_base") is not None:
        base = prev_entry["caps_base"]
    elif caps_now is not None and key:
        base = caps_now if not any(f["score"] for f in wnd) else None
    res["window"], res["caps_base"] = key, base
    if base is not None and caps_now is not None and any(f["score"] for f in wnd):
        res["played"] = max(0, caps_now - base)
    if wnd:
        res["return"] = wnd[-1]["date"]
        res["long_trip"] = team["code"] not in UEFA
    return res


# ── Notizie sulle convocazioni ───────────────────────────────────────────────

NEWS_RX = re.compile(r"convoc|nazional|\bct\b|ritiro|nations league|amichevol|qualificazion|sosta|rientr|esclus|lista|forfait|infortun", re.I)


def naz_news(players, now, sleep=1.2):
    out, ok, errors = {}, 0, []
    for nome, full, team_it in players:
        try:
            items = F.parse_feed(F.http_get(F.gnews_url(f'"{full}" nazionale OR convocato OR convocati when:5d')))
            ok += 1
        except Exception as e:
            errors.append(f"{nome}: {type(e).__name__}: {e}"[:160])
            items = []
        keep, seen = [], set()
        last = F.norm(full).split()[-1]
        for it in items:
            src = F.trusted_source(it)
            text = F.norm(it["title"] + " " + it["desc"])
            if not src or last not in text or not NEWS_RX.search(text):
                continue
            if it["ts"] and now - it["ts"] > timedelta(days=7):
                continue
            iid = F.item_id(it["title"])
            if iid in seen:
                continue
            seen.add(iid)
            keep.append({"title": it["title"], "link": it["link"], "source": src, "sky": F.is_sky(it), "ts": F.iso(it["ts"])})
        out[nome] = sorted(keep, key=lambda x: x["ts"] or "", reverse=True)[:5]
        time.sleep(sleep)
    return out, ok, errors


# ── Giro completo ────────────────────────────────────────────────────────────

def run(rosa, prev, overrides=None, now=None, do_news=True):
    now = now or F.now_utc()
    today = now.date()
    prev = prev or {}
    if prev.get("parser") != PARSER_VERSION:   # lettura cambiata: si riparte senza confronti
        prev = {"players": {k: {kk: vv for kk, vv in v.items() if kk in ("wiki", "full", "team", "resolved", "squadra")}
                            for k, v in (prev.get("players") or {}).items()}}
    old = prev.get("players") or {}
    overrides = overrides or {}
    players, errors = {}, []

    # 1. nazionale di ogni giocatore (riusa quella trovata negli ultimi giorni)
    for p in rosa:
        o = old.get(p["nome"]) or {}
        ov = overrides.get(p["nome"])
        fresh = o.get("resolved") and (now - datetime.fromisoformat(o["resolved"].replace("Z", "+00:00"))) < timedelta(days=RESOLVE_DAYS)
        if fresh and o.get("wiki") and not ov and o.get("squadra") == p["squadra"]:
            players[p["nome"]] = {k: o.get(k) for k in ("wiki", "full", "team", "resolved")}
        else:
            try:
                info = resolve(p, ov)
                info["resolved"] = F.iso(now)
                players[p["nome"]] = info
            except Exception as e:
                errors.append(f"{p['nome']}: {type(e).__name__}: {e}"[:160])
                players[p["nome"]] = {k: o.get(k) for k in ("wiki", "full", "team", "resolved")}
        players[p["nome"]]["squadra"] = p["squadra"]

    # 2. pagine delle nazionali
    pages = sorted({(x.get("team") or {}).get("page") for x in players.values() if (x.get("team") or {}).get("page")})
    teams = {}
    try:
        texts = wikitexts(pages)
    except Exception as e:
        texts = {}
        errors.append(f"nazionali: {type(e).__name__}: {e}"[:160])
    for pg in pages:
        if pg in texts:
            try:
                teams[pg] = parse_team(texts[pg][1], today, pg)
            except Exception as e:
                errors.append(f"{pg}: {type(e).__name__}: {e}"[:160])

    # 3. stato di ogni giocatore (la sosta "globale" serve per le nazionali senza calendario)
    all_w = sorted(date.fromisoformat(f["date"]) for t in teams.values() for f in team_window(t, today)[0])
    global_window = (all_w[0], all_w[-1]) if all_w else None
    for nome, info in players.items():
        team = teams.get((info.get("team") or {}).get("page"))
        info.update(status_for(info, team, today, old.get(nome), global_window))
        if team:
            info["nat"], info["code"] = team["name"], team["code"]
            info["squad_intro"] = team["intro"]
            if (info.get("team") or {}).get("level") == "giovanile":
                m = re.search(r"under-?(\d\d)|\bU-?(\d\d)\b", info["team"]["page"], re.I)
                info["nat"] = f"{team['name']} U{m.group(1) or m.group(2)}" if m else f"{team['name']} giovanile"
        info["label"] = STATUS_LABEL.get(info["status"], info["status"])

    # 4. novità rispetto al giro precedente
    changes = list(prev.get("changes") or [])
    for nome, info in players.items():
        before = (old.get(nome) or {}).get("status")
        if before and before != info["status"] and info["status"] not in ("sconosciuto",):
            changes.insert(0, {"ts": F.iso(now), "nome": nome, "da": STATUS_LABEL.get(before, before),
                               "a": info["label"], "nat": info.get("nat", ""), "note": info.get("note", "")})
    changes = changes[:CHANGES_MAX]

    # 5. notizie (solo per chi è nel giro della nazionale e ha una sosta in corso o in arrivo)
    news_status = prev.get("news_status")
    if do_news:
        who = [(n, i["full"], i.get("nat", "")) for n, i in players.items()
               if i.get("full") and i["status"] in ("convocato", "non_convocato", "lasciato", "in_attesa")]
        news, ok, nerr = naz_news(who, now)
        for n, i in players.items():
            i["news"] = news.get(n, [])
        news_status = {"ok": ok > 0 or not who, "feeds": ok, "errors": len(nerr), "when": F.iso(now)}
        errors += nerr[:3]
    else:
        for n, i in players.items():
            i["news"] = (old.get(n) or {}).get("news", [])

    found = sum(1 for i in players.values() if i.get("wiki"))
    out = {"parser": PARSER_VERSION, "updated": F.iso(now), "ok": bool(teams) or found > 0, "found": found, "teams_read": len(teams),
           "errors": errors[:8], "players": players, "changes": changes, "news_status": news_status,
           "teams": {pg: {"code": t["code"], "name": t["name"], "squad_dates": t["squad_dates"], "intro": t["intro"],
                          "squad_size": len(t["squad"]), "fixtures": len(t["fixtures"])} for pg, t in teams.items()}}
    if DEBUG:
        with open(DEBUG, "w", encoding="utf-8") as f:
            for nome, i in players.items():
                f.write(f"{nome}: {i.get('wiki')} | {(i.get('team') or {}).get('page')} | {i['status']} | {i.get('note')}\n")
            for pg, t in teams.items():
                f.write(f"\n== {pg} [{t['code']}] squad={len(t['squad'])} recent={len(t['recent'])} fixtures={len(t['fixtures'])}\n")
                f.write(f"   intro: {t['intro']}\n   dates: {t['squad_dates']}\n")
                if not t["squad"]:
                    f.write(f"   sezioni: {t['sections']}\n")
                if t.get("raw_intro"):
                    f.write(f"   testo grezzo: {t['raw_intro']!r}\n")
                f.write(f"   avversari: {t['opponents']} · comp {t['comp']} · mesi {t['squad_months']}\n")
                for fx in team_window(t, today)[0]:
                    f.write(f"   {fx}\n")
            if errors:
                f.write("\nERRORI\n" + "\n".join(errors))
            f.write("\n\nTRACCIA\n" + "\n".join(TRACE[:300]))
    log(f"giocatori riconosciuti {found}/{len(rosa)}, nazionali lette {len(teams)}/{len(pages)}, errori {len(errors)}")
    for e in errors[:5]:
        log(f"  {e}")
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--fanta", required=True, help="fanta.json appena scritto da update.py (viene aggiornato)")
    ap.add_argument("--prev", help="fanta.json del giro precedente")
    ap.add_argument("--overrides", help="correzioni manuali: {\"Nome\": {\"page\": ..., \"team\": ...}}")
    ap.add_argument("--no-news", action="store_true")
    ap.add_argument("--debug", help="scrive un riepilogo leggibile per controllare il riconoscimento")
    a = ap.parse_args(argv)
    global DEBUG
    DEBUG = a.debug
    with open(a.fanta, encoding="utf-8") as f:
        data = json.load(f)
    prev = {}
    if a.prev:
        try:
            with open(a.prev, encoding="utf-8") as f:
                prev = json.load(f).get("nazionali") or {}
        except (OSError, ValueError):
            pass
    ov = {}
    if a.overrides and os.path.exists(a.overrides):
        with open(a.overrides, encoding="utf-8") as f:
            ov = {k: v for k, v in json.load(f).items() if not k.startswith("_")}
    try:
        data["nazionali"] = run(data["rosa"], prev, ov, do_news=not a.no_news)
    except Exception as e:  # mai rompere il file delle notizie per colpa delle nazionali
        log(f"ERRORE {type(e).__name__}: {e}")
        data["nazionali"] = dict(prev, ok=False, errors=[f"{type(e).__name__}: {e}"[:200]])
    with open(a.fanta, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
