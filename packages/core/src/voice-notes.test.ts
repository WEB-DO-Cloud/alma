import { describe, expect, it } from "vitest";
import {
  nextTranscript,
  readVoiceNotesConfig,
  recordingLabel,
  splitTranscript,
} from "./voice-notes.js";

describe("voice notes flag", () => {
  it("is on only for the exact string true", () => {
    for (const value of [undefined, "", "1", "yes", "TRUE"]) {
      expect(readVoiceNotesConfig({ ALMA_VOICE_NOTES: value }).enabled).toBe(false);
    }
    expect(readVoiceNotesConfig({ ALMA_VOICE_NOTES: "true" }).enabled).toBe(true);
  });
});

describe("splitTranscript", () => {
  it("caps the title and keeps the rest as the body", () => {
    const split = splitTranscript(`${"a".repeat(90)}\nsecond line`);
    expect(split.title).toHaveLength(80);
    expect(split.body).toBe("second line");
    expect(splitTranscript("  Hello  \n\nmore")).toEqual({ title: "Hello", body: "more" });
    expect(splitTranscript("   \n")).toEqual({ title: "", body: "" });
  });
});

describe("transcript edits", () => {
  it("updates text in place and keeps a saved note", () => {
    const saved = nextTranscript(
      { text: "old", status: "saved", noteTitle: "Title", noteBody: "Body" },
      "new words",
    );
    expect(saved).toEqual({
      text: "new words",
      status: "saved",
      noteTitle: "Title",
      noteBody: "Body",
    });
    expect(nextTranscript(null, "  ")).toBeNull();
  });

  it("names the recording states", () => {
    expect(recordingLabel("recording")).toBe("Recording");
    expect(recordingLabel("transcribing")).toBe("Transcribing");
    expect(recordingLabel("idle")).toBeNull();
  });
});
