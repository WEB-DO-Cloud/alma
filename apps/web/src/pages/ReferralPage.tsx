import { Trans, useLingui } from "@lingui/react/macro";
import { DEFAULT_SHARE_TEXT } from "@rakazo/core";
import { Button } from "@rakazo/ui-web";
import { useEffect, useState } from "react";
import { rpc } from "../lib/rpc";

const preview =
  import.meta.env.DEV &&
  (window.location.pathname.startsWith("/preview/") ||
    new URLSearchParams(window.location.search).get("preview") === "1");

/** Personal referral link. The share sheet is the device share, or copy. */
export function ReferralPage() {
  const { t } = useLingui();
  const [shown, setShown] = useState(preview);
  const [url, setUrl] = useState(preview ? "https://app.example.test/sign-up?ref=abc" : "");
  const [text, setText] = useState(DEFAULT_SHARE_TEXT);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (preview) return;
    void rpc
      .me()
      .then(async (me) => {
        if (!me.referralPromptEnabled) return;
        setShown(true);
        const share = await rpc.referralShare.get();
        if (share.url) setUrl(share.url);
        if (share.text) setText(share.text);
      })
      .catch(() => undefined);
  }, []);

  if (!shown) return null;
  return (
    <main className="mx-auto flex w-full max-w-xl flex-col gap-4 p-6">
      <h1 className="text-heading3 font-medium text-foreground">
        <Trans>Share ALMA</Trans>
      </h1>
      <textarea
        aria-label={t`Share text`}
        className="border-border bg-background min-h-24 rounded-md border px-3 py-2"
        maxLength={280}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {url ? <p className="text-body-sm text-muted-foreground">{url}</p> : null}
      <Button
        type="button"
        onClick={() => {
          const payload = { title: "ALMA", text, url };
          const copy = () =>
            void navigator.clipboard.writeText(`${text}\n${url}`).then(() => setNotice(t`Copied`));
          if (navigator.share) {
            void navigator.share(payload).catch(copy);
            return;
          }
          copy();
        }}
      >
        <Trans>Share</Trans>
      </Button>
      {notice ? <p>{notice}</p> : null}
    </main>
  );
}
