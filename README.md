# Grundschulzeugnis-Generator

Eine reine **Frontend-Website** (kein Server, kein Build-Schritt), mit der man
Grundschulzeugnisse als PDF erzeugt:

1. **Excel-Vorlage herunterladen** – eine `.xlsx`-Datei (öffnet in Numbers/Excel).
2. **Ausfüllen** mit den Zeugnisdaten.
3. **Hochladen** – das Zeugnis wird als Vorschau dargestellt.
4. **PDF herunterladen** oder direkt **drucken**.

Alle Daten bleiben im Browser – es wird nichts hochgeladen oder gespeichert.

### Gedachter Ablauf

Die **Schulleitung** erstellt die Vorlage einmal: trägt in die Spalten *Fach /
Kompetenz / Fähigkeit* den festen Lehrplan ein und verteilt die Datei. Die
**Lehrkraft** trägt dann nur noch *Name*, die Spalte *Bewertung* (1–5 oder `*`)
und die Kommentare ein – kein Format-Wissen nötig.

## Lokal ausprobieren

Einfach `index.html` im Browser öffnen. (Wegen des `file://`-Protokolls
funktioniert das direkt; für saubere lokale Tests ggf. einen kleinen Server starten:)

```bash
python3 -m http.server 8000
# dann http://localhost:8000 öffnen
```

## Auf GitHub Pages veröffentlichen

1. Repository auf GitHub anlegen und diese Dateien hochladen:

   ```bash
   git init
   git add .
   git commit -m "Grundschulzeugnis-Generator"
   git branch -M main
   git remote add origin https://github.com/<NUTZER>/<REPO>.git
   git push -u origin main
   ```

2. Auf GitHub: **Settings → Pages → Build and deployment**
   - *Source*: **Deploy from a branch**
   - *Branch*: `main` / `/ (root)` → **Save**

3. Nach kurzer Zeit ist die Seite unter
   `https://<NUTZER>.github.io/<REPO>/` erreichbar.

> Es ist kein Build nötig – die Dateien werden direkt statisch ausgeliefert.

## Excel-Format

Ein Tabellenblatt **„Zeugnis"** mit oben links den Kopfdaten, oben rechts der
Skala-Legende und darunter einer Tabelle (eine Zeile pro **Fähigkeit**):

| A | B | | D | E |
|---|---|---|---|---|
| Name | Jannes Kotowski | | Bewertung | Bedeutung |
| Schuljahr | 2025/2026 | | 1 | sicher |
| Kommentar | Zusammenfassender Kommentar … | | … | … |

*(Leerzeile)*

| Fach | Kompetenz | Fähigkeit | Bewertung | Fachkommentar |
|------|-----------|-----------|-----------|---------------|
| Deutsch | Sprechen und Zuhören | Du gibst Informationen korrekt wieder. | 1 | Jannes arbeitet… |
|  |  | Du beziehst dich auf die Beiträge anderer. | 2 |  |
|  | Lesen | Du liest altersgemäße Texte flüssig. | 3 |  |

Regeln:

- **Leere Zellen bei *Fach* / *Kompetenz*** bedeuten „wie in der Zeile darüber".
- Die Tabelle beginnt an der Zeile, deren erste Zelle exakt **`Fach`** ist.
- **Fachkommentar = ein Feld pro Fach** (in der ersten Zeile des Fachs). Wird
  in einer Fähigkeit ein **`*`** vergeben, **muss** der Fachkommentar dieses
  Fachs ausgefüllt sein – sonst meldet die Seite einen Fehler.
- Zeilenumbrüche in einer Zelle (z. B. im Kommentar) werden übernommen.
- Die **Seitenzahl** ist kein Feld – sie ergibt sich automatisch aus der
  tatsächlichen Seite (laufende Kopfzeile im PDF).

### Bewertungsskala (Spalte `Bewertung`)

| Wert  | Bedeutung            | Darstellung      |
|-------|----------------------|------------------|
| `1`   | sicher               | ● voller Kreis   |
| `2`   | überwiegend          | ◕ ¾-Kreis        |
| `3`   | teilweise            | ◑ ½-Kreis        |
| `4`   | mit Unterstützung    | ◔ ¼-Kreis        |
| `5`   | wird noch erworben   | →                |
| `"*"` | siehe Kommentar      | *                |

## Dateien

| Datei                   | Zweck                                  |
|-------------------------|----------------------------------------|
| `index.html`            | Oberfläche                             |
| `styles.css`            | Layout & Druck-/PDF-Stile              |
| `app.js`                | Logik: Vorlage, Upload, Rendern, PDF   |
| `GKS-Logo.png`          | Schul-Logo (oben rechts in der Kopfzeile) |
| `zeugnis-vorlage.xlsx`  | **Ausfüllbare Vorlage** mit allen GKS-Fächern/Kompetenzen (Download-Button) |
| `beispiel-zeugnis.xlsx` | Kurzes, ausgefülltes Excel-Beispiel zum Testen |

> Der Button „Excel-Vorlage herunterladen" liefert `zeugnis-vorlage.xlsx`.
> Um Fächer/Kompetenzen zu ändern, einfach diese Datei in Excel/Numbers
> bearbeiten und ersetzen – kein Code nötig. Alternativ lässt sie sich aus
> `scripts/make_template.py` (openpyxl) neu erzeugen.

> Das Logo wird über `GKS-Logo.png` eingebunden. Zum Austauschen einfach die
> Datei gleichen Namens ersetzen (oder den Dateinamen in `app.js` anpassen).

Die PDF-Erzeugung nutzt [html2pdf.js](https://github.com/eKoopmans/html2pdf.js),
das Lesen/Schreiben der Excel-Dateien [SheetJS](https://sheetjs.com/) – beide
via CDN. Alternativ erzeugt der **Drucken**-Knopf über den Browser-Dialog
„Als PDF speichern" eine besonders saubere, vektorbasierte PDF.
