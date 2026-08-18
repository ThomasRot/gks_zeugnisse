/* ============================================================
   Grundschulzeugnis-Generator – Logik (Frontend only)
   ============================================================ */

"use strict";

/* Die Excel-Vorlage verteilt die Schulleitung; hier werden nur ausgefüllte
   Dateien verarbeitet (einzeln oder als Stapel).
   Bewertungsskala: 1=sicher, 2=überwiegend, 3=teilweise, 4=mit Unterstützung,
   5=„→" (wird noch erworben), "*"=siehe Kommentar. */

/* ============================================================
   Validierung
   ============================================================ */
function validate(data) {
  if (typeof data !== "object" || data === null) throw new Error("Die Datei enthält keine gültigen Daten.");
  if (!data.name || !String(data.name).trim()) throw new Error('Der Name des Schülers fehlt (Zelle rechts neben "Name").');
  if (!Array.isArray(data.faecher) || data.faecher.length === 0) {
    throw new Error('Keine Fächer gefunden. Stimmt die Kopfzeile "Fach | Kompetenz | Fähigkeit | Bewertung"?');
  }
  data.faecher.forEach((f, i) => {
    if (!f.name) throw new Error(`Fach #${i + 1}: Name fehlt.`);
    if (!Array.isArray(f.kompetenzen)) throw new Error(`Fach "${f.name}": Kompetenzen fehlen.`);
    const hasStar = f.kompetenzen.some((k) =>
      (k.subkompetenzen || []).some((s) => s.bewertung === "*"));
    if (hasStar && !(f.kommentar && String(f.kommentar).trim())) {
      throw new Error(`Fach "${f.name}": Es wurde "*" vergeben – dann muss die Zeile „Kommentar" ausgefüllt sein.`);
    }
  });
}

/* ============================================================
   Aktionen
   ============================================================ */
/* Normalisiert einen Bewertungswert aus einer Zelle */
function normBewertung(v) {
  if (v === null || v === undefined) return "";
  const s = String(v).trim();
  if (s === "") return "";
  if (s === "*") return "*";
  if (s === "→" || s === "->") return 5;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : s;
}

/* Ermittelt die geschlechtsspezifische Anrede aus dem Feld "Geschlecht".
   Akzeptiert m/w bzw. männlich/weiblich, Junge/Mädchen. Bei fehlender oder
   unbekannter Angabe wird die neutrale Doppelform verwendet. */
function pronoun(geschlecht) {
  const g = String(geschlecht || "").trim().toLowerCase();
  if (["m", "männlich", "maennlich", "junge", "j"].includes(g)) {
    return { subjekt: "Der Schüler", nominativ: "er", possessiv: "seine" };
  }
  if (["w", "weiblich", "mädchen", "maedchen"].includes(g)) {
    return { subjekt: "Die Schülerin", nominativ: "sie", possessiv: "ihre" };
  }
  return { subjekt: "Der Schüler/Die Schülerin", nominativ: "er/sie", possessiv: "seine/ihre" };
}

/* Wandelt die Zeilen einer Excel-Tabelle (Array-of-Arrays) in das Datenmodell um */
function rowsToData(rows) {
  const data = {
    name: "", klasse: "", schuljahr: "", geschlecht: "", faecher: [],
    kommentar: "",            // Allgemeine Beurteilung (Startseite)
    versEntschuldigt: "", versUnentschuldigt: "",
    konferenzbeschluss: "", ortDatum: "",
    ag: "", hsu: "", abschlusssatz: ""
  };
  const isHeader = (r) => String((r && r[0]) || "").trim().toLowerCase() === "fach";

  let i = 0;
  // 1) Metadaten oben bis zur Tabellen-Kopfzeile
  for (; i < rows.length; i++) {
    if (isHeader(rows[i])) { i++; break; }
    const key = String((rows[i] && rows[i][0]) || "").trim().toLowerCase();
    const val = rows[i] && rows[i][1] !== undefined ? rows[i][1] : "";
    if (key === "name") data.name = String(val).trim();
    else if (key === "klasse") data.klasse = String(val).trim();
    else if (key === "schuljahr") data.schuljahr = String(val).trim();
    else if (key.startsWith("geschlecht")) data.geschlecht = String(val).trim();
    else if (key === "kommentar") data.kommentar = String(val);
    else if (key === "ag") data.ag = String(val);
    else if (key === "hsu") data.hsu = String(val);
    else if (key === "abschlusssatz") data.abschlusssatz = String(val);
    else if (key.startsWith("versäumnisse entschuldigt")) data.versEntschuldigt = String(val).trim();
    else if (key.startsWith("versäumnisse unentschuldigt")) data.versUnentschuldigt = String(val).trim();
    else if (key.startsWith("konferenzbeschluss")) data.konferenzbeschluss = String(val).trim();
    else if (key.startsWith("ort")) data.ortDatum = String(val).trim();
  }

  // 2) Tabellenzeilen (mit "fill-down" für Fach/Kompetenz)
  let curFach = null, curKomp = null;
  for (; i < rows.length; i++) {
    const r = rows[i] || [];
    const fachName = String(r[0] || "").trim();
    const kompName = String(r[1] || "").trim();
    const cellC = String(r[2] || "").trim();
    if (!fachName && !kompName && !cellC) continue;

    if (fachName) {
      curFach = { name: fachName, kompetenzen: [], kommentar: "" };
      data.faecher.push(curFach);
      curKomp = null;
    }
    if (!curFach) continue;

    // Fachkommentar-Zeile: Marker "Kommentar" in der Kompetenz-Spalte,
    // der Text steht in einer der Spalten danach
    if (kompName.toLowerCase() === "kommentar") {
      curFach.kommentar = String(r[2] || "").trim() + String(r[3] || "").trim();
      continue;
    }

    if (kompName) {
      curKomp = { name: kompName, subkompetenzen: [] };
      curFach.kompetenzen.push(curKomp);
    }
    if (cellC) {
      if (!curKomp) {
        curKomp = { name: "", subkompetenzen: [] };
        curFach.kompetenzen.push(curKomp);
      }
      curKomp.subkompetenzen.push({ text: cellC, bewertung: normBewertung(r[3]) });
    }
  }
  return data;
}

