import type { MetadataRoute } from "next";

/** Private single-user app — ask crawlers to stay out of the whole site. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
