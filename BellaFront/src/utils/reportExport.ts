// Reusable branded report export utility — used by InventoryPage and
// ProductsPage (and any future page with a filterable table) to export
// exactly what's currently visible on screen to a branded PDF or Excel
// file. Deliberately NOT a "reports module" with saved definitions or
// scheduling — just export-what-you-see, per the client's actual ask.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export interface ReportColumn<T> {
  header: string;
  accessor: (row: T) => string | number;
}

export interface ReportOptions<T> {
  /** e.g. "Reporte de Inventario" — shown as the document title. */
  title: string;
  columns: ReportColumn<T>[];
  rows: T[];
  /** Current user's displayName — shown in the footer/meta line. */
  downloadedBy: string;
  /** One-line description of active filters, e.g. "Sucursal: Centro · Estado: Bajo".
   *  Omit entirely (don't pass an empty string) when no filters are active. */
  filtersSummary?: string;
  /** Base file name, e.g. "inventario" -> "inventario-2026-09-19.pdf".
   *  Defaults to a slug of `title` if omitted. */
  fileBaseName?: string;
}

// ---------- Brand tokens — mirrors BellaFront/src/styles/tokens.css so the
// exported documents actually look like they came from this app rather than
// a generic library default. Kept as plain hex here (not read from CSS at
// runtime) since jsPDF/SheetJS need literal color values, not custom
// properties. ----------
const BRAND = {
  pinkDeep: "#0066CC", // --color-pink-deep
  ink: "#1D1D1F", // --color-ink
  white: "#FFFFFF", // --color-white
  bg: "#F5F5F7", // --color-bg
  border: "#E0E0E0", // --color-border
  textSecondary: "#6E6E73", // --color-text-secondary
  textMuted: "#86868B", // --color-text-muted
};

// The 480px-wide pre-sized variant of logo-full.png (same lockup, same
// aspect ratio — 480x294 vs the source's 859x527) is used instead of the
// full-resolution source: jsPDF embeds PNGs with an alpha channel as a raw
// decompressed bitmap (not the PNG's own compressed stream), so the
// full-size logo alone bloated exported PDFs to ~1.8MB. At the size this
// header actually renders (~12mm tall), 480px source width is still far
// more resolution than needed for crisp print output.
const LOGO_URL = "/brand/logo-full-480.png";

interface LogoInfo {
  dataUrl: string;
  width: number;
  height: number;
}

// Cached across calls within a session — the logo asset never changes at
// runtime, no reason to re-fetch/re-encode it on every export click.
let logoPromise: Promise<LogoInfo | null> | null = null;

function loadLogo(): Promise<LogoInfo | null> {
  if (!logoPromise) {
    logoPromise = (async () => {
      try {
        const res = await fetch(LOGO_URL);
        if (!res.ok) return null;
        const blob = await res.blob();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        const dims = await new Promise<{ width: number; height: number }>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => reject(new Error("logo failed to decode"));
          img.src = dataUrl;
        });
        return { dataUrl, ...dims };
      } catch {
        // A missing/broken logo shouldn't block the export — the report
        // just renders without it.
        return null;
      }
    })();
  }
  return logoPromise;
}

function formatDateTimeEsMx(date: Date): string {
  return date.toLocaleString("es-MX", { dateStyle: "long", timeStyle: "short" });
}

function dateSlug(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function slugify(text: string): string {
  // Drop combining diacritical marks (U+0300-U+036F) left behind by NFD
  // normalization character-by-character, rather than a regex literal
  // containing the marks themselves — keeps this file's source free of
  // invisible/hard-to-diff combining characters (same pattern already
  // used in RoleFormModal.tsx's own slugify).
  const withoutAccents = Array.from(text.normalize("NFD"))
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code < 0x0300 || code > 0x036f;
    })
    .join("");
  return (
    withoutAccents
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-+|-+$)/g, "") || "reporte"
  );
}

function buildFileName(options: ReportOptions<unknown>, ext: string, now: Date): string {
  const base = options.fileBaseName ?? slugify(options.title);
  return `${base}-${dateSlug(now)}.${ext}`;
}

// ---------- PDF ----------