/* Alle erfolgreich geladenen Zeugnisse: { fileName, data } */
let loadedZeugnisse = [];

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Die Datei konnte nicht gelesen werden."));
    reader.onload = () => resolve(reader.result);
    reader.readAsArrayBuffer(file);
  });
}

function parseZeugnisFile(buf) {
  const wb = XLSX.read(new Uint8Array(buf), { type: "array" });
  const data = rowsToData(pickZeugnisRows(wb));
  validate(data);
  return data;
}

async function handleFiles(files) {
  loadedZeugnisse = [];
  const errors = [];
  for (const file of files) {
    if (!/\.(xlsx|xls)$/.test(file.name.toLowerCase())) {
      errors.push(`${file.name}: keine Excel-Datei (.xlsx)`);
      continue;
    }
    try {
      const data = parseZeugnisFile(await readFileAsArrayBuffer(file));
      loadedZeugnisse.push({ fileName: file.name, data });
    } catch (err) {
      errors.push(`${file.name}: ${err.message}`);
    }
  }

  enableOutput(loadedZeugnisse.length > 0);
  document.getElementById("btn-pdf").textContent =
    loadedZeugnisse.length > 1 ? `⬇️ ${loadedZeugnisse.length} PDFs als ZIP herunterladen` : "⬇️ PDF herunterladen";

  const okNames = loadedZeugnisse.map((z) => z.data.name).join(", ");
  if (errors.length === 0) {
    setMessage(loadedZeugnisse.length === 1
      ? `✓ Geladen: ${okNames}. Jetzt PDF herunterladen.`
      : `✓ ${loadedZeugnisse.length} Zeugnisse geladen: ${okNames}. Jetzt PDFs herunterladen.`, "ok");
  } else {
    const okPart = loadedZeugnisse.length ? `✓ ${loadedZeugnisse.length} geladen (${okNames}) – ` : "";
    setMessage(`${okPart}Fehler bei ${errors.length} Datei(en): ${errors.join(" · ")}`, loadedZeugnisse.length ? "warn" : "error");
  }
}

/* Wählt aus der Arbeitsmappe das richtige Blatt: bevorzugt das mit einer
   "Fach"-Kopfzeile (egal an welcher Position), sonst "Zeugnis", sonst das erste.
   Robust gegen umsortierte/zusätzliche Blätter (z. B. nach Numbers-Export). */
function pickZeugnisRows(wb) {
  const read = (name) => XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "" });
  const hasFach = (rows) => rows.some((r) => String((r && r[0]) || "").trim().toLowerCase() === "fach");
  for (const name of wb.SheetNames) {
    const rows = read(name);
    if (hasFach(rows)) return rows;
  }
  const fallback = wb.SheetNames.indexOf("Zeugnis") >= 0 ? "Zeugnis" : wb.SheetNames[0];
  return read(fallback);
}

/* ============================================================
   PDF-Erzeugung – VEKTOR (jsPDF + AutoTable), echter markierbarer Text
   ============================================================ */

/* gefülltes Polygon aus absoluten Punkten */
function pdfFillPolygon(doc, pts, rgb) {
  doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  const rel = [];
  for (let i = 1; i < pts.length; i++) rel.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  doc.lines(rel, pts[0][0], pts[0][1], [1, 1], "F", true);
}

