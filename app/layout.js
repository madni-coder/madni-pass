import { Inter, Merriweather, Fira_Code } from "next/font/google";
import "./globals.css";
import Notifications from "@/components/ui/notifications";
import { AuthProvider } from "@/context/AuthContext";
import { ThemeProvider } from "next-themes";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });
const merriweather = Merriweather({ subsets: ["latin"], variable: "--font-serif", weight: ["400", "700"] });
const firaCode = Fira_Code({ subsets: ["latin"], variable: "--font-mono" });

export const metadata = {
  title: "Madni Notes",
  description: "Apne credentials notes mein rakho",
  icons: {
    icon: "/lazyNoteIcon.png",
    apple: "/lazyNoteIcon.png",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${merriweather.variable} ${firaCode.variable} bg-background text-foreground antialiased`} style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
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
