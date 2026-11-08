import { ORPCError } from "@orpc/server";
import { readMonthlyReportConfig } from "@rakazo/core";
import { adminMonthlyReport, userMonthlyReport } from "@rakazo/db";
import { requireAdmin } from "../admins.js";
import type { RouterContext } from "./context.js";

function requireReport(): void {
  if (!readMonthlyReportConfig().enabled) {
    throw new ORPCError("FORBIDDEN", { message: "monthly_report_disabled" });
  }
}

function monthOf(value: string | undefined): string {
  if (value && /^\d{4}-\d{2}$/.test(value)) return value;
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthlyReportRoutes(ctx: RouterContext) {
  const { authed, deps } = ctx;
  return {
    monthlyReport: {
      get: authed.monthlyReport.get.handler(async ({ context, input }) => {
        requireReport();
        const report = await userMonthlyReport(
          deps.prisma,
          context.actor.userId,
          monthOf(input.month),
        );
        if (!report) throw new ORPCError("BAD_REQUEST", { message: "monthly_report_disabled" });
        return report;
      }),
      admin: authed.monthlyReport.admin.handler(async ({ context, input }) => {
        requireReport();
        await requireAdmin(deps, context.actor.userId);
        const report = await adminMonthlyReport(deps.prisma, monthOf(input.month));
        if (!report) throw new ORPCError("BAD_REQUEST", { message: "monthly_report_disabled" });
        return report;
      }),
    },
  };
}
