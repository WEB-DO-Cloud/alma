const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const lingui = require("@lingui/metro-transformer/expo");
const {
  ensureMessageTemplate,
  ensureMessageTemplateSync,
  shouldExtractTemplate,
} = require("./message-template");

const upstream = require(process.env.RAKAZO_UPSTREAM_BABEL_TRANSFORMER);
const templatePath = path.resolve(__dirname, "../../packages/i18n/locales/messages.pot");

function templateStamp() {
  try {
    return createHash("sha1").update(fs.readFileSync(templatePath)).digest("hex");
  } catch {
    return "missing";
  }
}

module.exports = {
  ...upstream,
  getCacheKey(...args) {
    // Refresh the template before the cache key so a new string cannot reuse a catalog
    // compiled before it existed. Development skips this and keeps its runtime compiler.
    if (shouldExtractTemplate()) ensureMessageTemplateSync();
    const base = typeof upstream.getCacheKey === "function" ? upstream.getCacheKey(...args) : "";
    return `${base}$${templateStamp()}`;
  },
  async transform(params) {
    if (!params.filename.endsWith(".po")) return upstream.transform(params);
    // `options.dev` is the bundle Metro is producing. Release bundles set it false
    // even if NODE_ENV was not production when this file loaded.
    if (shouldExtractTemplate() || params.options?.dev === false) await ensureMessageTemplate();
    return lingui.transform(params);
  },
};
