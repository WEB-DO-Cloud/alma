// Separate keys so a count written by another tab can never undo a dismissal.
export const STAR_PROMPT_SENT_KEY = "rakazo.githubStarPrompt.sent";
export const STAR_PROMPT_DISMISSED_KEY = "rakazo.githubStarPrompt.dismissed";

/** ALMA does not ask for a GitHub star. */
export function recordMessageSent(): void {}

export function resetStarPromptSessionForTests() {}
