import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Airport Tycoon",
  description: "Build and run an airport: parking, security, gates, runways and flights. Runs fully in your browser.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
