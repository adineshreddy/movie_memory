import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Movie Memory",
  description: "Save your favorite movie and discover a fact about it.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="mx-auto flex w-full max-w-5xl items-center gap-3 px-6 py-7 text-sm font-semibold tracking-wide">
          <span className="grid size-8 place-items-center rounded-lg bg-amber-300 text-zinc-950" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="size-5">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M7 4v16M17 4v16M3 9h4m-4 6h4m10-6h4m-4 6h4" />
            </svg>
          </span>
          Movie Memory
        </header>
        {children}
      </body>
    </html>
  );
}
