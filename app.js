/* ============================================================
   Grundschulzeugnis-Generator – Logik (Frontend only)
   ============================================================ */

"use strict";

/* ---------- Bewertungsskala ----------
   1 = sicher              -> voller Kreis        (fraction 1.00)
   2 = überwiegend         -> 3/4-Kreis           (fraction 0.75)
   3 = teilweise           -> 1/2-Kreis           (fraction 0.50)
   4 = mit Unterstützung   -> 1/4-Kreis           (fraction 0.25)
   5 = "→"                 -> wird noch erworben
   "*" = siehe Kommentar
-------------------------------------------------------------- */
const RATING_FRACTION = { 1: 1.0, 2: 0.75, 3: 0.5, 4: 0.25 };

/* ---------- Beispiel-/Leervorlage ---------- */
const TEMPLATE = {
  name: "Vorname Nachname",
  schuljahr: "2025/2026",
  seite: 1,
  faecher: [
    {
      name: "Deutsch",
      kompetenzen: [
        {
          name: "Sprechen und Zuhören",
          subkompetenzen: [
            { text: "Du gibst Informationen korrekt wieder.", bewertung: 1 },
            { text: "Du beziehst dich auf die Beiträge anderer.", bewertung: 2 }
          ]
        },
        {
          name: "Lesen",
          subkompetenzen: [
            { text: "Du liest altersgemäße Texte flüssig.", bewertung: 3 },
            { text: "Du entnimmst Texten gezielt Informationen.", bewertung: "*" }
          ]
        }
      ],
      kommentar: "Optionaler Kommentar zum Fach Deutsch."
    },
    {
      name: "Mathematik",
      kompetenzen: [
        {
          name: "Zahlen und Operationen",
          subkompetenzen: [
            { text: "Du rechnest im Zahlenraum bis 1000 sicher.", bewertung: 2 },
            { text: "Du löst Sachaufgaben selbstständig.", bewertung: 5 }
          ]
        }
      ],
      kommentar: ""
    }
  ],
  kommentar: "Hier steht der zusammenfassende Kommentar zum Schuljahr."
};

/* ============================================================
   SVG-Kreis (Tortenstück) für die Bewertung
   ============================================================ */
