// Utilidad reutilizable de exportación de reportes con marca, usada por
// InventoryPage y ProductsPage para exportar a PDF/Excel exactamente lo
// visible en pantalla. No es un módulo de reportes con definiciones
// guardadas ni programación, solo "exporta lo que ves".
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";

export interface ReportColumn<T> {
  header: string;
  accessor: (row: T) => string | number;
}

export interface ReportOptions<T> {
  /** ej. "Reporte de Inventario", se muestra como título del documento. */
  title: string;
  columns: ReportColumn<T>[];
  rows: T[];
  /** displayName del usuario actual, se muestra en el pie/meta. */
  downloadedBy: string;
  /** Descripción de una línea de los filtros activos, ej. "Sucursal: Centro · Estado: Bajo".
   *  Omitir por completo (no pasar string vacío) si no hay filtros activos. */
  filtersSummary?: string;
  /** Nombre base del archivo, ej. "inventario" -> "inventario-2026-09-19.pdf".
   *  Por defecto usa un slug de `title` si se omite. */
  fileBaseName?: string;
}

// ---------- Tokens de marca: reflejan BellaFront/src/styles/tokens.css
// para que los documentos exportados se vean de esta app. Se guardan como
// hex plano (no leídos de CSS en runtime) porque jsPDF/SheetJS necesitan
// valores de color literales, no custom properties. ----------
const BRAND = {
  pinkDeep: "#0066CC", // --color-pink-deep
  ink: "#1D1D1F", // --color-ink
  white: "#FFFFFF", // --color-white
  bg: "#F5F5F7", // --color-bg
  border: "#E0E0E0", // --color-border
  textSecondary: "#6E6E73", // --color-text-secondary
  textMuted: "#86868B", // --color-text-muted
};

// Se usa la variante pre-dimensionada de 480px de ancho en vez del logo a
// resolución completa: jsPDF incrusta PNGs con canal alfa como bitmap
// crudo, así que el logo completo inflaba los PDF exportados a ~1.8MB. A
// la altura que realmente se renderiza (~12mm), 480px es más que suficiente.
const LOGO_URL = "/brand/logo-full-480.png";

interface LogoInfo {
  dataUrl: string;
  width: number;
  height: number;
}

// Se guarda en caché durante la sesión: el logo nunca cambia en runtime,
// no hay razón para volver a obtenerlo/codificarlo en cada exportación.
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
        // Un logo faltante o roto no debe bloquear la exportación: el
        // reporte simplemente se genera sin él.
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
  // Quita las marcas diacríticas combinantes (U+0300-U+036F) que deja la
  // normalización NFD, carácter por carácter (no con un regex literal que
  // contenga esas marcas), igual que el slugify de RoleFormModal.tsx.
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

// Solo lee `title`/`fileBaseName`, tipado como un pick acotado en vez del
// genérico completo `ReportOptions<T>` para que llamadores con cualquier
// `T` puedan pasar sus opciones directamente sin error de tipos.
function buildFileName(options: Pick<ReportOptions<unknown>, "title" | "fileBaseName">, ext: string, now: Date): string {
  const base = options.fileBaseName ?? slugify(options.title);
  return `${base}-${dateSlug(now)}.${ext}`;
}

// ---------- PDF ----------

export async function exportReportToPdf<T>(options: ReportOptions<T>): Promise<void> {
  const { title, columns, rows, downloadedBy, filtersSummary } = options;
  const now = new Date();

  // Horizontal se lee mejor que vertical para tablas anchas (5-7 columnas).
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

  // Pie con fecha/usuario + "Página X de Y" en cada página. El total real
  // de páginas no se conoce dentro del hook didDrawPage de autoTable
  // mientras aún dibuja, así que se recorre cada página ya con la tabla
  // completa para estampar el total correcto.
  const pageCount = doc.getNumberOfPages();
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

// SheetJS Community Edition (el paquete `xlsx` instalado aquí) no escribe
// de forma confiable el estilo de celdas (fuentes/rellenos/colores); eso es
// una función solo de SheetJS Pro. Por eso esta exportación se apoya en lo
// que sí funciona en la versión gratuita: filas de encabezado combinadas y
// anchos de columna, para una hoja bien organizada sin prometer colores o negritas.
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
