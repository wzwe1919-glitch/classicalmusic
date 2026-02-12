import ClassicalPlayer from "../components/ClassicalPlayer";
import AnimatedCursor from "../components/AnimatedCursor";
import Snowfall from "../components/Snowfall";
import { getServerSession } from "next-auth";
import { authOptions } from "../lib/auth";

export default async function HomePage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="page-root">
      <Snowfall />
      <AnimatedCursor />
      <ClassicalPlayer user={session?.user || null} />
    </main>
  );
}