function pieSVG(fraction) {
  const size = 16, r = 7, c = size / 2;
  const head = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`;
  if (fraction >= 1) {
    return head +
      `<circle cx="${c}" cy="${c}" r="${r}" fill="#000" stroke="#000" stroke-width="1"/></svg>`;
  }
  const base = `<circle cx="${c}" cy="${c}" r="${r}" fill="#fff" stroke="#000" stroke-width="1"/>`;
  let wedge = "";
  if (fraction > 0) {
    const theta = fraction * 2 * Math.PI;
    const endX = (c + r * Math.sin(theta)).toFixed(2);
    const endY = (c - r * Math.cos(theta)).toFixed(2);
    const large = fraction > 0.5 ? 1 : 0;
    wedge = `<path d="M${c},${c} L${c},${c - r} A${r},${r} 0 ${large} 1 ${endX},${endY} Z" fill="#000"/>`;
  }
  return head + base + wedge + "</svg>";
}

/* Dicker Block-Pfeil (für "Kompetenz wird noch erworben") als SVG */
function arrowSVG() {
  return '<svg class="arrow" width="24" height="15" viewBox="0 0 24 15" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="M1,4.3 L13,4.3 L13,0.5 L23,7.5 L13,14.5 L13,10.7 L1,10.7 Z" fill="#000"/></svg>';
}

/* Liefert das Symbol-HTML für einen Bewertungswert */
function ratingSymbol(value) {
  if (value === "*") return '<span class="sym-text">*</span>';
  const num = typeof value === "string" ? value.trim() : value;
  if (num === 5 || num === "5" || num === "→" || num === "->") {
    return arrowSVG();
  }
  const frac = RATING_FRACTION[num];
  if (frac === undefined) return '<span class="sym-text">?</span>';
  return pieSVG(frac);
}

/* ============================================================
   HTML-Helfer
   ============================================================ */
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* Wie esc(), wandelt zusätzlich Zeilenumbrüche in <br> um */
function escMultiline(s) {
  return esc(s).replace(/\r?\n/g, "<br>");
}

/* ============================================================
   Zeugnis rendern
   ============================================================ */
function renderReport(data) {
  const report = document.getElementById("report");

  const legend = `
    <table class="legend">
      <tr>
        <td class="legend-icon">${pieSVG(0.25)}</td>
        <td class="legend-icon">${pieSVG(0.5)}</td>
        <td class="legend-icon">${pieSVG(0.75)}</td>
        <td class="legend-icon">${pieSVG(1)}</td>
      </tr>
      <tr>
        <td class="legend-label">mit Unterstützung</td>
        <td class="legend-label">teilweise</td>
        <td class="legend-label">überwiegend</td>
        <td class="legend-label">sicher</td>
      </tr>
    </table>
    <table class="legend-notes">
      <tr>
        <td>*&nbsp;&nbsp;&nbsp;siehe Kommentar</td>
        <td>${arrowSVG()}&nbsp;&nbsp;Kompetenz wird noch erworben</td>
      </tr>
    </table>`;

  const head = `
    <div class="doc-top">
      <img class="dh-logo" src="GKS-Logo.png" alt="Georg-Kerschensteiner-Schule" />
    </div>
    <div class="doc-head">
      <span class="dh-seite">Seite ${esc(data.seite ?? 1)}</span>
      <span class="dh-mid">des Zeugnisses von <span class="dh-name">${esc(data.name)}</span></span>
      <span class="dh-jahr">Schuljahr ${esc(data.schuljahr)}</span>
    </div>`;

  const faecher = (data.faecher || []).map(renderFach).join("");

  const gesamt = data.kommentar && String(data.kommentar).trim()
    ? `<div class="gesamt-kommentar">${escMultiline(data.kommentar)}</div>`
    : "";

  const kenntnis = `
    <div class="kenntnis">
      <span class="kenntnis-label">Kenntnis genommen:</span>
      <div class="sign-field">
        <div class="sign-rule"></div>
        <div class="sign-caption">Ort und Datum</div>
      </div>
      <div class="sign-field">
        <div class="sign-rule"></div>
        <div class="sign-caption">Unterschrift eines Erziehungsberechtigten</div>
      </div>
    </div>`;

  report.innerHTML = head + legend + faecher + gesamt + kenntnis;
  renderRotatedLabels();
  showPreview(true);
}

/* Vorschau (Überschrift + Dokument) nur anzeigen, wenn Daten geladen sind */
function showPreview(on) {
  const title = document.getElementById("preview-title");
  const report = document.getElementById("report");
  if (title) title.style.display = on ? "" : "none";
  if (report) report.style.display = on ? "" : "none";
}

/* Rendert die gedrehten Kompetenz-Beschriftungen als SVG.
   Vorteil: html2canvas (PDF) stellt SVG korrekt dar (kein "writing-mode"-
   Problem / kein Kopfüber-Effekt), und das SVG wird exakt auf die gemessene
   Zellenhöhe skaliert – so überlappen lange Namen nichts. */
function renderRotatedLabels(root) {
  (root || document).querySelectorAll(".komp-label").forEach((td) => {
    const text = td.getAttribute("data-label") || "";
    const w = td.clientWidth;
    const h = td.clientHeight;
    if (!w || !h) return;
    const avail = h - 8;                 // nutzbare Länge (= Zellenhöhe)
    const baseFs = 11.3;                 // ~8.5pt
    const charW = 0.55;                  // grobe mittlere Zeichenbreite (Arial)
    let fs = baseFs;
    const needed = text.length * baseFs * charW;
    if (needed > avail) fs = Math.max(6.5, avail / (text.length * charW));
    const cx = (w / 2).toFixed(1);
    const cy = (h / 2).toFixed(1);
    td.innerHTML =
      `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg">` +
      `<text x="${cx}" y="${cy}" transform="rotate(-90 ${cx} ${cy})" ` +
      `text-anchor="middle" dominant-baseline="central" ` +
      `font-family="Arial, Helvetica, sans-serif" font-size="${fs.toFixed(1)}" font-weight="600">` +
      `${esc(text)}</text></svg>`;
  });
}

function renderFach(fach) {
  // Jede Kompetenz wird zu einem eigenen <tbody class="komp-group">.
  // CSS markiert diese Gruppen mit "break-inside: avoid", sodass eine
  // Kompetenz nie über einen Seitenumbruch hinweg getrennt wird.
  const groups = (fach.kompetenzen || []).map((komp) => {
    const subs = komp.subkompetenzen || [];
    const rows = subs.map((sub, i) => {
      const labelCell = i === 0
        ? `<td class="komp-label" rowspan="${subs.length}" data-label="${esc(komp.name)}"></td>`
        : "";
      return `
        <tr>
          ${labelCell}
          <td class="sub-text">${escMultiline(sub.text)}</td>
          <td class="sub-rating">${ratingSymbol(sub.bewertung)}</td>
        </tr>`;
    }).join("");
    return `<tbody class="komp-group">${rows}</tbody>`;
  }).join("");

  const kommentar = (fach.kommentar && String(fach.kommentar).trim())
    ? `<div class="fach-kommentar"><span class="lbl">Kommentar:</span> ${escMultiline(fach.kommentar)}</div>`
    : `<div class="fach-kommentar"><span class="lbl">Kommentar:</span></div>`;

  return `
    <div class="fach-block">
      <h2 class="fach-title">${esc(fach.name)}</h2>
      <table class="fach-table">${groups}</table>
      ${kommentar}
    </div>`;
}

