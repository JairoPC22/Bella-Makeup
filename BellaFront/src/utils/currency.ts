export const currencyFormatter = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

export const compactCurrencyFormatter = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 0,
});
