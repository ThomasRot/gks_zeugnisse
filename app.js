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

/* Die ausfüllbare Excel-Vorlage liegt als statische Datei im Projekt
   (zeugnis-vorlage.xlsx, alle Fächer/Kompetenzen der GKS). */
const TEMPLATE_FILE = "zeugnis-vorlage.xlsx";

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
  if (value === "" || value === null || value === undefined) return "";
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

  // Kopfzeile nur für die Bildschirm-Vorschau (Klasse "no-pdf"). Im PDF wird
  // stattdessen auf JEDER Seite eine laufende Kopfzeile mit echter Seitenzahl
  // gezeichnet (siehe generatePDF). Daher ohne manuelle Seitenangabe.
  const head = `
    <div class="doc-header no-pdf">
      <div class="doc-top">
        <img class="dh-logo" src="GKS-Logo.png" alt="Georg-Kerschensteiner-Schule" />
      </div>
      <div class="doc-head">
        <span class="dh-mid">des Zeugnisses von <span class="dh-name">${esc(data.name)}</span></span>
        <span class="dh-jahr">Schuljahr ${esc(data.schuljahr)}</span>
      </div>
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
  // Hat das Fach überhaupt benannte Kompetenzen? Wenn nein (z. B. Kunst, Musik),
  // entfällt die linke (gedrehte) Beschriftungsspalte komplett.
  const hasKompNames = (fach.kompetenzen || []).some((k) => k.name && String(k.name).trim());

  const groups = (fach.kompetenzen || []).map((komp) => {
    const subs = komp.subkompetenzen || [];
    const rows = subs.map((sub, i) => {
      const labelCell = !hasKompNames
        ? ""
        : i === 0
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
  if (typeof data !== "object" || data === null) throw new Error("Die Datei enthält keine gültigen Daten.");
  if (!data.name || !String(data.name).trim()) throw new Error('Kein Name gefunden (Zelle rechts neben "Name").');
  if (!Array.isArray(data.faecher) || data.faecher.length === 0) {
    throw new Error('Keine Fächer gefunden. Stimmt die Kopfzeile "Fach | Kompetenz | Fähigkeit | Bewertung"?');
  }
  data.faecher.forEach((f, i) => {
    if (!f.name) throw new Error(`Fach #${i + 1}: Name fehlt.`);
    if (!Array.isArray(f.kompetenzen)) throw new Error(`Fach "${f.name}": Kompetenzen fehlen.`);
    // Wenn irgendeine Fähigkeit "*" hat, ist ein Fachkommentar Pflicht.
    const hasStar = f.kompetenzen.some((k) =>
      (k.subkompetenzen || []).some((s) => s.bewertung === "*"));
    if (hasStar && !(f.kommentar && String(f.kommentar).trim())) {
      throw new Error(`Fach "${f.name}": Es wurde "*" vergeben – dann muss die Spalte „Fachkommentar" ausgefüllt sein.`);
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
    const subText = String(r[2] || "").trim();
    const fachKomm = String(r[4] || "").trim();
    if (!fachName && !kompName && !subText) continue;

    if (fachName) {
      curFach = { name: fachName, kompetenzen: [], kommentar: "" };
      data.faecher.push(curFach);
      curKomp = null;
    }
    if (!curFach) continue;
    if (fachKomm && !curFach.kommentar) curFach.kommentar = fachKomm;
    if (kompName) {
      curKomp = { name: kompName, subkompetenzen: [] };
      curFach.kompetenzen.push(curKomp);
    }
    if (subText) {
      if (!curKomp) {
        curKomp = { name: "", subkompetenzen: [] };
        curFach.kompetenzen.push(curKomp);
      }
      curKomp.subkompetenzen.push({ text: subText, bewertung: normBewertung(r[3]) });
    }
  }
  return data;
}

let currentData = null;

function applyData(data) {
  validate(data);
  currentData = data;
  renderReport(data);
  setMessage("✓ Datei geladen. Vorschau unten – jetzt PDF erzeugen.", "ok");
  enableOutput(true);
}

function onLoadError(err) {
  currentData = null;
  enableOutput(false);
  showPreview(false);
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
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
      applyData(rowsToData(rows));
    } catch (err) {
      onLoadError(err);
    }
  };
  reader.readAsArrayBuffer(file);
}

function generatePDF() {
  if (!currentData) return;
  const element = document.getElementById("report");
  const safeName = String(currentData.name || "Zeugnis").replace(/[^\wäöüÄÖÜß-]+/g, "_");
  const name = String(currentData.name || "");
  const schuljahr = String(currentData.schuljahr || "");
  const ML = 18, MR = 18;
  const opt = {
    // [oben, links, unten, rechts] in mm – oben mehr Platz für die Kopfzeile
    margin: [24, ML, 20, MR],
    filename: `Zeugnis_${safeName}.pdf`,
    image: { type: "jpeg", quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
    jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    pagebreak: { mode: ["css", "legacy"], avoid: [".komp-group", "tr", ".kenntnis", ".fach-title"] }
  };
  setMessage("PDF wird erstellt …", "ok");

  // Vorschau-Kopfzeile ausblenden (im PDF zeichnen wir sie pro Seite selbst)
  // und Report auf feste Druckbreite setzen (unabhängig von der Bildschirmbreite).
  const PRINT_WIDTH = 820;
  const hidden = element.querySelectorAll(".no-pdf");
  const prevWidth = element.style.width;
  const prevMaxWidth = element.style.maxWidth;
  const restore = () => {
    hidden.forEach((e) => (e.style.display = ""));
    element.style.width = prevWidth;
    element.style.maxWidth = prevMaxWidth;
    renderRotatedLabels();
  };
  hidden.forEach((e) => (e.style.display = "none"));
  element.style.width = PRINT_WIDTH + "px";
  element.style.maxWidth = PRINT_WIDTH + "px";
  renderRotatedLabels();

  html2pdf().set(opt).from(element).toPdf().get("pdf").then((pdf) => {
    // Laufende Kopfzeile mit echter Seitenzahl auf jeder Seite
    const total = pdf.internal.getNumberOfPages();
    const pw = pdf.internal.pageSize.getWidth();
    for (let i = 1; i <= total; i++) {
      pdf.setPage(i);
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(120);
      const y = 12;
      pdf.text(`Seite ${i}`, ML, y);
      if (name) pdf.text(`des Zeugnisses von ${name}`, ML + 20, y);
      if (schuljahr) {
        const jahr = `Schuljahr ${schuljahr}`;
        pdf.text(jahr, pw - MR - 34 - pdf.getTextWidth(jahr), y);
      }
      if (logoDataUrl) {
        const lw = 30, lh = lw * logoRatio;
        pdf.addImage(logoDataUrl, "PNG", pw - MR - lw, 6, lw, lh);
      }
    }
  }).save().then(() => {
    restore();
    setMessage("✓ PDF wurde heruntergeladen.", "ok");
  }).catch((e) => {
    restore();
    setMessage("PDF-Erstellung fehlgeschlagen: " + e.message, "error");
  });
}

/* Logo einmalig als dataURL laden (für die jsPDF-Kopfzeile) */
let logoDataUrl = null;
let logoRatio = 0.25;
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
  showPreview(false);   // Vorschau erst nach erfolgreichem Upload zeigen
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