/* ============================================================
   Validierung
   ============================================================ */
function validate(data) {
  if (typeof data !== "object" || data === null) throw new Error("Die Datei enthält kein gültiges JSON-Objekt.");
  if (!("name" in data)) throw new Error('Feld "name" fehlt.');
  if (!Array.isArray(data.faecher)) throw new Error('Feld "faecher" fehlt oder ist keine Liste.');
  data.faecher.forEach((f, i) => {
    if (!f.name) throw new Error(`Fach #${i + 1}: "name" fehlt.`);
    if (!Array.isArray(f.kompetenzen)) throw new Error(`Fach "${f.name}": "kompetenzen" fehlt oder ist keine Liste.`);
  });
}

/* ============================================================
   Aktionen
   ============================================================ */
function downloadTemplate() {
  const blob = new Blob([JSON.stringify(TEMPLATE, null, 2)], { type: "application/json" });
  triggerDownload(blob, "zeugnis-vorlage.json");
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

let currentData = null;

function handleFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      validate(data);
      currentData = data;
      renderReport(data);
      setMessage("✓ Datei geladen. Vorschau unten – jetzt PDF erzeugen.", "ok");
      enableOutput(true);
    } catch (err) {
      currentData = null;
      enableOutput(false);
      showPreview(false);
      setMessage("Fehler: " + err.message, "error");
    }
  };
  reader.onerror = () => setMessage("Die Datei konnte nicht gelesen werden.", "error");
  reader.readAsText(file);
}

function generatePDF() {
  if (!currentData) return;
  const element = document.getElementById("report");
  const safeName = String(currentData.name || "Zeugnis").replace(/[^\wäöüÄÖÜß-]+/g, "_");
  const opt = {
    // [oben, links, unten, rechts] in mm – mehr Rand links/rechts/unten
    margin: [14, 18, 20, 18],
    filename: `Zeugnis_${safeName}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"], avoid: [".komp-group", "tr", ".kenntnis", ".fach-title"] }
  };
  setMessage("PDF wird erstellt …", "ok");

  // Report während der Erzeugung auf feste Druckbreite setzen, damit die
  // PDF-Ausgabe unabhängig von der (breiteren) Bildschirmdarstellung ist.
  const PRINT_WIDTH = 820;
  const prevWidth = element.style.width;
  const prevMaxWidth = element.style.maxWidth;
  const restore = () => {
    element.style.width = prevWidth;
    element.style.maxWidth = prevMaxWidth;
    renderRotatedLabels();           // Beschriftungen für Bildschirmbreite neu
  };
  element.style.width = PRINT_WIDTH + "px";
  element.style.maxWidth = PRINT_WIDTH + "px";
  renderRotatedLabels();             // Beschriftungen an Druckbreite anpassen

  html2pdf().set(opt).from(element).save().then(() => {
    restore();
    setMessage("✓ PDF wurde heruntergeladen.", "ok");
  }).catch((e) => {
    restore();
    setMessage("PDF-Erstellung fehlgeschlagen: " + e.message, "error");
  });
}

function setMessage(text, type) {
  const el = document.getElementById("message");
  el.textContent = text;
  el.className = "message" + (type ? " " + type : "");
}

function enableOutput(on) {
  document.getElementById("btn-pdf").disabled = !on;
  document.getElementById("btn-print").disabled = !on;
}

/* ============================================================
   Event-Bindung
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  showPreview(false);   // Vorschau erst nach erfolgreichem Upload zeigen
  document.getElementById("btn-template").addEventListener("click", downloadTemplate);
  document.getElementById("btn-pdf").addEventListener("click", generatePDF);
  document.getElementById("btn-print").addEventListener("click", () => window.print());

  const input = document.getElementById("file-input");
  input.addEventListener("change", () => {
    const file = input.files && input.files[0];
    if (!file) return;
    document.getElementById("file-name").textContent = file.name;
    handleFile(file);
  });
});
