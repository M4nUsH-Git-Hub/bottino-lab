"""Test della raccolta dati partite: python -m unittest discover -s tests/py"""
import os
import sys
import unittest
from datetime import datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "match"))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "fanta"))
import matchdata as M  # noqa: E402

ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
NOW = datetime(2026, 11, 4, 12, 0, tzinfo=timezone.utc)
LENS = {"id": 546, "name": "Racing Club de Lens", "shortName": "Lens", "tla": "RCL"}
COMO = {"id": 7397, "name": "Como 1907", "shortName": "Como", "tla": "COM"}
PSG = {"id": 524, "name": "Paris Saint-Germain FC", "shortName": "PSG", "tla": "PSG"}


def match(mid, day, home, away, ft=None, ht=None, comp="FL1", status="FINISHED"):
    m = {"id": mid, "utcDate": f"{day}T19:00:00Z", "status": status, "homeTeam": home, "awayTeam": away,
         "score": {"fullTime": {"home": ft[0], "away": ft[1]} if ft else {"home": None, "away": None},
                   "halfTime": {"home": ht[0], "away": ht[1]} if ht else {"home": None, "away": None}}, "_comp": comp}
    return m


class TestMatch(unittest.TestCase):
    def test_build(self):
        ms = [
            match(1, "2026-10-25", LENS, PSG, (1, 2), (1, 0)),
            match(2, "2026-10-21", COMO, LENS, (0, 0), (0, 0), comp="CL"),
            match(3, "2026-11-04", LENS, COMO, comp="CL", status="TIMED"),
            match(4, "2026-11-08", PSG, LENS, status="SCHEDULED"),
        ]
        standings = {"FL1": [{"team": {"id": 546}, "position": 4, "points": 20, "playedGames": 10, "goalDifference": 6}]}
        teams, fixtures = M.build(ms, standings, {"CL": "UEFA Champions League", "FL1": "Ligue 1"}, NOW)
        lens = teams[546]
        self.assertEqual(lens["matches"][0], ["2026-10-25", "FL1", 1, "PSG", 1, 2, 1, 0])
        self.assertEqual(lens["matches"][1], ["2026-10-21", "CL", 0, "Como", 0, 0, 0, 0])
        self.assertEqual([n[1] for n in lens["next"]], ["CL", "FL1"])
        self.assertEqual(lens["pos"]["position"], 4)
        self.assertEqual(len(fixtures), 2)
        self.assertEqual(fixtures[0]["compName"], "UEFA Champions League")
        self.assertEqual((fixtures[0]["home"], fixtures[0]["away"]), (546, 7397))

    def test_h2h_perspective(self):
        resp = {"matches": [
            {"utcDate": "2025-09-01T19:00:00Z", "status": "FINISHED", "homeTeam": {"id": 7397}, "awayTeam": {"id": 546},
             "competition": {"code": "CL"}, "score": {"fullTime": {"home": 2, "away": 1}, "halfTime": {"home": 1, "away": 1}}}]}
        rows = M.h2h_rows(resp, 546)  # Lens in casa oggi: gol del Lens per primi
        self.assertEqual(rows, [["2025-09-01", "CL", 1, 2, 1, 1]])

    def test_team_terms_with_italian_names(self):
        aliases = M.load_aliases(os.path.join(ROOT, "docs", "data", "aliases.json"))
        lyon = {"short": "Lyon", "name": "Olympique Lyonnais"}
        self.assertIn("lione", M.team_terms(lyon, aliases))
        self.assertIn("lyon", M.team_terms(lyon, aliases))

    def test_common_name(self):
        self.assertEqual(M.common_name({"short": "RC Lens", "name": "Racing Club de Lens"}), "Lens")
        self.assertEqual(M.common_name({"short": "Como 1907", "name": "Como 1907"}), "Como")
        self.assertEqual(M.common_name({"short": "Man City", "name": "Manchester City FC"}), "Man City")

    def test_alerts(self):
        cat, al = M.alerts_of(M.F.norm("Como, Fabregas pensa al turnover contro il Lens"))
        self.assertIn("turnover", al)
        cat, al = M.alerts_of(M.F.norm("Lens, infortunio per il capitano: salta il Como"))
        self.assertEqual(cat, "infortunio")

    def test_absences_attach(self):
        teams = {1: {"short": "Inter", "name": "FC Internazionale Milano"}, 2: {"short": "Como", "name": "Como 1907"}}
        M.attach_absences(teams, {"Inter": {"infortunati": [{"nome": "Jones C.", "nota": "adduttori"}]}, "Como": {"infortunati": []}})
        self.assertEqual(teams[1]["absences"]["infortunati"][0]["nome"], "Jones C.")
        self.assertIn("absences", teams[2])

    def test_absences_resolved_with_squads(self):
        teams = {1: {"short": "Napoli", "name": "SSC Napoli", "squad": ["Vanja Milinković-Savić", "Rasmus Højlund"]},
                 2: {"short": "Lazio", "name": "SS Lazio", "squad": ["Mattia Zaccagni"]}}
        info = {"Napoli": {"avversario": "Lazio", "infortunati": [], "dubbio": [],
                           "da_verificare": [{"nome": "Milinkovic-Savic V.", "nota": "", "tipo": "dubbio"},
                                             {"nome": "Zaccagni", "nota": "", "tipo": "infortunati"},
                                             {"nome": "Sconosciuto", "nota": "", "tipo": "infortunati"}]},
                "Lazio": {"avversario": "Napoli", "infortunati": [], "dubbio": [], "da_verificare": []}}
        M.attach_absences(teams, info)
        self.assertEqual([x["nome"] for x in teams[1]["absences"]["dubbio"]], ["Milinkovic-Savic V."])
        self.assertEqual([x["nome"] for x in teams[1]["absences"]["da_verificare"]], ["Sconosciuto"])
        self.assertEqual(teams[1]["absences"]["infortunati"], [])   # Zaccagni è della Lazio, non del Napoli

    def test_no_token(self):
        out = M.run("", {}, prev={"fixtures": [1], "updated": "x"})
        self.assertFalse(out["source"]["ok"])
        self.assertIn("FOOTBALL_DATA_TOKEN", out["source"]["error"])
        self.assertEqual(out["fixtures"], [1])


if __name__ == "__main__":
    unittest.main()
