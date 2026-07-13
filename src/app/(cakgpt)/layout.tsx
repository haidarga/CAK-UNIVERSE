import type { Metadata } from "next";
import { NavShell } from "@/components/cakgpt/NavShell";
import { getActiveClientId } from "@/lib/cakgpt/active-client";

export const metadata: Metadata = {
  title: "CAKGPT — Script Studio",
  description: "Scriptwriter throughput platform",
};

// Standalone CAKGPT studio inside the ecosystem. Everything renders under
// `.sw-root`, which re-scopes the design tokens to CAKGPT's light data-dense
// theme (see globals.css) so the studio looks exactly like the standalone app
// while the rest of the ecosystem keeps its Ethereal-Glass dark theme.
export default async function CakgptLayout({ children }: { children: React.ReactNode }) {
  const activeClient = await getActiveClientId();
  return (
    <div className="sw-root">
      <NavShell initialClient={activeClient}>{children}</NavShell>
    </div>
  );
}
