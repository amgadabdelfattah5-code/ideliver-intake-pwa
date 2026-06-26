import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "iDeliver Intake",
  description: "Internal pickup intake and shipment review PWA for iDeliver Egypt.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
