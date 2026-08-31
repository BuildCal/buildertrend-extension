import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Buildertrend Extension",
  description: "Self-hosted Buildertrend bill workflows",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
