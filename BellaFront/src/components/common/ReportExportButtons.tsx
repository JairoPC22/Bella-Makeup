import { useState } from "react";
import { FileText, FileSpreadsheet } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { exportReportToPdf, exportReportToExcel, type ReportColumn } from "../../utils/reportExport";
import "./ReportExportButtons.css";

// Reusable "Exportar PDF" / "Exportar Excel" toolbar — exports exactly the
// rows currently passed in (i.e. whatever the host page's own filters have
// already narrowed down), branded with the app's logo/colors. Used by
// InventoryPage and ProductsPage; any future filterable table page can
// reuse it the same way instead of hand-rolling its own export buttons.
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
