"""Test della raccolta Fanta: python -m unittest discover -s tests/py"""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "fanta"))
import update as U  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
NOW = datetime(2026, 10, 28, 12, 0, tzinfo=timezone.utc)

RSS = b"""<?xml version="1.0"?><rss><channel>
<item><title>Juve, Koopmeiners verso il rientro dal primo minuto - Sky Sport</title>
<link>https://news.google.com/a1</link><pubDate>Wed, 28 Oct 2026 09:00:00 GMT</pubDate>
<source url="https://sport.sky.it">Sky Sport</source><description>&lt;a&gt;Spalletti valuta&lt;/a&gt;</description></item>
<item><title>Pulisic, fastidio muscolare: salta il Milan? - Calciomercato blog</title>
<link>https://news.google.com/a2</link><pubDate>Wed, 28 Oct 2026 08:00:00 GMT</pubDate>
<source url="https://blog-qualunque.it">Calciomercato blog</source></item>
<item><title>Jones lascia la NFL - Gazzetta</title>
<link>https://news.google.com/a3</link><pubDate>Wed, 28 Oct 2026 07:00:00 GMT</pubDate>
<source url="https://www.gazzetta.it">La Gazzetta dello Sport</source></item>
<item><title>Inter, Jones titolare con l'Atalanta - Gazzetta</title>
<link>https://news.google.com/a4</link><pubDate>Wed, 28 Oct 2026 06:00:00 GMT</pubDate>
<source url="https://www.gazzetta.it">La Gazzetta dello Sport</source></item>
<item><title>Notizia vecchia su Pulisic Milan - Gazzetta</title>
<link>https://news.google.com/a5</link><pubDate>Mon, 12 Oct 2026 06:00:00 GMT</pubDate>
<source url="https://www.gazzetta.it">Gazzetta</source></item>
</channel></rss>"""


