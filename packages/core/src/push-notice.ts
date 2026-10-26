/** Push text that may leave the device. Never includes a client, matter, or draft. */
export const ALMA_PUSH_TITLE = "ALMA";
export const ALMA_PUSH_BODY = "Hay un borrador pendiente de revisión";

export interface PushNoticeInput {
  kind?: string;
  title?: string;
  body?: string;
}

/**
 * Replace whatever the sender wrote. Titles and bodies can carry case content,
 * and the push itself is delivered by a service outside the firm.
 */
export function sanitizePushPayload(_message: PushNoticeInput = {}): {
  title: string;
  body: string;
} {
  return { title: ALMA_PUSH_TITLE, body: ALMA_PUSH_BODY };
}
