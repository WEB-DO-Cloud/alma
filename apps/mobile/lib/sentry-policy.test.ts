import { describe, expect, it } from "vitest";
import { mobileReportingEnabled, sentryUploadAllowed } from "./sentry-policy";

const SELF_HOSTED = "https://key@errors.example.com/8";
const VENDOR = "https://key@o123.ingest.sentry.io/8";

describe("mobile reporting", () => {
  it("allows a self-hosted DSN and refuses hosted Sentry", () => {
    expect(mobileReportingEnabled(SELF_HOSTED, {})).toBe(true);
    expect(mobileReportingEnabled(VENDOR, {})).toBe(false);
    expect(mobileReportingEnabled("https://sentry.io/8", {})).toBe(false);
    expect(mobileReportingEnabled(null, {})).toBe(false);
  });

  it("stays off when the env flag is off, even for a self-hosted DSN", () => {
    expect(mobileReportingEnabled(SELF_HOSTED, { EXPO_PUBLIC_SENTRY_ENABLED: "0" })).toBe(false);
    expect(mobileReportingEnabled(SELF_HOSTED, { EXPO_PUBLIC_SENTRY_ENABLED: "false" })).toBe(
      false,
    );
  });
});

describe("sentry upload plugin", () => {
  it("requires a token and a self-hosted URL", () => {
    expect(sentryUploadAllowed({})).toBe(false);
    expect(sentryUploadAllowed({ SENTRY_AUTH_TOKEN: "token" })).toBe(false);
    expect(
      sentryUploadAllowed({
        SENTRY_AUTH_TOKEN: "token",
        SENTRY_URL: "https://sentry.io",
      }),
    ).toBe(false);
    expect(
      sentryUploadAllowed({
        SENTRY_AUTH_TOKEN: "token",
        SENTRY_URL: "https://errors.example.com",
      }),
    ).toBe(true);
    expect(
      sentryUploadAllowed({
        SENTRY_AUTH_TOKEN: "token",
        SENTRY_URL: "https://errors.example.com",
        EXPO_PUBLIC_SENTRY_ENABLED: "off",
      }),
    ).toBe(false);
  });
});
