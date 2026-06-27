# Grundschulzeugnis-Generator

Eine reine **Frontend-Website** (kein Server, kein Build-Schritt), mit der man
Grundschulzeugnisse als PDF erzeugt:

1. **Vorlage herunterladen** – eine JSON-Datei.
2. **Ausfüllen** mit den Zeugnisdaten.
3. **Hochladen** – das Zeugnis wird als Vorschau dargestellt.
4. **PDF herunterladen** oder direkt **drucken**.

Alle Daten bleiben im Browser – es wird nichts hochgeladen oder gespeichert.

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

## JSON-Format

```jsonc
{
  "name": "Jannes Kotowski",   // Name des Kindes
  "schuljahr": "2025/2026",
  "seite": 3,                   // Seitenzahl in der Kopfzeile (optional)
  "faecher": [
    {
      "name": "Deutsch",
      "kompetenzen": [
        {
          "name": "Sprechen und Zuhören",   // erscheint gedreht links
          "subkompetenzen": [
            { "text": "Du gibst Informationen korrekt wieder.", "bewertung": 1 }
          ]
        }
      ],
      "kommentar": "Optionaler Kommentar zum Fach."
    }
  ],
  "kommentar": "Zusammenfassender Kommentar zum Schuljahr."
}
```

### Bewertungsskala (`bewertung`)

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
| `beispiel-zeugnis.json` | Ausgefülltes Beispiel zum Testen       |

> Das Logo wird über `GKS-Logo.png` eingebunden. Zum Austauschen einfach die
> Datei gleichen Namens ersetzen (oder den Dateinamen in `app.js` anpassen).

Die PDF-Erzeugung nutzt [html2pdf.js](https://github.com/eKoopmans/html2pdf.js)
(via CDN). Alternativ erzeugt der **Drucken**-Knopf über den Browser-Dialog
„Als PDF speichern" eine besonders saubere, vektorbasierte PDF.
