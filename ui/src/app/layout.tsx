import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/Sidebar";
import { ProjectProvider } from "@/components/ProjectProvider";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CoWorkerIA",
  description: "Tu segundo cerebro para proyectos e investigación",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="h-full">
      <body className={`${inter.className} h-full bg-zinc-50 text-zinc-900 antialiased`}>
        <ProjectProvider>
          <div className="flex h-full">
            <Sidebar />
            <main className="flex-1 overflow-hidden">{children}</main>
          </div>
        </ProjectProvider>
      </body>
    </html>
  );
}
