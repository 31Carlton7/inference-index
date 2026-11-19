import type { MetadataRoute } from "next";
import { getProviders, getRegistryRecord } from "@/lib/data";
import { siteUrl } from "@/lib/links";

const SECTIONS = ["/", "/changelog", "/status", "/leaderboard", "/prices", "/fidelity", "/method"];

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl();
  return [
    ...SECTIONS.map((pathname) => ({ url: `${origin}${pathname}` })),
    ...getProviders().map((provider) => ({
      url: `${origin}/providers/${provider.id}`,
      lastModified: getRegistryRecord(provider.id)?.updated ?? provider.added,
    })),
  ];
}
