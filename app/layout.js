import { Bitter, Fira_Code, Manrope } from "next/font/google";
import "./globals.css";
import Notifications from "@/components/ui/notifications";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "next-themes";

const manrope = Manrope({ subsets: ["latin"], variable: "--font-sans" });
const bitter = Bitter({ subsets: ["latin"], variable: "--font-serif" });
const firaCode = Fira_Code({ subsets: ["latin"], variable: "--font-mono" });

export const metadata = {
  title: "Madni Notes",
  description: "Apne credentials notes mein rakho",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} ${bitter.variable} ${firaCode.variable} bg-background text-foreground antialiased`} style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <AuthProvider>
            {children}
          </AuthProvider>
          <Notifications />
        </ThemeProvider>
      </body>
    </html>
  );
}
