const MONTHS_ES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
] as const;

/** The sentence printed on a document after a named lawyer approves it. */
export function approvedDraftFooterLine(input: {
  name: string;
  cardNumber: string;
  approvedAt: Date;
}): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santo_Domingo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(input.approvedAt);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const date = `${day} de ${MONTHS_ES[month - 1] ?? ""} de ${year}`;
  return `Borrador preparado con asistencia de software y revisado y aprobado por Lic. ${input.name}, CARD ${input.cardNumber}, el ${date}.`;
}
