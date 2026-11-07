import { createHash } from "node:crypto";

/** SHA-256 of the exact outbound text. Node only: the browser bundle must not import this. */
export function draftBodyHash(payload: {
  recipient: string;
  channel: string;
  body: string;
  attachmentIds: readonly string[];
}): string {
  const canonical = JSON.stringify({
    recipient: payload.recipient,
    channel: payload.channel,
    body: payload.body,
    attachmentIds: [...payload.attachmentIds].sort(),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}
