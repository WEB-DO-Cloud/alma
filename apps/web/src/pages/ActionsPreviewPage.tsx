import { QuickActions } from "../components/QuickActions";

/** Dev preview of the camera, share, and voice entry points. */
export function ActionsPreviewPage() {
  return (
    <main className="mx-auto w-full max-w-xl p-6">
      <QuickActions onCamera={() => undefined} onVoice={() => undefined} />
    </main>
  );
}
