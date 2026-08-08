export function formatDateLabel(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

export function formatTimeLabel(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-EC", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}

export function formatAmountLabel(amountCents: number, currency: string): string {
  return `${currency} ${(amountCents / 100).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
