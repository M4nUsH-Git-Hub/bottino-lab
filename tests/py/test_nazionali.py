"""Test delle convocazioni in nazionale: python -m unittest discover -s tests/py"""
import os
import sys
import unittest
from datetime import date, datetime, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "fanta"))
import nazionali as N  # noqa: E402

# Wikitext di prova con la stessa struttura delle pagine di Wikipedia (dati inventati).
PLAYER = """{{Short description|Italian footballer}}
{{Infobox football biography
| name = Alessandro Bastoni
| fullname = Alessandro Bastoni
| currentclub = [[Inter Milan]]
| nationalyears1 = 2015–2016 | nationalteam1 = [[Italy national under-17 football team|Italy U17]] | nationalcaps1 = 8 | nationalgoals1 = 0
| nationalyears2 = 2019–2021 | nationalteam2 = [[Italy national under-21 football team|Italy U21]] | nationalcaps2 = 12 | nationalgoals2 = 1
| nationalyears3 = 2020– | nationalteam3 = [[Italy national football team|Italy]] | nationalcaps3 = 40 | nationalgoals3 = 2
}}
'''Alessandro Bastoni''' is an Italian footballer."""

TEAM = """{{Infobox national football team}}
==Results and fixtures==
===2026===
{{Football box collapsible
|round = [[2026–27 UEFA Nations League A|2026–27 UEFA Nations League]]
|date = {{Start date|2026|10|14|df=y}}
|time = 20:45
|team1 = {{fb-rt|ITA}}
|score = 3–0
|report = [https://x Report]
|team2 = {{fb|EST}}
|goals1 = [[Mateo Retegui|Retegui]] {{goal|12|pen.|50}}<br>[[Alessandro Bastoni|Bastoni]] {{goal|77}}
|location = [[Udine]]
}}
{{Football box collapsible
|round = 2026–27 UEFA Nations League
|date = {{Start date|2026|11|12|df=y}}
|time = 20:45
|team1 = {{fb-rt|ITA}}
|score = v
|team2 = {{fb|FRA}}
|location = [[Milan]]
}}
{{Football box collapsible
|round = 2026–27 UEFA Nations League
|date = {{Start date|2026|11|15|df=y}}
|time = 20:45
|team1 = {{fb-rt|BEL}}
|score = v
|team2 = {{fb|ITA}}
|location = [[Brussels]]
}}
{{Football box collapsible
|round = Friendly
|date = {{Start date|2027|3|26|df=y}}
|team1 = {{fb-rt|ITA}}
|score = v
|team2 = {{fb|ESP}}
}}
==Players==
===Current squad===
The following players were called up for the [[2026–27 UEFA Nations League]] matches against {{fb|FRA}} and {{fb|BEL}} on 12 and 15 November 2026.<br>
''Caps and goals correct as of 14 October 2026, after the match against {{fb|EST}}.''
{{nat fs g start}}
{{nat fs g player|no=1|pos=GK|name=[[Guglielmo Vicario]]|caps=10|goals=0|club=[[Juventus F.C.|Juventus]]|clubnat=ITA}}
{{nat fs g player|no=23|pos=DF|name=[[Alessandro Bastoni]]|caps=40|goals=2|club=[[Inter Milan|Inter]]|clubnat=ITA}}
{{nat fs end}}
===Recent call-ups===
The following players have also been called up within the last twelve months.
{{nat fs start}}
{{nat fs player|pos=FW|name=[[Matteo Politano]]|caps=20|goals=3|club=[[SSC Napoli|Napoli]]|clubnat=ITA|latest=v. {{fb|FRA}}, 12 November 2026 {{sup|INJ}}}}
{{nat fs player|pos=DF|name=[[Nadir Zortea]]|caps=2|goals=0|club=[[Bologna FC 1909|Bologna]]|clubnat=ITA|latest=v. {{fb|EST}}, 14 October 2026}}
{{nat fs end}}
==Records==
"""

NOW = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)
TODAY = NOW.date()


