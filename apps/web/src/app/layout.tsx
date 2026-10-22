import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { CopyButtons } from "../components/CopyButtons";
import { ThemeToggle } from "../components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "keyward - find, rotate and police every AI API key your company holds",
  description:
    "keyward finds every AI provider key in your stack, rotates them across every consumer with verification and rollback, and alerts you when spend breaks pattern.",
  keywords: [
    "AI API key management",
    "key rotation",
    "secret scanning",
    "AI spend anomaly",
    "OpenAI key rotation",
    "Anthropic key rotation",
  ],
  openGraph: {
    title: "keyward",
    description:
      "Find, rotate and police every AI API key your company holds. Rotation with verification and rollback.",
    type: "website",
    siteName: "keyward",
    images: [{ url: "/og.png", width: 1280, height: 640, alt: "keyward" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "keyward",
    description:
      "Find, rotate and police every AI API key your company holds. Rotation with verification and rollback.",
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    shortcut: ["/favicon.svg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#07090d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script src="/theme-boot.js" />
      </head>
      <body>
        <CopyButtons />
        <header className="topbar">
          <div className="shell topbar-inner">
            <Link href="/" className="brand">
              <span className="brand-mark" aria-hidden="true">
                k
              </span>
              keyward
            </Link>
            <nav className="nav">
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/settings">Settings</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/#how">How it works</Link>
              <a
                href="https://github.com/devtechedge/keyward"
                rel="noreferrer noopener"
                target="_blank"
              >
                GitHub
              </a>
              <ThemeToggle />
            </nav>
          </div>
        </header>
        {children}
        <footer className="footer">
          <div className="shell footer-inner">
            <span>keyward - open source AI key governance.</span>
            <span className="footer-links">
              <a href="https://github.com/devtechedge/keyward" rel="noreferrer noopener" target="_blank">
                Source
              </a>
              <a href="https://github.com/devtechedge/keyward/issues" rel="noreferrer noopener" target="_blank">
                Issues
              </a>
              <Link href="/dashboard">Dashboard</Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
