import { Oxanium, Fira_Code } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

const oxanium = Oxanium({ subsets: ["latin"], variable: "--font-sans" });
const firaCode = Fira_Code({ subsets: ["latin"], variable: "--font-mono" });

export const metadata = {
  title: "MadniPass",
  description: "Apne credentials notes mein rakho",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className={`${oxanium.variable} ${firaCode.variable} bg-background text-foreground antialiased`} style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        {children}
        <Toaster richColors position="top-right" theme="dark" />
      </body>
    </html>
  );
}
