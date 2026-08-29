import type { Metadata } from "next";
import { AnalyticsProvider } from "@/components/AnalyticsProvider";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bored — SF Bay Area",
  description: "Events, comedy, movies, and things to do in San Francisco",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AnalyticsProvider>
          <div className="shell">
            <SiteHeader />
            {children}
          </div>
        </AnalyticsProvider>
      </body>
    </html>
  );
}
