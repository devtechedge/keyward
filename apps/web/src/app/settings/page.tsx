import type { Metadata } from "next";
import { ConnectionsPanel } from "../../components/ConnectionsPanel";

export const metadata: Metadata = {
  title: "Settings - keyward",
  description: "Connect a provider or a GitHub account to the keyward control plane.",
};

export default function SettingsPage() {
  return (
    <main className="shell" style={{ paddingTop: 40, paddingBottom: 20 }}>
      <div style={{ marginBottom: 26 }}>
        <span className="eyebrow">Settings</span>
        <h1 style={{ fontSize: "2rem", marginTop: 10 }}>Connect your accounts</h1>
        <p className="lede" style={{ marginTop: 12 }}>
          keyward needs one credential per provider to list your keys and read your spend. Each one is
          encrypted before it is stored.
        </p>
      </div>

      <ConnectionsPanel />
    </main>
  );
}
