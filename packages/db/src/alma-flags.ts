/** Phase 1 switches. Off unless the value is exactly `true`. */

export type AlmaFlags = {
  trialEnabled: boolean;
  /** Used only when `trialEnabled` is on. */
  trialDays: number;
  /** Used only when `trialEnabled` is on. */
  trialMessageCap: number;
  onboardingV2: boolean;
  /** Own Google OAuth client per organization. Off unless the value is exactly `true`. */
  googleByoOauth: boolean;
};

const DEFAULT_TRIAL_DAYS = 14;
const DEFAULT_TRIAL_MESSAGE_CAP = 50;

export function readAlmaFlags(source: NodeJS.ProcessEnv = process.env): AlmaFlags {
  const trialEnabled = source.ALMA_TRIAL_ENABLED === "true";
  const onboardingV2 = source.ALMA_ONBOARDING_V2 === "true";
  return {
    trialEnabled,
    trialDays: trialEnabled
      ? boundedInt(source.ALMA_TRIAL_DAYS, DEFAULT_TRIAL_DAYS, 1, 90, "ALMA_TRIAL_DAYS")
      : DEFAULT_TRIAL_DAYS,
    trialMessageCap: trialEnabled
      ? boundedInt(
          source.ALMA_TRIAL_MESSAGE_CAP,
          DEFAULT_TRIAL_MESSAGE_CAP,
          1,
          1000,
          "ALMA_TRIAL_MESSAGE_CAP",
        )
      : DEFAULT_TRIAL_MESSAGE_CAP,
    onboardingV2,
    googleByoOauth: source.ALMA_GOOGLE_BYO_OAUTH === "true",
  };
}

export function almaActivationEnabled(source: NodeJS.ProcessEnv = process.env): boolean {
  const flags = readAlmaFlags(source);
  return flags.trialEnabled || flags.onboardingV2;
}

function boundedInt(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
): number {
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  if (!/^\d+$/.test(trimmed)) throw new Error(`${name} must be an integer`);
  const value = Number(trimmed);
  if (value < min || value > max) throw new Error(`${name} must be between ${min} and ${max}`);
  return value;
}
