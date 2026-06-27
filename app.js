/* ============================================================
   Grundschulzeugnis-Generator – Logik (Frontend only)
   ============================================================ */

"use strict";

/* Die ausfüllbare Excel-Vorlage liegt als statische Datei im Projekt
   (zeugnis-vorlage.xlsx, alle Fächer/Kompetenzen der GKS).
   Bewertungsskala: 1=sicher, 2=überwiegend, 3=teilweise, 4=mit Unterstützung,
   5=„→" (wird noch erworben), "*"=siehe Kommentar. */
const TEMPLATE_FILE = "zeugnis-vorlage.xlsx";

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
/* Lädt die statische Excel-Vorlage herunter */
function downloadTemplate() {
  const a = document.createElement("a");
  a.href = TEMPLATE_FILE;
  a.download = TEMPLATE_FILE;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

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

/* Wandelt die Zeilen einer Excel-Tabelle (Array-of-Arrays) in das Datenmodell um */
function rowsToData(rows) {
  const data = { name: "", schuljahr: "", faecher: [], kommentar: "" };
  const isHeader = (r) => String((r && r[0]) || "").trim().toLowerCase() === "fach";

  let i = 0;
  // 1) Metadaten oben (Name / Schuljahr / Kommentar) bis zur Tabellen-Kopfzeile
  for (; i < rows.length; i++) {
    if (isHeader(rows[i])) { i++; break; }
    const key = String((rows[i] && rows[i][0]) || "").trim().toLowerCase();
    const val = rows[i] && rows[i][1] !== undefined ? rows[i][1] : "";
    if (key === "name") data.name = String(val).trim();
    else if (key === "schuljahr") data.schuljahr = String(val).trim();
    else if (key === "kommentar") data.kommentar = String(val);
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

let currentData = null;

function applyData(data) {
  validate(data);
  currentData = data;
  const nFach = data.faecher.length;
  const nFae = data.faecher.reduce((a, f) => a + (f.kompetenzen || []).reduce((b, k) => b + (k.subkompetenzen || []).length, 0), 0);
  setMessage(`✓ Geladen: ${data.name} · ${nFach} Fächer · ${nFae} Fähigkeiten. Jetzt PDF herunterladen.`, "ok");
  enableOutput(true);
}

function onLoadError(err) {
  currentData = null;
  enableOutput(false);
  setMessage("Fehler: " + err.message, "error");
}

function handleFile(file) {
  if (!/\.(xlsx|xls)$/.test(file.name.toLowerCase())) {
    onLoadError(new Error("Bitte eine Excel-Datei (.xlsx) auswählen."));
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => setMessage("Die Datei konnte nicht gelesen werden.", "error");
  reader.onload = () => {
    try {
      const wb = XLSX.read(new Uint8Array(reader.result), { type: "array" });
      applyData(rowsToData(pickZeugnisRows(wb)));
    } catch (err) {
      onLoadError(err);
    }
  };
  reader.readAsArrayBuffer(file);
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

/* Wort-Umbruch, der NIE ein Wort trennt (umbricht nur an Leerzeichen). */
function wrapWords(doc, text, maxLen) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const trial = cur ? cur + " " + w : w;
    if (!cur || doc.getTextWidth(trial) <= maxLen) cur = trial;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

/* Mindest-Zeilenlänge (= benötigte Zellenhöhe ohne Padding), damit der Text in
   ≤ maxLines Zeilen passt – ohne ein Wort zu trennen. Ein sehr langes Einzelwort
   bestimmt dann die Mindesthöhe (-> Zeilen wachsen alle gleich). */
function labelRequiredLen(doc, text, maxLines) {
  doc.setFont("helvetica", "bold"); doc.setFontSize(LABEL_FS);
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const count = (L) => wrapWords(doc, text, L).length;
  let lo = Math.max.apply(null, words.map((w) => doc.getTextWidth(w)));
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

function generatePDF() {
  if (!currentData) return;
  try {
    const { jsPDF } = window.jspdf;
    const data = currentData;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const SIDE = 18, TOP = 18, BOT = 18;
    const CW = PW - 2 * SIDE;
    const name = String(data.name || "");
    const schuljahr = String(data.schuljahr || "");
    const gridStyle = { lineColor: [0, 0, 0], lineWidth: 0.2, textColor: [0, 0, 0], font: "helvetica" };

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

    // ---------- Fächer ----------
    (data.faecher || []).forEach((fach) => {
      const hasKomp = (fach.kompetenzen || []).some((k) => k.name && String(k.name).trim());
      const cols = hasKomp ? 3 : 2;
      const LBL = 10, RAT = 16;

      // Überschrift nie allein am Seitenende: Platz für Titel + 1 Zeile sichern
      if (y + 8 + 14 > PH - BOT) { doc.addPage(); y = TOP; }
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(0, 0, 0);
      doc.text(String(fach.name), SIDE, y + 5);

      const bodyRows = [];
      (fach.kompetenzen || []).forEach((komp) => {
        const subs = komp.subkompetenzen || [];
        // Mindesthöhe für die gedrehte Beschriftung (ohne Wort zu trennen),
        // gleichmäßig auf die Zeilen der Kompetenz verteilt. Nur ein Untergrenze:
        // brauchen die Texte natürlich mehr Höhe, bleibt es dabei.
        let perRowMin = 0;
        if (hasKomp && komp.name && subs.length) {
          perRowMin = (labelRequiredLen(doc, komp.name, LABEL_MAXLINES) + 5) / subs.length;
        }
        subs.forEach((sub, i) => {
          const row = [];
          if (hasKomp && i === 0) row.push({ content: "", rowSpan: subs.length, _komp: komp.name });
          row.push(perRowMin ? { content: sub.text, styles: { minCellHeight: perRowMin } } : sub.text);
          row.push({ content: "", _rating: sub.bewertung });
          bodyRows.push(row);
        });
      });
      if (fach.kommentar && String(fach.kommentar).trim()) {
        // Kommentarkasten: immer mind. ~4 Zeilen hoch, dezent hinterlegt, Text
        // oben – hebt sich auch bei wenig Inhalt sichtbar ab.
        bodyRows.push([{
          content: String(fach.kommentar),
          colSpan: cols,
          styles: { minCellHeight: 20, valign: "top", fillColor: [245, 245, 245], textColor: [60, 60, 60], fontStyle: "italic", fontSize: 9.5 }
        }]);
      }

      const columnStyles = hasKomp
        ? { 0: { cellWidth: LBL, fillColor: [247, 247, 247] }, 1: { cellWidth: CW - LBL - RAT }, 2: { cellWidth: RAT, halign: "center" } }
        : { 0: { cellWidth: CW - RAT }, 1: { cellWidth: RAT, halign: "center" } };

      doc.autoTable({
        startY: y + 8,
        margin: { left: SIDE, right: SIDE, top: TOP, bottom: BOT },
        theme: "grid",
        styles: Object.assign({}, gridStyle, { fontSize: 10, valign: "middle", overflow: "linebreak", cellPadding: { top: 1.8, bottom: 1.8, left: 2.5, right: 2.5 } }),
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
      y = doc.lastAutoTable.finalY + 7;
    });

    // ---------- Gesamtkommentar ----------
    if (data.kommentar && String(data.kommentar).trim()) {
      if (y > PH - BOT - 10) { doc.addPage(); y = TOP; } else { y += 2; }
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(0, 0, 0);
      String(data.kommentar).split(/\r?\n/).forEach((para) => {
        const lines = para === "" ? [""] : doc.splitTextToSize(para, CW);
        lines.forEach((ln) => {
          if (y > PH - BOT) { doc.addPage(); y = TOP; }
          doc.text(ln, SIDE, y); y += 5;
        });
      });
    }

    // ---------- Kenntnis genommen ----------
    if (y + 30 > PH - BOT) { doc.addPage(); y = TOP; }
    y += 14;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); doc.setTextColor(0, 0, 0);
    doc.text("Kenntnis genommen:", SIDE, y);
    const labelW = 42, gap = 10, fieldW = (CW - labelW - gap) / 2;
    const x1 = SIDE + labelW, x2 = x1 + fieldW + gap;
    doc.setDrawColor(0, 0, 0); doc.setLineWidth(0.2);
    doc.line(x1, y, x1 + fieldW, y);
    doc.line(x2, y, x2 + fieldW, y);
    doc.setFontSize(8); doc.setTextColor(60, 60, 60);
    doc.text("Ort und Datum", x1 + fieldW / 2, y + 4, { align: "center" });
    doc.text("Unterschrift eines Erziehungsberechtigten", x2 + fieldW / 2, y + 4, { align: "center" });

    // ---------- laufende Kopfzeile auf jeder Seite ----------
    const total = doc.internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(120, 120, 120);
      doc.text(`Seite ${i}`, SIDE, 14);
      if (name) doc.text(`des Zeugnisses von ${name}`, SIDE + 14, 14);
      if (schuljahr) { const jahr = `Schuljahr ${schuljahr}`; doc.text(jahr, SIDE + doc.getTextWidth(`des Zeugnisses von ${name}`) + 18, 14 ); }
      if (logoDataUrl) { const lw = 42, lh = lw * logoRatio; doc.addImage(logoDataUrl, "PNG", PW - SIDE - lw, 4, lw, lh); }
    }

    const safeName = name.replace(/[^\wäöüÄÖÜß-]+/g, "_") || "Zeugnis";
    doc.save(`Zeugnis_${safeName}.pdf`);
    setMessage("✓ PDF wurde heruntergeladen.", "ok");
  } catch (e) {
    setMessage("PDF-Erstellung fehlgeschlagen: " + e.message, "error");
  }
}

/* Logo einmalig als dataURL laden (für die jsPDF-Kopfzeile) */
let logoDataUrl = null;
let logoRatio = 0.8;
function loadLogo() {
  const img = new Image();
  img.onload = () => {
    if (img.naturalWidth) logoRatio = img.naturalHeight / img.naturalWidth;
    try {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0);
      logoDataUrl = c.toDataURL("image/png");
    } catch (e) {
      logoDataUrl = null;
    }
  };
  img.src = "GKS-Logo.png";
}

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
  loadLogo();
  document.getElementById("btn-template").addEventListener("click", downloadTemplate);
  document.getElementById("btn-pdf").addEventListener("click", generatePDF);

  const input = document.getElementById("file-input");
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    document.getElementById("file-name").textContent = file.name;
    handleFile(file);
  });
});
