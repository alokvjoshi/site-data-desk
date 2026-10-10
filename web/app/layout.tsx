import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { Nav } from "@/components/Nav";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Site Data Desk",
  description: "Cited answers from environmental standards and project records. Open-source demo with fictional company data.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-1.5 focus:text-accentink">Skip to content</a>
        <Nav />
        <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">{children}</main>
        <footer className="border-t border-line px-4 py-5 text-xs leading-relaxed text-muted sm:px-6">
          <div className="mx-auto max-w-5xl space-y-1">
            <p><strong className="text-ink">Demonstration only.</strong> The company, projects, emails and results are fictional. Standards text is from the NEPM Assessment of Site Contamination schedules (Federal Register of Legislation, CC BY 4.0), reformatted; check the original before relying on any value. Answers are not professional advice.</p>
            <p>Questions are logged (with a hashed IP, no accounts) to run quotas, evaluations and improvements. <Link href="/about" className="underline">About, licences and privacy</Link></p>
          </div>
        </footer>
      </body>
    </html>
  );
}
