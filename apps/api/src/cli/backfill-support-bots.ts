import { loadSupportChatwootConfig, supportBotActive } from "@rakazo/adapters";
import { backfillSupportBots, createDb } from "@rakazo/db";

/** Creates the pinned support bot for existing users. Safe to rerun. */
export async function runBackfillSupportBots(
  source: NodeJS.ProcessEnv = process.env,
  args: readonly string[] = process.argv.slice(2),
): Promise<{ users: number; created: number; existing: number }> {
  const dryRun = args.includes("--dry-run");
  const config = loadSupportChatwootConfig(source);
  if (!supportBotActive(config)) {
    return { users: 0, created: 0, existing: 0 };
  }
  const databaseUrl = source.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const db = createDb(databaseUrl);
  try {
    return await backfillSupportBots(db.prisma, {
      dryRun,
      ...(config.allowlist ? { userIds: config.allowlist } : {}),
    });
  } finally {
    await db.prisma.$disconnect();
    await db.pool.end();
  }
}

const isDirect = process.argv[1]?.includes("backfill-support-bots");
if (isDirect) {
  runBackfillSupportBots()
    .then((result) => {
      process.stdout.write(
        `${result.created} created, ${result.existing} existing, ${result.users} users\n`,
      );
    })
    .catch((error: unknown) => {
      process.stderr.write(error instanceof Error ? `${error.message}\n` : "backfill failed\n");
      process.exitCode = 1;
    });
}
