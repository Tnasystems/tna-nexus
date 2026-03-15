import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "TNA-Nexus",
  description: "Industrial-tech SaaS for field service, workforce operations, jobs, forms, and compliance."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
