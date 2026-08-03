import type { Metadata, Viewport } from "next";

import "./globals.css";
import { AuthRedirect } from "./auth-redirect";
import { HomeLink } from "./home-link";
import { SwRegister } from "./sw-register";

export const metadata: Metadata = {
  title: "iDeliver Ops",
  description: "نظام العمليات الداخلي لـ iDeliver مصر",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "iDeliver Ops",
  },
};

export const viewport: Viewport = {
  themeColor: "#17365F",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <SwRegister />
        <AuthRedirect />
        <HomeLink />
        {children}
      </body>
    </html>
  );
}
