import type { Metadata } from "next";
import { Bricolage_Grotesque, Hanken_Grotesk } from "next/font/google";
import "./globals.css";
import { Providers } from "../components/Providers";
import { RootProviders } from "../components/RootProviders";

const hanken = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-hanken",
  display: "swap",
});

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AgriSetu — Vendor Portal",
  description: "Agricultural input procurement platform for vendors",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${hanken.variable} ${bricolage.variable}`}>
      <body suppressHydrationWarning>
        <Providers>
          <RootProviders>{children}</RootProviders>
        </Providers>
      </body>
    </html>
  );
}
