import type { Metadata } from "next";
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
        <div className="shell">{children}</div>
      </body>
    </html>
  );
}