/* Tortenkreis: f = 1 voll, 0.75, 0.5, 0.25 */
function pdfDrawPie(doc, cx, cy, r, f) {
  doc.setLineWidth(0.25); doc.setDrawColor(0, 0, 0);
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, r, "FD");
  if (f >= 1) { doc.setFillColor(0, 0, 0); doc.circle(cx, cy, r, "F"); doc.circle(cx, cy, r, "S"); return; }
  if (f > 0) {
    const pts = [[cx, cy], [cx, cy - r]];
    const steps = Math.max(2, Math.round(f * 36));
    for (let i = 1; i <= steps; i++) { const t = f * 2 * Math.PI * (i / steps); pts.push([cx + r * Math.sin(t), cy - r * Math.cos(t)]); }
    pdfFillPolygon(doc, pts, [0, 0, 0]);
    doc.circle(cx, cy, r, "S");
  }
}

/* dicker Block-Pfeil, zentriert auf (cx,cy), Gesamtbreite w */
function pdfDrawArrow(doc, cx, cy, w) {
  const h = w * 0.62, x = cx - w / 2, sh = h * 0.22, head = w * 0.5;
  pdfFillPolygon(doc, [
    [x, cy - sh], [x + head, cy - sh], [x + head, cy - h / 2],
    [x + w, cy], [x + head, cy + h / 2], [x + head, cy + sh], [x, cy + sh]
  ], [0, 0, 0]);
}

/* Bewertungssymbol in eine Zelle zeichnen */
function pdfRating(doc, value, cx, cy) {
  if (value === "" || value === null || value === undefined) return;
  if (value === "*") { doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(0, 0, 0); doc.text("*", cx, cy + 2.2, { align: "center" }); return; }
  const num = typeof value === "string" ? value.trim() : value;
  if (num === 5 || num === "5" || num === "→" || num === "->") { pdfDrawArrow(doc, cx, cy, 7); return; }
  const frac = { 1: 1, 2: 0.75, 3: 0.5, 4: 0.25 }[num];
  if (frac === undefined) { doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(0, 0, 0); doc.text("?", cx, cy + 1.5, { align: "center" }); return; }
  pdfDrawPie(doc, cx, cy, 2.7, frac);
}

const LABEL_FS = 8;        // Schriftgröße der gedrehten Beschriftung
const LABEL_GAP = 2.9;     // Abstand der gestapelten Zeilen (über die Spaltenbreite)
const LABEL_MAXLINES = 3;  // passt in ~10mm Spaltenbreite

/* Zerlegt eine Beschriftung in Umbruch-Einheiten: an Leerzeichen UND an
   Bindestrichen. Der Bindestrich bleibt am Ende seiner Einheit (deutsche
   Silbentrennung), sodass lange Komposita wie „Sprachlern-kompetenz" umbrechen
   dürfen und die (gedrehte) Spalte nicht unnötig hoch werden muss.
   `glue` = Trennzeichen vor der Einheit, falls sie in derselben Zeile bleibt. */
function labelAtoms(text) {
  const atoms = [];
  String(text).split(/\s+/).filter(Boolean).forEach((word, wi) => {
    const pieces = [];
    let piece = "";
    for (const ch of word) { piece += ch; if (ch === "-") { pieces.push(piece); piece = ""; } }
    if (piece) pieces.push(piece);
    pieces.forEach((p, pi) => atoms.push({ s: p, glue: pi === 0 ? (wi === 0 ? "" : " ") : "" }));
  });
  return atoms;
}

/* Umbruch, der nie innerhalb einer Einheit (Wort/Silbe) trennt, aber an
   Leerzeichen und Bindestrichen umbrechen darf. */
