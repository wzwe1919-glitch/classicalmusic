import { compare } from "bcryptjs";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { readStore, uid, writeStore } from "./store";

const IS_PROD = process.env.NODE_ENV === "production";
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || "";

if (IS_PROD && !NEXTAUTH_SECRET) {
  throw new Error("missing NEXTAUTH_SECRET in production");
}

const providers = [
  CredentialsProvider({
    name: "credentials",
    credentials: {
      email: { label: "email", type: "email" },
      password: { label: "password", type: "password" }
    },
    async authorize(credentials) {
      const email = String(credentials?.email || "").trim().toLowerCase();
      const password = String(credentials?.password || "");
      if (!email || !password) return null;

      const db = await readStore();
      const user = db.users.find((item) => item.email === email);
      if (!user?.passwordHash) return null;

      const ok = await compare(password, user.passwordHash);
      if (!ok) return null;

      return { id: user.id, name: user.name, email: user.email, image: user.image || null };
    }
  })
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.unshift(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET
    })
  );
}

export const authOptions = {
  secret: NEXTAUTH_SECRET || undefined,
  trustHost: true,
  useSecureCookies: IS_PROD,
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  providers,
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider !== "google" || !user?.email) return true;
      const db = await readStore();
      const email = user.email.toLowerCase();
      const existing = db.users.find((item) => item.email === email);

      if (existing) {
        user.id = existing.id;
        return true;
      }

      const created = {
        id: uid(),
        name: user.name || "google user",
        email,
        image: user.image || "",
        passwordHash: "",
        createdAt: new Date().toISOString()
      };
      db.users.push(created);
      await writeStore(db);
      user.id = created.id;
      return true;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id || token.id;
        token.email = user.email || token.email;
        token.name = user.name || token.name;
        token.picture = user.image || token.picture;
      }
      return token;
    },
    async session({ session, token }) {
      if (session?.user) {
        session.user.id = token.id;
        session.user.email = token.email;
        session.user.name = token.name;
        session.user.image = token.picture;
      }
      return session;
    }
  }
};