class TestFanta(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(os.path.join(ROOT, "data", "fanta", "rosa.csv"), "rb") as f:
            cls.rosa = U.parse_rosa_csv(f.read())

    def test_rosa(self):
        self.assertEqual(len(self.rosa), 25)
        pul = next(p for p in self.rosa if p["nome"] == "Pulisic")
        self.assertEqual(pul["ruolo"], "C")
        self.assertAlmostEqual(pul["fm"], 7.67)
        self.assertEqual(pul["costo"], 40)
        self.assertEqual({p["ruolo"] for p in self.rosa}, {"P", "D", "C", "A"})

    def test_surname(self):
        self.assertEqual(U.surname("Jones C."), "Jones")
        self.assertEqual(U.surname("De Ketelaere"), "De Ketelaere")

    def test_feed_and_filters(self):
        raw = U.parse_feed(RSS)
        self.assertEqual(len(raw), 5)
        self.assertEqual(raw[0]["title"], "Juve, Koopmeiners verso il rientro dal primo minuto")
        news = U.build_news(raw, self.rosa, NOW)
        titles = [n["title"] for n in news]
        self.assertIn("Juve, Koopmeiners verso il rientro dal primo minuto", titles)
        self.assertIn("Inter, Jones titolare con l'Atalanta", titles)
        self.assertNotIn("Pulisic, fastidio muscolare: salta il Milan?", titles)   # fonte non affidabile
        self.assertNotIn("Jones lascia la NFL", titles)                            # omonimo senza squadra
        self.assertNotIn("Notizia vecchia su Pulisic Milan", titles)               # più vecchia di 7 giorni
        k = next(n for n in news if "Koopmeiners" in n["players"])
        self.assertTrue(k["sky"])
        self.assertEqual(k["source"], "Sky Sport")
        self.assertEqual(k["category"], "recupero")

    def test_category_whole_words(self):
        self.assertEqual(U.category(U.norm("Koopmeiners torna in gruppo")), "recupero")
        self.assertEqual(U.category(U.norm("Pulisic ko, salta la Roma")), "infortunio")
        self.assertEqual(U.category(U.norm("Scalvini out per due settimane")), "infortunio")

    def test_merge_keeps_first_seen(self):
        old = [{"id": "a", "title": "A", "ts": "2026-10-27T10:00:00Z", "first_seen": "2026-10-27T10:05:00Z"},
               {"id": "z", "title": "Z", "ts": "2026-10-10T10:00:00Z", "first_seen": "2026-10-10T10:05:00Z"}]
        fresh = [{"id": "a", "title": "A", "ts": "2026-10-27T10:00:00Z"},
                 {"id": "b", "title": "B", "ts": "2026-10-28T11:00:00Z"}]
        m = U.merge_news(fresh, old, NOW)
        self.assertEqual([n["id"] for n in m], ["b", "a"])
        self.assertEqual(m[1]["first_seen"], "2026-10-27T10:05:00Z")
        self.assertEqual(m[0]["first_seen"], "2026-10-28T12:00:00Z")

    PAGE = "\n".join([
        "Probabili formazioni Serie A", "Menu",
        # partita 1: pitch senza percentuali, poi data, stadio, casa, modulo, titolari con percentuali
        "Venezia", "Inter", *[f"Nome{i}" for i in range(22)],
        "Martedì 27 Ottobre, 20:45", "Pier Luigi Penzo",
        "Venezia", "3-5-2", *sum([[f"Ven{i}", "90%"] for i in range(11)], []),
        "Inter", "3-5-2", "Sommer", "95%", "Akanji", "55%", "Bastoni", "55%", "Barella", "60%", "Thuram", "80%",
        "Panchina", "Ven99", "10%", "Jones C.", "5%",
        "Ultimo aggiornamento 27/10/2026 - 19:55", "Presentazione squadre", "Venezia", "Inter", "Dettaglio calciatori",
        "Ballottaggi", "Nessun ballottaggio", "Bastoni", "55%", "Akanji", "45%",
        "Squalificati", "Nessun calciatore", "Nessun calciatore",
        "Diffidati", "Nessun calciatore", "Bastoni",
        "Infortunati", "Jones C.", "Risentimento agli adduttori, rientro dalla fine di ottobre",
        "In dubbio", "Nessun calciatore", "Thuram", "Affaticamento, da valutare nella rifinitura",
        # partita 2
        "Genoa", "Juventus", *[f"Nome{i}" for i in range(22)],
        "Mercoledì 28 Ottobre, 20:45", "Luigi Ferraris",
        "Genoa", "3-5-2", "Bijlow", "90%", "Vitinha O.", "60%",
        "Juventus", "3-5-2", "Vicario", "95%", "Lucumì", "80%", "Woltemade", "70%",
        "Panchina", "Koopmeiners", "40%",
        "Ultimo aggiornamento 28/10/2026 - 09:10", "Presentazione squadre", "Genoa", "Juventus", "Dettaglio calciatori",
        "Ballottaggi", "Vitinha O.", "60%", "Ekuban", "40%", "Nessun ballottaggio",
        "Squalificati", "Nessun calciatore", "Nessun calciatore",
        "Diffidati", "Nessun calciatore", "Nessun calciatore",
        "Infortunati", "Nessun calciatore", "Yildiz", "Frattura al piede, rientro a dicembre",
        "In dubbio", "Nessun calciatore", "Nessun calciatore",
        # partita 3 con un giocatore della rosa assente e uno squalificato
        "Milan", "Bologna", *[f"Nome{i}" for i in range(22)],
        "Mercoledì 28 Ottobre, 18:30", "Giuseppe Meazza",
        "Milan", "4-4-1-1", "Maignan", "95%", "Pulisic", "85%",
        "Bologna", "4-2-3-1", "Skorupski", "95%",
        "Panchina", "Modric", "30%",
        "Ultimo aggiornamento 28/10/2026 - 09:10", "Presentazione squadre", "Milan", "Bologna", "Dettaglio calciatori",
        "Ballottaggi", "Nessun ballottaggio", "Nessun ballottaggio",
        "Squalificati", "Gila", "Nessun calciatore",
        "Diffidati", "Nessun calciatore", "Nessun calciatore",
        "Infortunati", "Nessun calciatore", "Nessun calciatore",
        "In dubbio", "Nessun calciatore", "Nessun calciatore",
        "Footer del sito", "Privacy",
    ])

    def test_fc_blocks(self):
        blocks = U.fc_blocks(self.PAGE)
        self.assertEqual([(b["home"], b["away"]) for b in blocks], [("Venezia", "Inter"), ("Genoa", "Juventus"), ("Milan", "Bologna")])
        self.assertEqual(blocks[1]["modules"], ["3-5-2", "3-5-2"])
        self.assertEqual(blocks[1]["updated"], "28/10/2026 - 09:10")

    def test_fc_parse(self):
        r = U.fc_parse(self.PAGE, self.rosa)
        self.assertEqual(r["Lucumì"]["stato"], "titolare")
        self.assertEqual(r["Lucumì"]["pct"], 80)
        self.assertFalse(r["Lucumì"]["match"]["casa"])
        self.assertEqual(r["Lucumì"]["match"]["home"], "Genoa")
        self.assertEqual(r["Koopmeiners"]["stato"], "panchina")
        self.assertEqual(r["Koopmeiners"]["pct"], 40)
        self.assertEqual(r["Vitinha O."]["flags"], ["ballottaggio"])
        self.assertEqual(r["Vitinha O."]["partner"], "Ekuban")
        self.assertEqual(r["Akanji"]["partner"], "Bastoni")
        self.assertEqual(r["Bastoni"]["flags"], ["ballottaggio", "diffidato"])
        self.assertEqual(r["Jones C."]["stato"], "indisponibile")
        self.assertIn("adduttori", r["Jones C."]["note"])
        self.assertEqual(r["Gila"]["stato"], "squalificato")
        self.assertEqual(r["Zortea"]["stato"], "assente")        # Bologna presente, Zortea non nelle probabili
        self.assertEqual(r["Modric"]["stato"], "panchina")
        self.assertNotIn("Diao", r)                              # il Como non è in questa pagina
        self.assertEqual(r["Woltemade"]["stato"], "titolare")

    def test_diff_probabili(self):
        rosa = [{"nome": "A", "squadra": "X"}, {"nome": "B", "squadra": "Y"}, {"nome": "C", "squadra": "Z"}]
        old = {"A": {"stato": "titolare", "pct": 80, "flags": []}, "B": {"stato": "titolare", "pct": 70, "flags": []}}
        new = {"A": {"stato": "titolare", "pct": 60, "flags": []}, "B": {"stato": "panchina", "pct": 40, "flags": []},
               "C": {"stato": "titolare", "pct": 90, "flags": []}}
        ch = U.diff_probabili(old, new, rosa, NOW)
        self.assertEqual([c["nome"] for c in ch], ["A", "B"])  # A: -20 punti; B: cambia stato; C: prima volta
        same = {"A": dict(old["A"], note="cambiata", match={"x": 1})}
        self.assertEqual(U.diff_probabili({"A": old["A"]}, same, rosa[:1], NOW), [])  # nota e partita non contano
        self.assertEqual(U.diff_probabili(None, new, rosa, NOW), [])

    def test_run_offline(self):
        out = U.run(self.rosa, None, do_news=False, do_fc=False)
        self.assertEqual(len(out["rosa"]), 25)
        self.assertEqual(out["news"], [])


if __name__ == "__main__":
    unittest.main()
