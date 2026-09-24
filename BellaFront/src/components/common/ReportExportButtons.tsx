import { useState } from "react";
import { FileText, FileSpreadsheet } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { exportReportToPdf, exportReportToExcel, type ReportColumn } from "../../utils/reportExport";
import "./ReportExportButtons.css";

// Barra reutilizable "Exportar PDF" / "Exportar Excel": exporta exactamente
// las filas recibidas (ya filtradas por la página que la usa).
export function ReportExportButtons<T>({
  title,
  columns,
  rows,
  filtersSummary,
  fileBaseName,
}: {
  title: string;
  columns: ReportColumn<T>[];
  rows: T[];
  filtersSummary?: string;
  fileBaseName: string;
}) {
  const { user } = useAuth();
  const [busy, setBusy] = useState<"pdf" | "excel" | null>(null);
  const disabled = rows.length === 0 || busy !== null;
  const downloadedBy = user?.displayName ?? "—";

  async function handlePdf() {
    setBusy("pdf");
    try {
      await exportReportToPdf({ title, columns, rows, downloadedBy, filtersSummary, fileBaseName });
    } finally {
      setBusy(null);
    }
  }

  async function handleExcel() {
    setBusy("excel");
    try {
      await exportReportToExcel({ title, columns, rows, downloadedBy, filtersSummary, fileBaseName });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="report-export">
      <button
        type="button"
        className="report-export__btn"
        onClick={handlePdf}
        disabled={disabled}
        title={rows.length === 0 ? "No hay datos para exportar" : "Exportar a PDF"}
      >
        <FileText size={16} /> Exportar PDF
      </button>
      <button
        type="button"
        className="report-export__btn"
        onClick={handleExcel}
        disabled={disabled}
        title={rows.length === 0 ? "No hay datos para exportar" : "Exportar a Excel"}
      >
        <FileSpreadsheet size={16} /> Exportar Excel
      </button>
    </div>
  );
}
