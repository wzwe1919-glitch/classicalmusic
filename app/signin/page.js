import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import AuthCard from "../../components/AuthCard";
import { authOptions } from "../../lib/auth";

export default async function SignInPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/");

  const googleEnabled = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return <AuthCard mode="signin" googleEnabled={googleEnabled} />;
}
