import type { Metadata } from "next";
import "./globals.css";

import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Mail Platform",
  description: "Secure modern messaging platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}

        <Toaster />
      </body>
    </html>
  );
}