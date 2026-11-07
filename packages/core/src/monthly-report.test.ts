import { describe, expect, it } from "vitest";
import { buildMonthlyReport, HOURS_METHOD, readMonthlyReportConfig } from "./monthly-report.js";
import { renderReportPdf } from "./monthly-report-pdf.js";

const empty = {
  tasksFinished: 0,
  practiceTasks: 0,
  draftsWritten: 0,
  draftsApproved: 0,
  emailsMarkedSent: 0,
  reminders: 0,
  clients: [],
};

describe("monthly report flag", () => {
  it("is on only for the exact string true", () => {
    for (const value of [undefined, "", "1", "yes", "TRUE"]) {
      expect(readMonthlyReportConfig({ ALMA_MONTHLY_REPORT: value }).enabled).toBe(false);
    }
    expect(readMonthlyReportConfig({ ALMA_MONTHLY_REPORT: "true" }).enabled).toBe(true);
  });
});

describe("buildMonthlyReport", () => {
  it("shows No data instead of zero, including meetings and minutes", () => {
    const report = buildMonthlyReport(empty);
    expect(report.lines.every((line) => line.value === "No data")).toBe(true);
    expect(report.practice).toBeNull();
    expect(report.clients).toEqual([]);
    expect(report.lines.map((line) => line.value).join(" ")).not.toContain("0");
  });

  it("turns three finished tasks into 15 to 45 minutes and keeps practice out", () => {
    const report = buildMonthlyReport({ ...empty, tasksFinished: 3, practiceTasks: 2 });
    expect(report.lines.find((line) => line.key === "report.minutes")?.value).toBe(
      "15 to 45 minutes",
    );
    expect(report.lines.find((line) => line.key === "report.tasks")?.value).toBe("3");
    expect(report.practice).toBe("2");
    expect(HOURS_METHOD).toBe("Each finished task counts as 5 to 15 minutes.");
  });

  it("adds a client block only when a client is in the input", () => {
    const report = buildMonthlyReport({
      ...empty,
      clients: [{ label: "North", draftsWritten: 0, draftsApproved: 1, emailsMarkedSent: 0 }],
    });
    expect(report.clients).toHaveLength(1);
    expect(report.clients[0]?.label).toBe("North");
    expect(
      report.clients[0]?.lines.find((line) => line.key === "report.draftsApproved")?.value,
    ).toBe("1");
  });
});

describe("renderReportPdf", () => {
  it("contains the title and the method and not a zero for an empty line", () => {
    const report = buildMonthlyReport(empty);
    const pdf = new TextDecoder().decode(
      renderReportPdf({
        title: "This month",
        lines: report.lines,
        practice: report.practice,
        method: HOURS_METHOD,
      }),
    );
    expect(pdf.startsWith("%PDF-1.4")).toBe(true);
    expect(pdf).toContain("This month");
    expect(pdf).toContain(HOURS_METHOD);
    expect(pdf).toContain("No data");
    expect(pdf).not.toContain("Meetings: 0");
  });
});
