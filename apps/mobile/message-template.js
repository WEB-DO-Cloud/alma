const { execFileSync } = require("node:child_process");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const completed = new Set();
const jobs = new Map();

/**
 * Production bundles drop Lingui's runtime compiler. A string that is not in the
 * committed catalogs still interpolates when this template was compiled into them.
 * Development keeps the compiler, so only a production Node process extracts here.
 * The Metro transformer also extracts when the bundle itself is a release build.
 */
function shouldExtractTemplate(env = process.env) {
  return env.NODE_ENV === "production";
}

function extract(cwd, configPath) {
  const key = `${cwd}\0${configPath ?? ""}`;
  if (completed.has(key)) return;
  const cli = path.join(
    path.dirname(require.resolve("@lingui/cli", { paths: [cwd, __dirname, repoRoot] })),
    "lingui.js",
  );
  const args = [cli, "extract-template", "--workers", "1"];
  if (configPath) args.push("--config", configPath);
  try {
    execFileSync(process.execPath, args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stderr = error?.stderr ? String(error.stderr) : "";
    const stdout = error?.stdout ? String(error.stdout) : "";
    throw new Error(`lingui extract-template failed\n${stdout}\n${stderr}`, { cause: error });
  }
  completed.add(key);
}

function ensureMessageTemplateSync(options = {}) {
  extract(options.cwd ?? repoRoot, options.configPath);
}

function ensureMessageTemplate(options = {}) {
  const cwd = options.cwd ?? repoRoot;
  const configPath = options.configPath;
  const key = `${cwd}\0${configPath ?? ""}`;
  if (completed.has(key)) return Promise.resolve();
  let job = jobs.get(key);
  if (!job) {
    job = Promise.resolve().then(() => extract(cwd, configPath));
    jobs.set(key, job);
  }
  return job;
}

module.exports = {
  ensureMessageTemplate,
  ensureMessageTemplateSync,
  shouldExtractTemplate,
};
