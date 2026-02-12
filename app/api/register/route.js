import { hash } from "bcryptjs";
import { z } from "zod";
import { readStore, uid, writeStore } from "../../../lib/store";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().email(),
  password: z.string().min(6).max(128)
});

export async function POST(request) {
  try {
    const body = await request.json();
    const data = registerSchema.parse(body);

    const db = await readStore();
    const email = data.email.toLowerCase();
    const exists = db.users.find((item) => item.email === email);
    if (exists) {
      return Response.json({ error: "email already registered" }, { status: 409 });
    }

    const passwordHash = await hash(data.password, 12);
    const user = {
      id: uid(),
      name: data.name,
      email,
      passwordHash,
      image: "",
      createdAt: new Date().toISOString()
    };

    db.users.push(user);
    await writeStore(db);
    return Response.json(
      { user: { id: user.id, name: user.name, email: user.email } },
      { status: 201 }
    );
  } catch (_) {
    return Response.json({ error: "invalid registration data" }, { status: 400 });
  }
}
