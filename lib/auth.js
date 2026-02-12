import { compare } from "bcryptjs";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { readStore, uid, writeStore } from "./store";

const providers = [
  CredentialsProvider({
    name: "credentials",
    credentials: {
      email: { label: "email", type: "email" },
      password: { label: "password", type: "password" }
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) return null;
      const db = await readStore();
      const user = db.users.find((item) => item.email === credentials.email.toLowerCase());
      if (!user?.passwordHash) return null;

      const ok = await compare(credentials.password, user.passwordHash);
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