export async function exportReportToPdf<T>(options: ReportOptions<T>): Promise<void> {
  const { title, columns, rows, downloadedBy, filtersSummary } = options;
  const now = new Date();

  // Landscape reads better for wide tables (5-7 columns) than portrait.
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 14;
  const marginRight = 14;
  const headerTop = 12;

  const logo = await loadLogo();

  let titleX = marginLeft;
  let titleY = headerTop + 6;

  if (logo) {
    const logoHeight = 12; // ~34px at 72dpi — reads clearly without dominating the header
    const logoWidth = (logo.width / logo.height) * logoHeight;
    doc.addImage(logo.dataUrl, "PNG", marginLeft, headerTop, logoWidth, logoHeight);
    titleX = marginLeft + logoWidth + 6;
    titleY = headerTop + logoHeight / 2 + 2;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(BRAND.ink);
  doc.text(title, titleX, titleY);

  let afterHeaderY = Math.max(headerTop + (logo ? 12 : 6), titleY) + 4;

  if (filtersSummary) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(BRAND.textSecondary);
    doc.text(filtersSummary, marginLeft, afterHeaderY);
    afterHeaderY += 5;
  }

  const startY = afterHeaderY + 4;

  autoTable(doc, {
    startY,
    margin: { left: marginLeft, right: marginRight, bottom: 18 },
    head: [columns.map((c) => c.header)],
    body: rows.map((row) => columns.map((c) => String(c.accessor(row)))),
    theme: "striped",
    styles: {
      font: "helvetica",
      fontSize: 9,
      textColor: BRAND.ink,
      lineColor: BRAND.border,
      lineWidth: 0.1,
      cellPadding: 2.5,
    },
    headStyles: {
      fillColor: BRAND.pinkDeep,
      textColor: BRAND.white,
      fontStyle: "bold",
      fontSize: 9.5,
    },
    alternateRowStyles: { fillColor: BRAND.bg },
  });

  // Footer with date/downloader + "Página X de Y" on every page. jsPDF adds
  // pages sequentially, so the final page count isn't known inside
  // autoTable's didDrawPage hook while it's still drawing earlier pages —
  // looping over every page after the table has fully rendered is the
  // reliable way to stamp the true total on each one.
  const pageCount = doc.internal.getNumberOfPages();
  const footerDate = formatDateTimeEsMx(now);
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const pageHeight = doc.internal.pageSize.getHeight();
    const footerLineY = pageHeight - 12;
    const footerTextY = pageHeight - 7;

    doc.setDrawColor(BRAND.border);
    doc.setLineWidth(0.2);
    doc.line(marginLeft, footerLineY, pageWidth - marginRight, footerLineY);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(BRAND.textMuted);
    doc.text(`Descargado por: ${downloadedBy}  ·  ${footerDate}`, marginLeft, footerTextY);
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - marginRight, footerTextY, { align: "right" });
  }

  doc.save(buildFileName(options, "pdf", now));
}

// ---------- Excel ----------

// SheetJS Community Edition (the `xlsx` package installed here) does NOT
// reliably write cell styling (fonts/fills/colors) to the output file —
// that's a SheetJS Pro-only feature. Verified directly: setting `cell.s`
// and writing to .xlsx produces a styles.xml with no trace of the
// requested font/fill. So this export leans on the structural features
// that DO work in the free build — merged header rows and column widths —
// for a clean, deliberately-laid-out sheet instead of a bare data dump,
// rather than promising colored/bold cells it can't actually deliver.
export async function exportReportToExcel<T>(options: ReportOptions<T>): Promise<void> {
  const { title, columns, rows, downloadedBy, filtersSummary } = options;
  const now = new Date();

  const metaLine = `Descargado por: ${downloadedBy}  ·  Fecha: ${formatDateTimeEsMx(now)}`;

  const aoa: (string | number)[][] = [];
  aoa.push([title]);
  aoa.push([metaLine]);
  if (filtersSummary) aoa.push([filtersSummary]);
  aoa.push([]);
  aoa.push(columns.map((c) => c.header));
  rows.forEach((row) => aoa.push(columns.map((c) => c.accessor(row))));

  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  const colCount = Math.max(columns.length, 1);
  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
  ];
  if (filtersSummary) {
    merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: colCount - 1 } });
  }
  worksheet["!merges"] = merges;

  worksheet["!cols"] = columns.map((c) => {
    const longestValue = rows.reduce((max, row) => Math.max(max, String(c.accessor(row)).length), 0);
    return { wch: Math.min(Math.max(c.header.length, longestValue) + 2, 48) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");

  XLSX.writeFile(workbook, buildFileName(options, "xlsx", now));
}
