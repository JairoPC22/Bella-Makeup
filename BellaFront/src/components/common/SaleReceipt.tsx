import { useEffect, useState } from "react";
import { Printer } from "lucide-react";
import * as companySettingsService from "../../services/companySettingsService";
import type { CompanySettings, Sale } from "../../types/api";
import "./SaleReceipt.css";

import { currencyFormatter } from "../../utils/currency";

const PAYMENT_METHOD_LABEL: Record<Sale["payments"][number]["method"], string> = {
  CASH: "Efectivo",
  CARD: "Tarjeta",
  TRANSFER: "Transferencia",
  OTHER: "Otro",
};

// Reusable ticket/receipt view — takes a full Sale response (create/list/
// detail/cancel all share the same shape, see saleRepository.ts's
// saleInclude) and renders it as a narrow, printable receipt. Used both
// right after a POS checkout and from the sales-history detail view, so it
// deliberately has zero POS-page-specific state of its own.
export function SaleReceipt({ sale }: { sale: Sale }) {
  const [company, setCompany] = useState<CompanySettings | null>(null);

  // Fetched once per mount rather than lifted to a prop — this component is
  // reused from two unrelated pages (PosPage, SalesPage) and company info
  // rarely changes, so a small independent fetch here is simpler than
  // threading it through both parents.
  useEffect(() => {
    companySettingsService.getCompanySettings().then(setCompany).catch(() => {});
  }, []);

  const paymentsTotal = sale.payments.reduce((sum, p) => sum + Number(p.amount), 0);
  // changeDue is only present on the response right after checkout (see
  // saleService.ts's mapSale) — list/detail/cancel responses omit it, so it's
  // recomputed here from payments vs. total for those views. Never negative:
  // an underpaid sale couldn't have been created in the first place (the
  // server rejects payments that don't cover the total).
  const changeDue = sale.changeDue ?? Math.max(0, Math.round((paymentsTotal - Number(sale.total)) * 100) / 100);

  return (
    <div className="sale-receipt">
      <div className="sale-receipt__toolbar">
        <button type="button" className="sale-receipt__print-btn" onClick={() => window.print()}>
          <Printer size={16} /> Imprimir
        </button>
      </div>

      <div className="sale-receipt__paper">
        <header className="sale-receipt__header">
          <p className="sale-receipt__company">{company?.companyName ?? "Bella Makeup"}</p>
          {company?.address && <p className="sale-receipt__meta">{company.address}</p>}
          {company?.phone && <p className="sale-receipt__meta">{company.phone}</p>}
        </header>

        <div className="sale-receipt__divider" />

        <div className="sale-receipt__info">
          <div className="sale-receipt__info-row"><span>Folio</span><strong>{sale.ticketNumber}</strong></div>
          <div className="sale-receipt__info-row"><span>Fecha</span><span>{new Date(sale.createdAt).toLocaleString("es-MX")}</span></div>
          <div className="sale-receipt__info-row"><span>Sucursal</span><span>{sale.branch.name}</span></div>
          <div className="sale-receipt__info-row"><span>Cajero</span><span>{sale.user.displayName}</span></div>
          <div className="sale-receipt__info-row"><span>Cliente</span><span>{sale.customerName}</span></div>
        </div>

        {sale.status === "CANCELLED" && (
          <p className="sale-receipt__cancelled">
            Venta cancelada{sale.cancelReason ? ` — ${sale.cancelReason}` : ""}
          </p>
        )}

        <div className="sale-receipt__divider" />

        <table className="sale-receipt__items">
          <thead>
            <tr><th>Producto</th><th>Cant.</th><th>P. unit.</th><th>Total</th></tr>
          </thead>
          <tbody>
            {sale.items.map((item) => (
              <tr key={item.id}>
                <td>{item.product.name}{item.variant ? ` — ${item.variant.name}` : ""}</td>
                <td>{item.quantity}</td>
                <td>{currencyFormatter.format(Number(item.unitPrice))}</td>
                <td>{currencyFormatter.format(Number(item.lineTotal))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="sale-receipt__divider" />

        <div className="sale-receipt__totals">
          <div className="sale-receipt__totals-row"><span>Subtotal</span><span>{currencyFormatter.format(Number(sale.subtotal))}</span></div>
          <div className="sale-receipt__totals-row"><span>Descuento</span><span>-{currencyFormatter.format(Number(sale.discountTotal))}</span></div>
          <div className="sale-receipt__totals-row"><span>Impuesto</span><span>{currencyFormatter.format(Number(sale.taxTotal))}</span></div>
          <div className="sale-receipt__totals-row sale-receipt__totals-row--total"><span>Total</span><span>{currencyFormatter.format(Number(sale.total))}</span></div>
        </div>

        <div className="sale-receipt__divider" />

        <div className="sale-receipt__payments">
          {sale.payments.map((p) => (
            <div key={p.id} className="sale-receipt__totals-row">
              <span>{PAYMENT_METHOD_LABEL[p.method]}{p.reference ? ` (${p.reference})` : ""}</span>
              <span>{currencyFormatter.format(Number(p.amount))}</span>
            </div>
          ))}
          {sale.status === "COMPLETED" && changeDue > 0 && (
            <div className="sale-receipt__totals-row sale-receipt__totals-row--change">
              <span>Cambio</span><span>{currencyFormatter.format(changeDue)}</span>
            </div>
          )}
        </div>

        <footer className="sale-receipt__footer">
          <p>Gracias por tu compra en {company?.companyName ?? "Bella Makeup"}.</p>
        </footer>
      </div>
    </div>
  );
}
