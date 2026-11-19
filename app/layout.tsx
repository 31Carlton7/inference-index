import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader } from "next/font/google";
import Link from "next/link";
import { SectionNav } from "@/components/section-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { usingFixtures } from "@/lib/data";
import { REPO_URL, siteUrl } from "@/lib/links";
import "./globals.css";

const newsreader = Newsreader({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-newsreader",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-plex-sans",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
});

const description =
  "A public record of inference providers: what their data terms say, how they perform on the same open models, and what they charge. Every figure links to its source.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: "Inference Index", template: "%s · Inference Index" },
  description,
  openGraph: { siteName: "Inference Index", type: "website", title: "Inference Index", description },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f5" },
    { media: "(prefers-color-scheme: dark)", color: "#141311" },
  ],
};

// Runs before first paint so a saved theme never flashes the other one.
const applySavedTheme = `try{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${newsreader.variable} ${plexSans.variable} ${plexMono.variable}`}
      suppressHydrationWarning
    >
      <body>
        <script dangerouslySetInnerHTML={{ __html: applySavedTheme }} />
        {usingFixtures && <div className="fixture-banner">Fixture data from test/fixtures. None of it is real.</div>}
        <header className="masthead">
          <div className="shell">
            <div className="masthead-row">
              <Link href="/" className="wordmark">
                Inference Index
              </Link>
              <ThemeToggle />
            </div>
            <SectionNav />
          </div>
        </header>
        <main>
          <div className="shell">{children}</div>
        </main>
        <footer className="colophon">
          <div className="shell">
            <span>
              Public sources only. The data is JSON in the <a href={REPO_URL}>GitHub repository</a>; how each figure
              is produced is on the <Link href="/method">method page</Link>.
            </span>
            <span>This project does not route or resell inference.</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