function wrapWords(doc, text, maxLen) {
  const atoms = labelAtoms(text);
  const lines = [];
  let cur = "";
  for (const a of atoms) {
    const trial = cur ? cur + a.glue + a.s : a.s;
    if (!cur || doc.getTextWidth(trial) <= maxLen) cur = trial;
    else { lines.push(cur); cur = a.s; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/* Mindest-Zeilenlänge (= benötigte Zellenhöhe ohne Padding), damit der Text in
   ≤ maxLines Zeilen passt – ohne eine Einheit zu trennen. Die breiteste Einheit
   (Wort bzw. Silbe bis zum Bindestrich) bestimmt die Mindesthöhe. */
function labelRequiredLen(doc, text, maxLines) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(LABEL_FS);
  const atoms = labelAtoms(text);
  if (!atoms.length) return 0;
  const count = (L) => wrapWords(doc, text, L).length;
  let lo = Math.max.apply(null, atoms.map((a) => doc.getTextWidth(a.s)));
  let hi = doc.getTextWidth(String(text));
  if (count(lo) <= maxLines) return lo;
  for (let it = 0; it < 22; it++) { const mid = (lo + hi) / 2; if (count(mid) <= maxLines) hi = mid; else lo = mid; }
  return hi;
}

/* gedrehte Kompetenz-Beschriftung: wortweiser Umbruch passend zur (ggf.
   gewachsenen) Zellenhöhe, vertikal zentriert. Kein jsPDF-"align" mit Winkel –
   Anker y = Mitte + halbe Textbreite positioniert jede Zeile zuverlässig mittig. */
function pdfRotatedLabel(doc, text, cell) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(LABEL_FS); doc.setTextColor(0, 0, 0);
  const lines = wrapWords(doc, String(text), cell.height - 4);
  const blockW = lines.length * LABEL_GAP;
  let x = cell.x + cell.width / 2 - blockW / 2 + LABEL_GAP * 0.78;
  const cy = cell.y + cell.height / 2;
  lines.forEach((ln) => {
    const tw = doc.getTextWidth(ln);
    doc.text(ln, x, cy + tw / 2, { angle: 90 });
    x += LABEL_GAP;
  });
}

/* Baut das komplette Zeugnis-PDF für einen Datensatz und gibt das jsPDF-Dokument zurück */
function buildPdfDoc(data) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const SIDE = 18, TOP = 21, BOT = 18;
    const CW = PW - 2 * SIDE;
    const name = String(data.name || "");
    const schuljahr = String(data.schuljahr || "");
    const gridStyle = { lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0], font: "helvetica" };

    // ---------- Startseite (offizieller Dokumentkopf) ----------
    {
      // Schulkopf als graue Schrift (analog zur Word-Vorlage), kein Logo
      const HEAD_GRAY = 120;   // Grauton für Überschrift + Untertitel
      let sy0 = 26;
      doc.setFont("helvetica", "bold"); doc.setFontSize(21); doc.setTextColor(HEAD_GRAY, HEAD_GRAY, HEAD_GRAY);
      doc.text("Georg-Kerschensteiner-Schule", PW / 2, sy0, { align: "center" });
      sy0 += 9;
      doc.setFont("helvetica", "normal"); doc.setFontSize(12);
      ["Musikalische Grundschule", "Grundschule des Main-Taunus-Kreises", "Schwalbach am Taunus"].forEach((ln) => {
        doc.text(ln, PW / 2, sy0, { align: "center" }); sy0 += 6;
      });

      // Klasse / Schuljahr + waagerechter Querstrich
      sy0 += 12;
      doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(0, 0, 0);
      doc.text(`Klasse ${data.klasse || ""}`.trim(), SIDE, sy0);
      doc.text(`Schuljahr ${schuljahr}`.trim(), PW - SIDE, sy0, { align: "right" });
      doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2);   // doppelte dünne Linie
      doc.line(SIDE, sy0 + 2.4, PW - SIDE, sy0 + 2.4);
      doc.line(SIDE, sy0 + 2.8, PW - SIDE, sy0 + 2.8);

      // ZEUGNIS (Versalien mit leichtem Sperrsatz) / für
      sy0 += 22;
      doc.setFont("helvetica", "bold"); doc.setFontSize(26);
      doc.text("ZEUGNIS", PW / 2, sy0, { align: "center", charSpace: 1.5 });
      sy0 += 9;
      doc.setFont("helvetica", "normal"); doc.setFontSize(12);
      doc.text("für", PW / 2, sy0, { align: "center" });

      // Name im grau hinterlegten Kasten
      sy0 += 14;
      doc.setFont("helvetica", "bold"); doc.setFontSize(18);
      const nameBoxW = Math.min(CW, Math.max(doc.getTextWidth(name) + 40, 110));
      const nameBoxH = 12;
      doc.setFillColor(217, 217, 217);
      doc.rect((PW - nameBoxW) / 2, sy0 - 8, nameBoxW, nameBoxH, "F");
      doc.setTextColor(0, 0, 0);
      doc.text(name, PW / 2, sy0, { align: "center" });

      // Querstrich unter dem Namensfeld (einfache dünne Linie)
      sy0 += 8;
      doc.setLineWidth(0.2);
      doc.line(SIDE, sy0, PW - SIDE, sy0);

      // Unterer Block (fest am Seitenende verankert): Versäumnisse,
      // Konferenzbeschluss, Ort/Datum, Unterschriften, Kenntnisnahme
      const blockTop = PH - 64;
      let by = blockTop;
      const dash = (v) => (v === "" ? "____" : String(v));
      const e = data.versEntschuldigt, u = data.versUnentschuldigt;
      const gesamt = e !== "" && u !== "" && isFinite(Number(e)) && isFinite(Number(u)) ? String(Number(e) + Number(u)) : "____";
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(0, 0, 0);
      doc.text(`Versäumnisse ${gesamt} Tage (davon ${dash(e)} Tage entschuldigt, ${dash(u)} Tage unentschuldigt).`, SIDE, by);
      by += 6;
      const klasseNum = parseInt(String(data.klasse).trim(), 10);
      const ziel = Number.isFinite(klasseNum) ? `die Jahrgangsstufe ${klasseNum + 1}` : "die nächste Jahrgangsstufe";
      const subj = pronoun(data.geschlecht).subjekt;
      const satz = klasseNum === 1
        ? `${subj} rückt laut Konferenzbeschluss vom ${dash(data.konferenzbeschluss)} in ${ziel} vor.`
        : `${subj} wird laut Konferenzbeschluss vom ${dash(data.konferenzbeschluss)} in ${ziel} versetzt.`;
      doc.text(satz, SIDE, by);
      by += 16;
      // Ort/Datum links auf derselben Zeile wie die Unterschriftslinien
      // (analog zum "Kenntnis genommen"-Block darunter)
      const odW = 58, sGap = 10, sFieldW = (CW - odW - sGap) / 2;
      const sx1 = SIDE + odW, sx2 = sx1 + sFieldW + sGap;
      if (data.ortDatum) { doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(0, 0, 0); doc.text(data.ortDatum, SIDE, by); }
      doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2);
      doc.line(sx1, by, sx1 + sFieldW, by);
      doc.line(sx2, by, sx2 + sFieldW, by);
      doc.setFontSize(8); doc.setTextColor(60, 60, 60);
      doc.text("Klassenlehrer/in", sx1 + sFieldW / 2, by + 4, { align: "center" });
      doc.text("Schulleiter/in", sx2 + sFieldW / 2, by + 4, { align: "center" });
      by += 15;
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(0, 0, 0);
      doc.text("Kenntnis genommen:", SIDE, by);
      const klW = 42, kGap = 10, kFieldW = (CW - klW - kGap) / 2;
      const kx1 = SIDE + klW, kx2 = kx1 + kFieldW + kGap;
      doc.line(kx1, by, kx1 + kFieldW, by);
      doc.line(kx2, by, kx2 + kFieldW, by);
      doc.setFontSize(8); doc.setTextColor(60, 60, 60);
      doc.text("Ort und Datum", kx1 + kFieldW / 2, by + 4, { align: "center" });
      doc.text("Unterschrift eines Erziehungsberechtigten", kx2 + kFieldW / 2, by + 4, { align: "center" });

      // Allgemeine Beurteilung füllt den Raum zwischen Kopf und unterem Block
      let ay = sy0 + 7;
      doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(0, 0, 0);
      doc.text("ALLGEMEINE BEURTEILUNG:", SIDE, ay);
      ay += 5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(60, 60, 60);
      doc.splitTextToSize("(Lernentwicklung, Arbeits- und Sozialverhalten, besondere Fähigkeiten und Schwächen, soziales Verhalten, Bildungswille, Mitarbeit)", CW)
        .forEach((ln) => { doc.text(ln, SIDE, ay); ay += 4.2; });
      ay += 4;
      // Text ggf. verkleinern, damit er über dem unteren Block endet
      const beurteilung = String(data.kommentar || "").trim();
      if (beurteilung) {
        doc.setTextColor(0, 0, 0);
        for (const fs of [10.5, 9.5, 8.5]) {
          const lh = fs * 0.48;
          const lines = [];
          beurteilung.split(/\r?\n/).forEach((para) => {
            doc.setFont("helvetica", "normal"); doc.setFontSize(fs);
            (para === "" ? [""] : doc.splitTextToSize(para, CW)).forEach((ln) => lines.push(ln));
          });
          if (ay + lines.length * lh <= blockTop - 6 || fs === 8.5) {
            let ty = ay;
            lines.forEach((ln) => { if (ty <= blockTop - 6) { doc.text(ln, SIDE, ty); ty += lh; } });
            break;
          }
        }
      }
      doc.addPage();
    }

    // ---------- Legende ----------
    doc.autoTable({
      startY: TOP,
      margin: { left: SIDE, right: SIDE, top: TOP, bottom: BOT },
      theme: "grid",
      styles: Object.assign({}, gridStyle, { halign: "center", valign: "middle", fontSize: 9, fontStyle: "bold", minCellHeight: 8 }),
      body: [["", "", "", ""], ["mit Unterstützung", "teilweise", "überwiegend", "sicher"]],
      columnStyles: { 0: { cellWidth: CW / 4 }, 1: { cellWidth: CW / 4 }, 2: { cellWidth: CW / 4 }, 3: { cellWidth: CW / 4 } },
      didParseCell: (d) => { if (d.row.index === 0) d.cell.styles.minCellHeight = 9; },
      didDrawCell: (d) => {
        if (d.section === "body" && d.row.index === 0) {
          pdfDrawPie(doc, d.cell.x + d.cell.width / 2, d.cell.y + d.cell.height / 2, 2.7, [0.25, 0.5, 0.75, 1][d.column.index]);
        }
      }
    });
    doc.autoTable({
      startY: doc.lastAutoTable.finalY,
      margin: { left: SIDE, right: SIDE, top: TOP, bottom: BOT },
      theme: "grid",
      styles: Object.assign({}, gridStyle, { fontSize: 9, fontStyle: "bold", valign: "middle", cellPadding: { top: 2, bottom: 2, left: 4, right: 4 } }),
      body: [["*    siehe Kommentar", "        Kompetenz wird noch erworben"]],
      columnStyles: { 0: { cellWidth: CW / 2 }, 1: { cellWidth: CW / 2 } },
      didDrawCell: (d) => { if (d.section === "body" && d.column.index === 1) pdfDrawArrow(doc, d.cell.x + 6, d.cell.y + d.cell.height / 2, 6); }
    });
    let y = doc.lastAutoTable.finalY + 7;

    // ---------- Fächer (mit geplanten Seitenumbrüchen) ----------
    /* Umbruch-Regeln:
       1. Die Fachüberschrift steht immer auf derselben Seite wie der Tabellenanfang.
       2. Der Fachkommentar steht immer auf derselben Seite wie das Tabellenende.
       3. Eine Kompetenz wird normalerweise nicht geteilt. Ausnahme: mindestens
          3 Zeilen passen noch auf die aktuelle Seite, mindestens 2 Zeilen bleiben
          für die Folgeseite (keine Einzelzeilen-Waise) und die Kompetenz-
          Beschriftung passt in beide Teile (die Zeilen wachsen dafür ggf. mit).
       4. Notbremse: ist eine Kompetenz höher als eine ganze leere Seite und nicht
          regulär teilbar, wird sie erzwungen geteilt.
       Dafür werden die Zeilenhöhen vorab per Probelauf auf einer überlangen
       Seite gemessen und die Seiten dann segmentweise gerendert. */
    const EPS = 0.7;          // Sicherheitsreserve gegen Rundungsdrift
    const TITLE_H = 8;        // Fachüberschrift + Abstand bis Tabellenstart
    const COMMENT_GAP = 3;    // Abstand Tabelle -> Kommentarkasten
    const fullAvail = PH - BOT - TOP - EPS;
    const cellStyles = () => Object.assign({}, gridStyle, { fontSize: 10, valign: "middle", overflow: "linebreak", cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 } });
    const commentStyles = () => Object.assign({}, gridStyle, { fontSize: 10, valign: "top", overflow: "linebreak", minCellHeight: 20, cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 } });

    (data.faecher || []).forEach((fach) => {
      const hasKomp = (fach.kompetenzen || []).some((k) => k.name && String(k.name).trim());
      const LBL = 10, RAT = 16;
      const columnStyles = hasKomp
        ? { 0: { cellWidth: LBL, fillColor: [247, 247, 247] }, 1: { cellWidth: CW - LBL - RAT }, 2: { cellWidth: RAT, halign: "center" } }
        : { 0: { cellWidth: CW - RAT }, 1: { cellWidth: RAT, halign: "center" } };

      // Eine Gruppe je Kompetenz; L = Mindesthöhe für die gedrehte Beschriftung
      const groups = (fach.kompetenzen || [])
        .filter((k) => (k.subkompetenzen || []).length)
        .map((k) => ({
          label: hasKomp ? String(k.name || "") : "",
          subs: k.subkompetenzen,
          L: hasKomp && k.name && String(k.name).trim() ? labelRequiredLen(doc, k.name, LABEL_MAXLINES) + 5 : 0,
          naturals: []
        }));

      // Natürliche Zeilenhöhen (ohne Label-Mindesthöhe) per Probelauf messen
      if (groups.length) {
        const probe = new jsPDF({ unit: "mm", format: [PW, 4000] });
        const probeBody = [];
        groups.forEach((g) => g.subs.forEach((sub, i) => {
          const row = [];
          if (hasKomp && i === 0) row.push({ content: "", rowSpan: g.subs.length });
          row.push(sub.text);
          row.push("");
          probeBody.push(row);
        }));
        probe.autoTable({ startY: 10, margin: { left: SIDE, right: SIDE }, theme: "grid", styles: cellStyles(), columnStyles, body: probeBody });
        const hs = probe.lastAutoTable.body.map((r) => r.height);
        let idx = 0;
        groups.forEach((g) => { g.naturals = hs.slice(idx, idx + g.subs.length); idx += g.subs.length; });
      }

      // Höhe des Kommentarkastens messen
      const cProbe = new jsPDF({ unit: "mm", format: [PW, 4000] });
      cProbe.autoTable({ startY: 10, margin: { left: SIDE, right: SIDE }, theme: "grid", styles: commentStyles(), columnStyles: { 0: { cellWidth: CW } }, body: [[String(fach.kommentar || "")]] });
      const commentH = cProbe.lastAutoTable.body[0].height;

      // Höhe eines Kompetenz-Teils: Zeilen wachsen gleichmäßig, wenn das Label
      // mehr Platz braucht als die Texte (gleiche Formel wie beim Rendern)
      const partH = (naturals, L) => {
        const per = L / naturals.length;
        return naturals.reduce((a, h) => a + Math.max(h, per), 0);
      };

      // ---- Seiten planen ----
      const pages = [];                       // je Seite: { parts, comment }
      let breakBeforeTitle = false;
      let cur = { parts: [], comment: false };
      let pageCap = PH - BOT - y - TITLE_H - EPS;
      let avail = pageCap;
      const newPage = () => {
        if (!pages.length && !cur.parts.length && !cur.comment) {
          breakBeforeTitle = true;            // Regel 1: Überschrift wandert mit
          pageCap = avail = fullAvail - TITLE_H;
          return;
        }
        pages.push(cur);
        cur = { parts: [], comment: false };
        pageCap = avail = fullAvail;
      };

      groups.forEach((g, gi) => {
        const isLast = gi === groups.length - 1;
        let from = 0;
        while (from < g.subs.length) {
          const rest = g.naturals.slice(from);
          const tail = isLast ? COMMENT_GAP + commentH : 0;   // Regel 2: Kommentar hängt am Ende
          if (partH(rest, g.L) + tail <= avail) {
            cur.parts.push({ g, from, to: g.subs.length });
            if (isLast) cur.comment = true;
            avail -= partH(rest, g.L) + tail;
            break;
          }
          // Regel 3: Teilung nur mit >=3 Zeilen hier und >=2 auf der Folgeseite
          let k = 0;
          for (let cand = rest.length - 2; cand >= 3; cand--) {
            if (partH(rest.slice(0, cand), g.L) <= avail) { k = cand; break; }
          }
          // Regel 4: Notbremse auf leerer voller Seite
          if (!k && !cur.parts.length && avail === pageCap && pageCap >= fullAvail - TITLE_H) {
            for (let cand = rest.length - 1; cand >= 1; cand--) {
              if (partH(rest.slice(0, cand), g.L) <= avail) { k = cand; break; }
            }
            k = k || 1;
          }
          if (k) { cur.parts.push({ g, from, to: from + k }); from += k; }
          newPage();
        }
      });
      if (!pages.some((p) => p.comment) && !cur.comment) {
        if (COMMENT_GAP + commentH > avail) newPage();        // z. B. Fach ohne Zeilen
        cur.comment = true;
      }
      if (cur.parts.length || cur.comment) pages.push(cur);

      // ---- Seiten rendern ----
      pages.forEach((pg, pi) => {
        if (pi > 0 || breakBeforeTitle) { doc.addPage(); y = TOP; }
        if (pi === 0) {
          doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(0, 0, 0);
          doc.text(String(fach.name), SIDE, y + 5);
          y += TITLE_H;
        }
        const bodyRows = [];
        pg.parts.forEach((part) => {
          const k = part.to - part.from;
          const per = part.g.L ? part.g.L / k : 0;
          part.g.subs.slice(part.from, part.to).forEach((sub, i) => {
            const row = [];
            if (hasKomp && i === 0) row.push({ content: "", rowSpan: k, _komp: part.g.label });
            row.push(per ? { content: sub.text, styles: { minCellHeight: per } } : sub.text);
            row.push({ content: "", _rating: sub.bewertung });
            bodyRows.push(row);
          });
        });
        if (bodyRows.length) {
          doc.autoTable({
            startY: y,
            margin: { left: SIDE, right: SIDE, top: TOP, bottom: BOT },
            theme: "grid",
            styles: cellStyles(),
            rowPageBreak: "avoid",
            columnStyles,
            body: bodyRows,
            didDrawCell: (d) => {
              if (d.section !== "body") return;
              const raw = d.cell.raw;
              if (raw && raw._komp !== undefined) pdfRotatedLabel(doc, raw._komp, d.cell);
              if (raw && raw._rating !== undefined) pdfRating(doc, raw._rating, d.cell.x + d.cell.width / 2, d.cell.y + d.cell.height / 2);
            }
          });
          y = doc.lastAutoTable.finalY;
        }
        if (pg.comment) {
          // Kommentarkasten: immer vorhanden (auch leer), mind. ~4 Zeilen hoch,
          // mit etwas Abstand zur Tabelle; normale Schrift ohne Hinterlegung.
          doc.autoTable({
            startY: y + COMMENT_GAP,
            margin: { left: SIDE, right: SIDE, top: TOP, bottom: BOT },
            theme: "grid",
            styles: commentStyles(),
            rowPageBreak: "avoid",
            columnStyles: { 0: { cellWidth: CW } },
            body: [[String(fach.kommentar || "")]]
          });
          y = doc.lastAutoTable.finalY;
        }
      });
      y += 7;
    });
    let yBottom = y - 7;   // Unterkante des zuletzt gezeichneten Inhalts

    // ---------- Schlussabsätze: AG, HSU, Abschlusssatz ----------
    const absaetze = [data.ag, data.hsu, data.abschlusssatz].map((s) => String(s || "").trim()).filter(Boolean);
    if (absaetze.length) {
      if (y > PH - BOT - 10) { doc.addPage(); y = TOP; } else { y += 2; }
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(0, 0, 0);
      absaetze.forEach((absatz, ai) => {
        absatz.split(/\r?\n/).forEach((para) => {
          const lines = para === "" ? [""] : doc.splitTextToSize(para, CW);
          lines.forEach((ln) => {
            if (y > PH - BOT) { doc.addPage(); y = TOP; }
            doc.text(ln, SIDE, y); y += 5;
          });
        });
        if (ai < absaetze.length - 1) y += 2.5;   // Leerraum zwischen den Absätzen
      });
      yBottom = y - 5;
    }

    // ---------- Kenntnis genommen ----------
    // Regel: für die Unterschriftenzeile nie eine neue Seite beginnen – der
    // Block rutscht stattdessen in den unteren Seitenrand (Linie bis 10 mm,
    // Beschriftung bis ~5 mm an die Blattkante).
    let sy = Math.min(yBottom + 14, PH - 10);
    if (sy < yBottom + 6) { doc.addPage(); sy = TOP + 6; }   // praktisch unerreichbar
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(0, 0, 0);
    doc.text("Kenntnis genommen:", SIDE, sy);
    const labelW = 42, gap = 10, fieldW = (CW - labelW - gap) / 2;
    const x1 = SIDE + labelW, x2 = x1 + fieldW + gap;
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2);
    doc.line(x1, sy, x1 + fieldW, sy);
    doc.line(x2, sy, x2 + fieldW, sy);
    doc.setFontSize(8); doc.setTextColor(60, 60, 60);
    doc.text("Ort und Datum", x1 + fieldW / 2, sy + 4, { align: "center" });
    doc.text("Unterschrift eines Erziehungsberechtigten", x2 + fieldW / 2, sy + 4, { align: "center" });

    // ---------- laufende Kopfzeile (ab Seite 2 – Seite 1 ist die Startseite) ----------
    const total = doc.internal.getNumberOfPages();
    for (let i = 2; i <= total; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
      doc.text(`Seite ${i}`, SIDE, 16);
      if (name) doc.text(`des Zeugnisses von ${name}`, SIDE + 14, 16);
      if (schuljahr) { const jahr = `Schuljahr ${schuljahr}`; doc.text(jahr, SIDE + doc.getTextWidth(`des Zeugnisses von ${name}`) + 18, 16 ); }
      if (logoDataUrl) { const lw = 42, lh = lw * logoRatio; doc.addImage(logoDataUrl, "PNG", PW - SIDE - lw, 6, lw, lh); }
    }

    return doc;
}

