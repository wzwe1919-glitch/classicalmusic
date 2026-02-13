import "./globals.css";
import { getServerSession } from "next-auth";
import AppHeader from "../components/AppHeader";
import { authOptions } from "../lib/auth";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata = {
  title: "classical chill",
  description: "full classical music web app with auth, favorites and multi-source playlist"
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#080808"
};

export default async function RootLayout({ children }) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body className={inter.className}>
        <AppHeader user={session?.user || null} />
        {children}
      </body>
    </html>
  );
}
