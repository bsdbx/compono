import Link from "next/link";
import { CenteredPage } from "@/components/centered-page";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <CenteredPage
      title="Page not found"
      description="This page doesn’t exist, or you don’t have access to it."
    >
      <Button size="lg" asChild>
        <Link href="/">Back to projects</Link>
      </Button>
    </CenteredPage>
  );
}
