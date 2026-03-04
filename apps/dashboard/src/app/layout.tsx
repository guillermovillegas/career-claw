import type { Metadata } from "next";
import { Sidebar } from "@/components/sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "CareerClaw Dashboard",
  description: "Job search tracking dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">
        <Sidebar />
        <main className="ml-14 min-h-screen p-6">{children}</main>
      </body>
    </html>
  );
}
