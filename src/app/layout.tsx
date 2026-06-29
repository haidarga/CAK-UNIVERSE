import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CAK AI Ecosystem",
  description: "Multi-agent platform for an AI UGC marketing agency",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