class TestNazionali(unittest.TestCase):
    def test_infobox_and_team_choice(self):
        ib = N.infobox(PLAYER)
        self.assertTrue(N.club_ok(ib["club"], "Inter"))
        self.assertFalse(N.club_ok(ib["club"], "Milan"))
        t = N.pick_team(ib["teams"])
        self.assertEqual(t["page"], "Italy national football team")
        self.assertEqual((t["level"], t["current"], t["caps"]), ("A", True, 40))

    def test_infobox_new_field_names(self):
        wt = PLAYER.replace("currentclub", "current_club").replace("nationalteam", "national_team").replace("nationalyears", "national_years").replace("nationalcaps", "national_caps")
        ib = N.infobox(wt)
        self.assertTrue(N.club_ok(ib["club"], "Inter"))
        self.assertEqual(N.pick_team(ib["teams"])["caps"], 40)

    def test_youth_only(self):
        t = N.pick_team([{"page": "Italy national under-21 football team", "shown": "Italy U21", "years": "2024–", "open": True}])
        self.assertEqual(t["level"], "giovanile")

    def test_parse_team(self):
        t = N.parse_team(TEAM, TODAY)
        self.assertEqual(t["code"], "ITA")
        self.assertEqual(t["squad_dates"], ["2026-11-12", "2026-11-15"])
        self.assertEqual([r["name"] for r in t["squad"]], ["Guglielmo Vicario", "Alessandro Bastoni"])
        self.assertEqual(t["recent"][0]["codes"], ["INJ"])
        self.assertEqual(t["recent"][0]["latest_date"], "2026-11-12")
        self.assertEqual(len(t["fixtures"]), 4)
        self.assertEqual(t["fixtures"][0]["comp"], "Nations League")
        self.assertEqual(t["fixtures"][3]["comp"], "Amichevole")
        w = N.window(t["fixtures"], TODAY)
        self.assertEqual([f["date"] for f in w], ["2026-11-12", "2026-11-15"])

    def _st(self, wiki, full, today=TODAY, prev=None, current=True):
        t = N.parse_team(TEAM, today)
        info = {"wiki": wiki, "full": full, "team": {"page": "Italy national football team", "current": current, "shown": "Italy", "years": "2020–"}}
        return N.status_for(info, t, today, prev)

    def test_statuses(self):
        b = self._st("Alessandro Bastoni", "Alessandro Bastoni")
        self.assertEqual(b["status"], "convocato")
        self.assertEqual(b["return"], "2026-11-15")
        self.assertFalse(b["long_trip"])
        self.assertEqual([f["home"] for f in b["fixtures"]], ["Italia", "Belgio"])
        self.assertEqual(self._st("Matteo Politano", "Matteo Politano")["status"], "lasciato")
        self.assertIn("infortunio", self._st("Matteo Politano", "Matteo Politano")["note"])
        self.assertEqual(self._st("Nadir Zortea", "Nadir Zortea")["status"], "non_convocato")
        self.assertEqual(self._st("Giorgio Scalvini", "Giorgio Scalvini")["status"], "non_convocato")

    def test_waiting_for_list(self):
        old = TEAM.replace("on 12 and 15 November 2026", "on 11 and 14 October 2026")
        t = N.parse_team(old, TODAY)
        info = {"wiki": "Alessandro Bastoni", "full": "Alessandro Bastoni", "team": {"page": "x", "current": True}}
        self.assertEqual(N.status_for(info, t, TODAY, None)["status"], "in_attesa")

    def test_no_break(self):
        r = self._st("Alessandro Bastoni", "Alessandro Bastoni", today=date(2026, 12, 10))
        self.assertEqual(r["status"], "nessuna_sosta")
        self.assertEqual(r["next_date"], "2027-03-26")

    def test_goals_and_caps(self):
        self.assertEqual(N.goals_of("[[Mateo Retegui|Retegui]] {{goal|12|pen.|50}}<br>[[Alessandro Bastoni|Bastoni]] {{goal|77}}",
                                    "Mateo Retegui", "Mateo Retegui"), 2)
        played = TEAM.replace("|score = v\n|team2 = {{fb|FRA}}", "|score = 1–1\n|team2 = {{fb|FRA}}\n|goals1 = [[Alessandro Bastoni|Bastoni]] {{goal|30}}")
        t = N.parse_team(played.replace("|caps=40|", "|caps=41|"), date(2026, 11, 13))
        info = {"wiki": "Alessandro Bastoni", "full": "Alessandro Bastoni", "team": {"page": "x", "current": True}}
        r = N.status_for(info, t, date(2026, 11, 13), {"window": "2026-11-12", "caps_base": 40})
        self.assertEqual((r["played"], r["scored"]), (1, 1))

    def test_dates(self):
        self.assertEqual(N.dates_in("on 5, 9 and 13 October 2026"), [date(2026, 10, 5), date(2026, 10, 9), date(2026, 10, 13)])
        self.assertEqual(N.dates_in("on November 14, 2026"), [date(2026, 11, 14)])
        self.assertEqual(N.dates_in("against Haiti on November 14 and 17, 2026."), [date(2026, 11, 14), date(2026, 11, 17)])
        self.assertEqual(N.dates_in("against Slovenia on 13 November and Scotland on 16 November 2026."), [date(2026, 11, 13), date(2026, 11, 16)])
        self.assertEqual(N.dates_in("against England and Norway on 13 and 17 November respectively.", 2026), [date(2026, 11, 13), date(2026, 11, 17)])
        self.assertEqual(N.dates_in("for the 2027 Under-21 Championship qualification matches against Finland on 25, 30 September and 6 October 2026; respectively."),
                         [date(2026, 9, 25), date(2026, 9, 30), date(2026, 10, 6)])
        self.assertEqual(N.months_in("matches in November 2026."), [(2026, 11)])
        self.assertEqual(N.opponents_in("matches against Israel and the Republic of Ireland, on 14 and 17 November 2026."), ["Israel", "Republic of Ireland"])

    def test_intro_with_comment_and_ref(self):
        wt = TEAM.replace("The following players were called up for the [[2026–27 UEFA Nations League]] matches against {{fb|FRA}} and {{fb|BEL}} on 12 and 15 November 2026.<br>\n''Caps and goals correct as of 14 October 2026, after the match against {{fb|EST}}.''",
                          "<!--NOTE: PLEASE LEAVE THE SQUAD DATA IN PROSE. THANKS -->\nThe following players were called up for the matches in November 2026.<ref>{{cite web|title=x}}</ref> Caps and goals correct as of 14 October 2026.")
        t = N.parse_team(wt, TODAY)
        self.assertEqual(t["squad_months"], [(2026, 11)])

    def test_senior_of(self):
        self.assertEqual(N.senior_of("Spain national under-21 football team"), "Spain national football team")
        self.assertIsNone(N.senior_of("Spain national football team"))

    def test_youth_called_by_senior(self):
        orig_r, orig_w = N.resolve, N.wikitexts
        u21 = TEAM.replace("[[Alessandro Bastoni]]", "[[Someone Else]]")
        try:
            N.resolve = lambda p, ov=None: {"wiki": "Alessandro Bastoni", "full": "Alessandro Bastoni",
                                            "team": {"page": "Italy national under-21 football team", "current": True, "level": "giovanile"}}
            N.wikitexts = lambda titles: {t: (t, u21 if "under" in t else TEAM) for t in titles}
            out = N.run([{"nome": "Bastoni", "squadra": "Inter"}], {}, now=NOW, do_news=False)
        finally:
            N.resolve, N.wikitexts = orig_r, orig_w
        p = out["players"]["Bastoni"]
        self.assertEqual((p["status"], p["nat"]), ("convocato", "Italia"))
        self.assertIn("maggiore", p["note"])

    def test_opponents_each_date(self):
        self.assertEqual(N.opponents_in("matches against Slovenia on 13 November and Scotland on 16 November 2026."), ["Slovenia", "Scotland"])

    def test_window_from_squad_text(self):
        wt = TEAM.split("==Players==")[1]
        wt = "==Players==" + wt.replace("against {{fb|FRA}} and {{fb|BEL}} on 12 and 15 November 2026", "against Chile on 13 and 17 November 2026")
        t = N.parse_team(wt, TODAY)
        t["code"], t["name"] = "COL", "Colombia"
        w, from_cal = N.team_window(t, TODAY)
        self.assertFalse(from_cal)
        self.assertEqual([(f["date"], f["t2"]) for f in w], [("2026-11-13", "Cile"), ("2026-11-17", "Cile")])
        info = {"wiki": "Alessandro Bastoni", "full": "Alessandro Bastoni", "team": {"page": "x", "current": True}}
        self.assertEqual(N.status_for(info, t, TODAY, None)["status"], "convocato")

    def test_run_offline(self):
        orig_r, orig_w = N.resolve, N.wikitexts
        try:
            N.resolve = lambda p, ov=None: {"wiki": "Alessandro Bastoni", "full": "Alessandro Bastoni",
                                            "team": {"page": "Italy national football team", "current": True, "level": "A"}}
            N.wikitexts = lambda titles: {t: (t, TEAM) for t in titles}
            prev = {"parser": N.PARSER_VERSION, "players": {"Bastoni": {"status": "in_attesa"}}}
            out = N.run([{"nome": "Bastoni", "squadra": "Inter"}], prev, now=NOW, do_news=False)
        finally:
            N.resolve, N.wikitexts = orig_r, orig_w
        p = out["players"]["Bastoni"]
        self.assertEqual((p["status"], p["nat"], p["label"]), ("convocato", "Italia", "Convocato"))
        self.assertEqual(out["changes"][0]["a"], "Convocato")


if __name__ == "__main__":
    unittest.main()
