# ⛏️ Minecraft-Stream-Bingo

Bingo-Karte für Twitch: Jedes Event (Follow, Bits, Dono, Sub, Subgift, Raid) würfelt eine neue
Minecraft-Aufgabe auf die Karte. Du hakst erledigte Aufgaben per Klick ab. Eine komplette Reihe,
Spalte oder Diagonale = **BINGO!**

Alle Aufgaben sind in der **Overworld** machbar (kein Nether, kein End).
Ausgelegt auf Minecraft Java 1.21+ (Prüfungskammer, Böe usw.).

## Start

1. [Node.js](https://nodejs.org) installieren (LTS-Version reicht, keine weiteren Pakete nötig).
2. `start.bat` doppelklicken (oder `node server.js` im Ordner ausführen).
3. Steuerung im Browser öffnen: **http://localhost:3000/**

Der Spielstand wird in `data/state.json` gespeichert und bleibt nach einem Neustart erhalten.

## In OBS einblenden

Quelle hinzufügen → **Browser** → URL eintragen:

| Ansicht | URL | Größe (Vorschlag) |
|---|---|---|
| Bingo-Karte | `http://localhost:3000/overlay.html` | 900 × 900 |
| Liste offener Aufgaben | `http://localhost:3000/overlay.html?mode=list` | 500 × 700 |

Der Hintergrund ist transparent. Neue Aufgaben werden oben kurz als Pop-up eingeblendet.

Optionen (an die URL anhängen, mit `&` verbinden):

- `toast=0` – kein Pop-up bei neuen Aufgaben
- `title=Mein%20Bingo` – eigene Überschrift
- `done=1` – Liste zeigt auch erledigte Aufgaben (durchgestrichen)
- `max=6` – Liste zeigt höchstens 6 Einträge

## Bedienung (http://localhost:3000/)

- **Event auslösen:** Name und ggf. Menge (Bits, €, Anzahl Subgifts, Raid-Zuschauer) eintragen und Button klicken.
- **Feld anklicken** = erledigt / nicht erledigt.
- 🎲 = Aufgabe neu würfeln (gleiche Schwierigkeit), ✕ = Aufgabe entfernen.
- Ist die Karte voll, landen neue Aufgaben in der **Warteschlange**. Entfernst du eine Aufgabe, rückt die nächste nach.
- **Neue Karte** übernimmt alle offenen Aufgaben auf eine frische Karte.

## Welches Event gibt welche Aufgabe?

Standard (änderbar in `config.json`):

| Event | Schwierigkeit |
|---|---|
| Follow | Leicht (pro Name nur einmal, gegen Follow-Spam) |
| Bits | Leicht |
| Viele Bits (ab 1000) | Schwer |
| Dono | Mittel |
| Große Dono (ab 10 €) | Schwer |
| Sub | Mittel |
| Subgift | Mittel, ab 5 Subs auf einmal Schwer |
| Raid | Raid-Challenge (z. B. „Baue ein Denkmal für *Raider*“) |

In `config.json` kannst du die Grenzen (`thresholds`), die Zuordnung (`events`, `null` = Event aus),
die Kartengröße (`cardSize`: 3, 4 oder 5) und das freie Mittelfeld (`freeCenter`) einstellen.
Grenzen und Zuordnung werden sofort übernommen; Kartengröße gilt ab der nächsten neuen Karte.
Server-Port/Host greifen erst nach einem Neustart.

## Aufgaben bearbeiten

Alle Aufgaben stehen in `aufgaben.json`, sortiert nach `leicht`, `mittel`, `schwer`, `raid`.
Einfach Zeilen hinzufügen oder löschen – wird beim nächsten Event automatisch neu eingelesen.
`{user}` wird durch den Namen ersetzt (ohne Namen: „den Raid“). Kurze Texte sehen auf der Karte am besten aus.

Eine Aufgabe wiederholt sich erst, wenn alle anderen ihrer Stufe schon einmal dran waren.

## Automatisch auslösen (optional, z. B. mit Streamer.bot)

Jedes Event lässt sich per einfacher URL auslösen:

```
http://localhost:3000/api/event?type=follow&user=NAME
http://localhost:3000/api/event?type=bits&user=NAME&amount=500
http://localhost:3000/api/event?type=dono&user=NAME&amount=12.50
http://localhost:3000/api/event?type=sub&user=NAME
http://localhost:3000/api/event?type=subgift&user=NAME&amount=5
http://localhost:3000/api/event?type=raid&user=NAME&amount=42
```

**Streamer.bot:** Pro Event eine Action anlegen → Sub-Action *Core → Network → Fetch URL* →
URL von oben, Platzhalter durch Streamer.bot-Variablen ersetzen, z. B.
`http://localhost:3000/api/event?type=bits&user=%user%&amount=%bits%`.
Dann der Action den passenden Trigger geben (Twitch Follow / Cheer / Sub / Resub / Gift Sub / Raid,
für Donos den Tip-Trigger von StreamElements, Streamlabs o. Ä.).

> ⚠️ Die genauen Variablennamen (z. B. `%bits%`, `%viewers%`, Betrag bei Donos) bitte in Streamer.bot
> beim jeweiligen Trigger nachsehen – sie unterscheiden sich je nach Trigger.
> Bei Gift-Bombs feuert Twitch oft zusätzlich einzelne Gift-Sub-Events – nur **einen** der beiden
> Trigger verbinden, sonst gibt es doppelt Aufgaben.

Kommt ein Event unter der Mindestgrenze (`minBits`, `minDono`, `minRaidViewers`), wird es ignoriert.
