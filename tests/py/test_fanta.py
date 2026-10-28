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

    def test_fc_parse(self):
        text = """Genoa - Juventus
        Titolari
        Vicario 95% Lucumì 80% Koopmeiners 75% Woltemade 70%
        Panchina
        Openda 30%
        Ballottaggi
        Woltemade 70% Openda 30%
        Indisponibili
        Yildiz
        Inter - Atalanta
        Bastoni 90% Jones C. 40%
        In dubbio
        Scalvini
        Squalificati
        Akanji"""
        players = [p for p in self.rosa if p["nome"] in ("Lucumì", "Woltemade", "Jones C.", "Scalvini", "Akanji", "Pulisic")]
        r = U.fc_parse(text, players)
        self.assertEqual(r["Lucumì"], {"stato": "titolare", "pct": 80, "flags": []})
        self.assertEqual(r["Woltemade"]["stato"], "titolare")
        self.assertIn("ballottaggio", r["Woltemade"]["flags"])
        self.assertEqual(r["Scalvini"]["stato"], "dubbio")
        self.assertEqual(r["Akanji"]["stato"], "squalificato")
        self.assertNotIn("Pulisic", r)

    def test_diff_probabili(self):
        rosa = [{"nome": "A", "squadra": "X"}, {"nome": "B", "squadra": "Y"}, {"nome": "C", "squadra": "Z"}]
        old = {"A": {"stato": "titolare", "pct": 80, "flags": []}, "B": {"stato": "titolare", "pct": 70, "flags": []}}
        new = {"A": {"stato": "titolare", "pct": 60, "flags": []}, "B": {"stato": "panchina", "pct": 40, "flags": []},
               "C": {"stato": "titolare", "pct": 90, "flags": []}}
        ch = U.diff_probabili(old, new, rosa, NOW)
        self.assertEqual([c["nome"] for c in ch], ["A", "B"])  # A: -20 punti; B: cambia stato; C: prima volta
        self.assertEqual(U.diff_probabili(None, new, rosa, NOW), [])

    def test_run_offline(self):
        out = U.run(self.rosa, None, do_news=False, do_fc=False)
        self.assertEqual(len(out["rosa"]), 25)
        self.assertEqual(out["news"], [])


if __name__ == "__main__":
    unittest.main()
