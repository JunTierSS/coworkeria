import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ProjectProvider } from "@/components/ProjectProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { MobileMenuProvider } from "@/components/MobileMenu";
import { MobileHeader } from "@/components/MobileHeader";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CoWorkerIA",
  description: "Tu segundo cerebro para proyectos e investigación",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full" suppressHydrationWarning>
      <body
        className={`${inter.className} h-full bg-zinc-50 text-zinc-900 antialiased dark:bg-zinc-950 dark:text-zinc-100`}
      >
        <ThemeProvider>
          <MobileMenuProvider>
            <ProjectProvider>
              <div className="flex h-full flex-col md:flex-row">
                <MobileHeader />
                <Sidebar />
                <main className="flex-1 overflow-hidden">{children}</main>
              </div>
            </ProjectProvider>
          </MobileMenuProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
