import { Suspense } from "react";
import { Editor } from "@/components/editor/editor";

// The editor reads the open component from the address, and stays as components open and close
export default function EditorLayout({
  children,
}: LayoutProps<"/[team]/[project]">) {
  return (
    <>
      <Suspense>
        <Editor />
      </Suspense>
      {children}
    </>
  );
}
