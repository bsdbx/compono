"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { CenteredPage } from "@/components/centered-page";
import { Button } from "@/components/ui/button";

/** What a window narrower than a large tablet shows instead of the app. */
export function SmallScreen() {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
  }

  return (
    <CenteredPage
      title="Compono works on desktop"
      description="Building components needs a bigger screen. Open Compono on a computer or a large tablet."
    >
      <Button
        size="lg"
        variant="secondary"
        onClick={() => {
          void copyLink();
        }}
      >
        <Copy />
        {copied ? "Link copied" : "Copy link"}
      </Button>
    </CenteredPage>
  );
}
