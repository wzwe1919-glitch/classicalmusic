import { hash } from "bcryptjs";
import { z } from "zod";
import { readStore, uid, writeStore } from "../../../lib/store";
import { json, parseJsonOrThrow, rateLimitOrThrow, requireSameOriginOrThrow } from "../../../lib/api";

const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().email().max(254),
  password: z
    .string()
    .min(10)
    .max(128)
    .refine((value) => /[a-z]/i.test(value) && /\d/.test(value), "password_too_weak")
});

export async function POST(request) {
  try {
    requireSameOriginOrThrow(request);
    rateLimitOrThrow({ request, key: "register", limit: 8, windowMs: 60_000 });
    const data = await parseJsonOrThrow(request, registerSchema, { maxBytes: 16 * 1024 });

    const db = await readStore();
    const email = data.email.toLowerCase();
    const exists = db.users.find((item) => item.email === email);
    if (exists) {
      return json({ error: "email already registered" }, { status: 409 });
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
    return json(
      { user: { id: user.id, name: user.name, email: user.email } },
      { status: 201 }
    );
  } catch (err) {
    const passwordError = err?.details?.fieldErrors?.password?.[0];
    const error =
      err?.message === "rate_limited"
        ? "too many requests"
        : passwordError
          ? passwordError
          : err?.message === "invalid_origin"
            ? "forbidden"
            : "invalid registration data";

    return json({ error }, { status: err?.status || 400, headers: err?.headers || {} });
  }
}
