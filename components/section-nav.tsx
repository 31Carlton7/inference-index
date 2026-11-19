"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/", label: "Registry" },
  { href: "/changelog", label: "Changelog" },
  { href: "/status", label: "Status" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/prices", label: "Prices" },
  { href: "/fidelity", label: "Fidelity" },
  { href: "/method", label: "Method" },
];

export function SectionNav() {
  const pathname = usePathname();
  return (
    <nav className="sections" aria-label="Sections">
      {SECTIONS.map(({ href, label }) => {
        const isCurrent = href === "/" ? pathname === "/" || pathname.startsWith("/providers") : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={isCurrent ? "page" : undefined}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
