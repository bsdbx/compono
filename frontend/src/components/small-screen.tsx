import { CenteredPage } from "@/components/centered-page";
import { CopyButton } from "@/components/ui/copy-button";

/** What a window narrower than a large tablet shows instead of the app. */
export function SmallScreen() {
  return (
    <CenteredPage
      title="Compono works on desktop"
      description="Building components needs a bigger screen. Open Compono on a computer or a large tablet."
    >
      <CopyButton
        size="lg"
        variant="secondary"
        text={window.location.href}
        label="Copy link"
        copiedLabel="Link copied"
      />
    </CenteredPage>
  );
}
