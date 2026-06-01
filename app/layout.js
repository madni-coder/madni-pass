import { Inter } from "next/font/google";
import "./globals.css";
import Notifications from "@/components/ui/notifications";
import { AuthProvider } from "@/context/AuthContext";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata = {
  title: "Madni Notes",
  description: "Apne credentials notes mein rakho",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} bg-background text-foreground antialiased`} style={{ fontFamily: "var(--font-sans, sans-serif)" }}>
        <AuthProvider>
          {children}
        </AuthProvider>
        <Notifications />
      </body>
    </html>
  );
}
