import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "dns.doctor: periksa kesehatan DNS domain",
  description:
    "Cek record DNS, kesepakatan antar resolver, DNSSEC, SPF, dan DMARC sebuah domain lengkap dengan alasannya.",
  applicationName: "dns.doctor",
  openGraph: {
    title: "dns.doctor: periksa kesehatan DNS domain",
    description:
      "Record, propagasi, DNSSEC, SPF, dan DMARC dalam satu laporan singkat.",
    type: "website",
  },
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="id"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
