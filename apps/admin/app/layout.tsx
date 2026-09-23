import "./globals.css";
import "@studio/remotion-scenes/fonts";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Shorts Studio", description: "Hebrew tutorial Shorts — admin" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl">
      <body className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-6 px-6 py-3">
            <Link href="/" className="text-lg font-extrabold tracking-tight">
              Shorts Studio
            </Link>
            <span className="text-sm text-slate-500">הדרכות קצרות בעברית · ממקור לסרטון</span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
