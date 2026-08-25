import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NZ Economic Stress Lab",
  description: "An open scenario model for testing mortgage insurance, banking losses and the Crown backstop in New Zealand.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
