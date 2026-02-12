import "./globals.css";
import { getServerSession } from "next-auth";
import AppHeader from "../components/AppHeader";
import { authOptions } from "../lib/auth";

export const metadata = {
  title: "classical chill",
  description: "full classical music web app with auth, favorites and multi-source playlist"
};

export default async function RootLayout({ children }) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="en">
      <body>
        <AppHeader user={session?.user || null} />
        {children}
      </body>
    </html>
  );
}
