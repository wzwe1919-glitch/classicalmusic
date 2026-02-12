"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AuthCard({ mode = "signin", googleEnabled = false }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isRegister = mode === "register";

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      if (isRegister) {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "registration failed");
      }

      const login = await signIn("credentials", {
        redirect: false,
        email,
        password
      });

      if (login?.error) {
        throw new Error("invalid email or password");
      }

      router.push("/");
      router.refresh();
    } catch (submitError) {
      setError(submitError.message || "request failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>{isRegister ? "create account" : "welcome back"}</h1>
        <p>{isRegister ? "register to save favorites and profile." : "sign in to sync your music profile."}</p>

        {isRegister && (
          <label>
            name
            <input value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
        )}

        <label>
          email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            autoComplete="email"
          />
        </label>

        <label>
          password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete={isRegister ? "new-password" : "current-password"}
          />
        </label>

        {error && <p className="status error">{error}</p>}

        <button type="submit" className="solid-btn full" disabled={loading}>
          {loading ? "please wait..." : isRegister ? "register" : "sign in"}
        </button>

        {googleEnabled && (
          <button
            type="button"
            className="ghost-btn full"
            onClick={() => signIn("google", { callbackUrl: "/" })}
          >
            continue with google
          </button>
        )}

        <p className="switch-link">
          {isRegister ? "already have account?" : "new here?"}{" "}
          <Link href={isRegister ? "/signin" : "/register"}>{isRegister ? "sign in" : "register"}</Link>
        </p>
      </form>
    </section>
  );
}
