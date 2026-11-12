import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SmallScreen } from "@/components/small-screen";
import { cn } from "@/lib/utils";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetBrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Compono",
  description: "Build React components by wiring nodes together.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn(
        "dark h-full scheme-dark font-sans antialiased",
        inter.variable,
        jetBrainsMono.variable,
      )}
    >
      <body className="flex min-h-full flex-col">
        {/* Compono needs at least a large tablet's width */}
        <div className="hidden flex-1 flex-col lg:flex">
          <Providers>{children}</Providers>
        </div>
        <div className="flex flex-1 flex-col lg:hidden">
          <SmallScreen />
        </div>
      </body>
    </html>
  );
}
