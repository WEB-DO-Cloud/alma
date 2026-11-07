import { Trans } from "@lingui/react/macro";
import { Button } from "@rakazo/ui-web";
import { useState } from "react";

/** The record and speak controls. Dev preview of the composer states. */
export function VoicePreviewPage() {
  const [recording, setRecording] = useState(false);
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
      <div className="flex items-center gap-2 rounded-[26px] border border-border px-3 py-2">
        <Button type="button" variant="outline" onClick={() => setRecording((value) => !value)}>
          {recording ? <Trans>Recording</Trans> : <Trans>Record</Trans>}
        </Button>
      </div>
      <div className="w-fit rounded-2xl bg-muted px-[18px] py-3">
        <p>Hello</p>
        <Button type="button" variant="text" size="xs" className="mt-2 font-normal">
          <Trans>Speak</Trans>
        </Button>
      </div>
    </main>
  );
}
