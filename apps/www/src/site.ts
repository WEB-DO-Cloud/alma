import { MOBILE_APP_STORES } from "@rakazo/contracts";

export const SITE_NAME = "ALMA";
export const SITE_URL = "https://alma.com.do";
export const SITE_DESCRIPTION =
  "ALMA is an open source Grok Bot alternative for persistent AI teammates that do real work. Your keys, your model, your machine.";

export const APP_URL = "https://app.alma.com.do";
export const PLUGIN_SUBMISSIONS_URL = `${APP_URL}/api/v1/plugin-submissions`;
export const INTEGRATION_CLAIMS_URL = `${APP_URL}/api/v1/integration-claims`;
/** Marketing catalog snapshot on this site. `CATALOG_URL` in the environment overrides the file. */
export const CATALOG_URL = `${SITE_URL}/integrations/catalog.json`;
export const GITHUB_URL = "https://github.com/WEB-DO-Cloud/alma";
export const DESKTOP_DOWNLOADS = {
  mac: "https://github.com/WEB-DO-Cloud/alma/releases/latest/download/ALMA-mac.dmg",
  windows: "https://github.com/WEB-DO-Cloud/alma/releases/latest/download/ALMA-Setup.exe",
  linux: "https://github.com/WEB-DO-Cloud/alma/releases/latest/download/ALMA-linux.AppImage",
} as const;
export const IOS_APP_URL = MOBILE_APP_STORES.ios;
export const ANDROID_APP_STORE_URL = MOBILE_APP_STORES.android;
export const GITHUB_API_REPO = "https://api.github.com/repos/WEB-DO-Cloud/alma";
export const DOCS_URL = `${SITE_URL}/docs/`;
export const SELF_HOST_SECRETS_URL = `${SITE_URL}/docs/self-host-secrets/`;
export const SELF_HOST_RESTRICTED_URL = `${SITE_URL}/docs/self-host-restricted-network/`;
export const SETUP_PROMPT_URL = `${GITHUB_URL}/blob/main/SETUP_PROMPT.md`;
export const SELF_HOST_GUIDE_PATH = "/self-hosted-ai-agent/";
export const PLUGIN_SUBMIT_PATH = "/plugins/submit/";
export const OPENCLAW_ALTERNATIVE_PATH = "/openclaw-alternative/";
export const CHANGELOG_URL = `${GITHUB_URL}/releases`;
export const LATEST_RELEASE_URL = `${CHANGELOG_URL}/latest`;
export const INBOX_ZERO_URL =
  "https://www.getinboxzero.com/?utm_source=alma&utm_medium=website&utm_campaign=footer";
