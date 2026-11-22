import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bazaar Brain — Daily AI Procurement Intelligence for Street Vendors",
  description: "Daily AI procurement intelligence for Hazratganj street vendors",
  icons: {
    icon: "/logo-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="relative min-h-screen bg-(--color-bg-base) text-(--color-text-primary)">
        <div className="app-background" />
        <div className="app-grid" />
        <div className="relative z-10 min-h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}
