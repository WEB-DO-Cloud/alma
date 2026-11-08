import type { ReportLine } from "./monthly-report.js";
import { HOURS_METHOD } from "./monthly-report.js";

function escapePdf(text: string): string {
  return text.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

/** Text-only PDF. Same lines as the page. No chart and no extra package. */
export function renderReportPdf(input: {
  title: string;
  lines: readonly ReportLine[];
  practice: string | null;
  method: string;
}): Uint8Array {
  const rows = [
    input.title,
    ...input.lines.map((line) => `${line.label}: ${line.value}`),
    ...(input.practice ? [`Practice: ${input.practice}`] : []),
    input.method,
  ];
  const commands = ["BT", "/F1 12 Tf", "72 720 Td"];
  rows.forEach((row, index) => {
    if (index > 0) commands.push("0 -18 Td");
    commands.push(`(${escapePdf(row)}) Tj`);
  });
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const object of objects) {
    offsets.push(body.length);
    body += object;
  }
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

export { HOURS_METHOD };
