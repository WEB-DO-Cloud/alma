/** Monthly counts. Off unless the value is exactly `true`. */

export type MonthlyReportConfig = { enabled: boolean };

export function readMonthlyReportConfig(
  source: NodeJS.ProcessEnv = process.env,
): MonthlyReportConfig {
  return { enabled: source.ALMA_MONTHLY_REPORT === "true" };
}

export type ReportLine = { key: string; label: string; value: string };

export type MonthlyReportInput = {
  tasksFinished: number;
  practiceTasks: number;
  draftsWritten: number;
  draftsApproved: number;
  emailsMarkedSent: number;
  reminders: number;
  clients: ReadonlyArray<{
    label: string;
    draftsWritten: number;
    draftsApproved: number;
    emailsMarkedSent: number;
  }>;
};

const NO_DATA = "No data";

function countOrEmpty(count: number): string {
  return count > 0 ? String(count) : NO_DATA;
}

/** Zero is "No data". Hours are the two minute totals, not a converted hour figure. */
export function buildMonthlyReport(input: MonthlyReportInput): {
  lines: ReportLine[];
  practice: string | null;
  clients: Array<{ label: string; lines: ReportLine[] }>;
} {
  const lines: ReportLine[] = [
    { key: "report.tasks", label: "Tasks finished", value: countOrEmpty(input.tasksFinished) },
    {
      key: "report.draftsWritten",
      label: "Drafts written",
      value: countOrEmpty(input.draftsWritten),
    },
    {
      key: "report.draftsApproved",
      label: "Drafts approved",
      value: countOrEmpty(input.draftsApproved),
    },
    {
      key: "report.emails",
      label: "Marked sent",
      value: countOrEmpty(input.emailsMarkedSent),
    },
    { key: "report.reminders", label: "Reminders", value: countOrEmpty(input.reminders) },
    { key: "report.meetings", label: "Meetings", value: NO_DATA },
    {
      key: "report.minutes",
      label: "Minutes",
      value:
        input.tasksFinished > 0
          ? `${input.tasksFinished * 5} to ${input.tasksFinished * 15} minutes`
          : NO_DATA,
    },
  ];
  return {
    lines,
    practice: input.practiceTasks > 0 ? String(input.practiceTasks) : null,
    clients: input.clients.map((client) => ({
      label: client.label,
      lines: [
        {
          key: "report.draftsWritten",
          label: "Drafts written",
          value: countOrEmpty(client.draftsWritten),
        },
        {
          key: "report.draftsApproved",
          label: "Drafts approved",
          value: countOrEmpty(client.draftsApproved),
        },
        {
          key: "report.emails",
          label: "Marked sent",
          value: countOrEmpty(client.emailsMarkedSent),
        },
      ],
    })),
  };
}

export const HOURS_METHOD = "Each finished task counts as 5 to 15 minutes.";
