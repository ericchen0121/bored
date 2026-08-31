import type { Metadata } from "next";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { SiteHeader } from "@/components/SiteHeader";
import { UserProvider } from "@/components/UserProvider";
import { jsonLdScript, organizationJsonLd, websiteJsonLd } from "@/lib/structured-data";
import { siteUrl } from "@/lib/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "Bored — SF Bay Area",
    template: "%s",
  },
  description: "Events, comedy, movies, and things to do in San Francisco",
  openGraph: {
    siteName: "Bored",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdScript([organizationJsonLd(), websiteJsonLd()]),
          }}
        />
        <AnalyticsProvider>
          <UserProvider>
            <div className="shell">
              <SiteHeader />
              {children}
            </div>
          </UserProvider>
        </AnalyticsProvider>
      </body>
    </html>
  );
}