/* Dateiname für ein Zeugnis-PDF; `used` verhindert Kollisionen bei gleichen Namen */
function pdfFileName(data, used) {
  const safe = String(data.name || "").replace(/[^\wäöüÄÖÜß-]+/g, "_") || "Zeugnis";
  let fname = `Zeugnis_${safe}.pdf`;
  for (let n = 2; used.has(fname); n++) fname = `Zeugnis_${safe}_${n}.pdf`;
  used.add(fname);
  return fname;
}

/* Ein Zeugnis: direkter PDF-Download. Mehrere: gebündelt als ZIP
   (Browser blockieren mehrere automatische Einzel-Downloads). */
async function downloadPDFs() {
  if (!loadedZeugnisse.length) return;
  const used = new Set();
  try {
    if (loadedZeugnisse.length === 1) {
      const z = loadedZeugnisse[0];
      buildPdfDoc(z.data).save(pdfFileName(z.data, used));
      setMessage("✓ PDF wurde heruntergeladen.", "ok");
      return;
    }
    const zip = new JSZip();
    for (const z of loadedZeugnisse) {
      zip.file(pdfFileName(z.data, used), buildPdfDoc(z.data).output("arraybuffer"));
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "Zeugnisse.zip";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    setMessage(`✓ ZIP mit ${loadedZeugnisse.length} PDFs wurde heruntergeladen.`, "ok");
  } catch (e) {
    setMessage("PDF-Erstellung fehlgeschlagen: " + e.message, "error");
  }
}

/* Logo kommt als eingebettete Data-URL aus logo-data.js – kein Laden zur
   Laufzeit nötig (Canvas-Umweg scheiterte bei file://-Aufruf an CORS/Taint). */
const logoDataUrl = typeof GKS_LOGO_DATAURL !== "undefined" ? GKS_LOGO_DATAURL : null;
const logoRatio = 232 / 920;

function setMessage(text, type) {
  const el = document.getElementById("message");
  el.textContent = text;
  el.className = "message" + (type ? " " + type : "");
}

function enableOutput(on) {
  document.getElementById("btn-pdf").disabled = !on;
}

/* ============================================================
   Event-Bindung
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btn-pdf").addEventListener("click", downloadPDFs);

  const input = document.getElementById("file-input");
  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;
    document.getElementById("file-name").textContent =
      files.length === 1 ? files[0].name : `${files.length} Dateien: ${files.map((f) => f.name).join(", ")}`;
    handleFiles(files);
  });
});
