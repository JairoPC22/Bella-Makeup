import { useEffect, useState } from "react";
import * as XLSX from "xlsx";
import { Download, ExternalLink } from "lucide-react";
import { Modal } from "./Modal";
import { StatusState } from "./StatusState";
import { buildAttachmentUrl } from "../../services/messageService";
import type { MessageAttachment } from "../../types/api";
import "./AttachmentPreviewModal.css";

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const PDF_MIME = "application/pdf";
const EXCEL_MIME = new Set([
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

// Limita la tabla renderizada para que un libro muy grande no cuelgue el
// navegador — el archivo completo siempre está a un clic vía el botón de descarga.
const MAX_EXCEL_ROWS = 200;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type ExcelState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; rows: unknown[][]; totalRows: number; sheetName: string; sheetCount: number };

// Descarga y parsea el libro en el cliente con SheetJS (xlsx), renderizando
// solo la primera hoja como tabla HTML simple — un selector de pestañas para
// múltiples hojas sería sobreingeniería para una vista previa de adjunto de chat.
function ExcelPreview({ url }: { url: string }) {
  const [state, setState] = useState<ExcelState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });

    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = await res.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const allRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });
        if (cancelled) return;
        setState({
          status: "ready",
          rows: allRows.slice(0, MAX_EXCEL_ROWS),
          totalRows: allRows.length,
          sheetName,
          sheetCount: workbook.SheetNames.length,
        });
      } catch {
        if (!cancelled) setState({ status: "error" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state.status === "loading") {
    return <StatusState kind="loading" message="Leyendo la hoja de cálculo..." />;
  }
  if (state.status === "error") {
    return <StatusState kind="error" message="No se pudo leer el archivo de Excel." />;
  }

  const { rows, totalRows, sheetName, sheetCount } = state;
  const truncated = totalRows > MAX_EXCEL_ROWS;

  return (
    <div className="attachment-preview__excel">
      <p className="attachment-preview__excel-note">
        Mostrando la hoja &ldquo;{sheetName}&rdquo;{sheetCount > 1 ? ` de ${sheetCount}` : ""}
      </p>
      <div className="attachment-preview__excel-scroll">
        <table className="attachment-preview__excel-table">
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {row.map((cell, j) => (
                  <td key={j}>{cell === undefined || cell === null ? "" : String(cell)}</td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td className="attachment-preview__excel-empty">La hoja está vacía.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {truncated && (
        <p className="attachment-preview__excel-truncated">
          Mostrando las primeras {MAX_EXCEL_ROWS} filas — descarga el archivo para verlo completo.
        </p>
      )}
    </div>
  );
}

function AttachmentPreviewContent({ attachment, url }: { attachment: MessageAttachment; url: string }) {
  if (IMAGE_MIME.has(attachment.mimeType)) {
    return (
      <div className="attachment-preview__image-wrap">
        <img src={url} alt={attachment.fileName} className="attachment-preview__image" />
      </div>
    );
  }

  if (attachment.mimeType === PDF_MIME) {
    return (
      <div className="attachment-preview__pdf-wrap">
        <a className="attachment-preview__new-tab" href={url} target="_blank" rel="noreferrer">
          <ExternalLink size={14} /> Abrir en una pestaña nueva
        </a>
        {/* Los navegadores renderizan PDFs de forma nativa dentro de un iframe —
           no se necesita una librería visor para la experiencia principal. */}
        <iframe src={url} title={attachment.fileName} className="attachment-preview__pdf" />
      </div>
    );
  }

  if (EXCEL_MIME.has(attachment.mimeType)) {
    return <ExcelPreview url={url} key={url} />;
  }

  return (
    <StatusState
      kind="empty"
      message="Vista previa no disponible. Usa el botón de descarga para abrir el archivo."
    />
  );
}

export function AttachmentPreviewModal({
  attachment,
  open,
  onClose,
}: {
  attachment: MessageAttachment | null;
  open: boolean;
  onClose: () => void;
}) {
  const url = attachment ? buildAttachmentUrl(attachment.url) : "";

  return (
    <Modal open={open && !!attachment} onClose={onClose} title={attachment?.fileName ?? ""} className="attachment-preview-modal">
      {attachment && (
        <div className="attachment-preview">
          <div className="attachment-preview__meta">
            <span className="attachment-preview__size">{formatFileSize(attachment.size)}</span>
            <a className="attachment-preview__download" href={url} download={attachment.fileName}>
              <Download size={14} /> Descargar
            </a>
          </div>
          <AttachmentPreviewContent attachment={attachment} url={url} />
        </div>
      )}
    </Modal>
  );
}
