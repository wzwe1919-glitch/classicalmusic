"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export default function AppHeader({ user }) {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand">
          classical chill
        </Link>

        <nav className="main-nav">
          <Link href="/">home</Link>
          <Link href="/recently-played">recent</Link>
          <Link href="/favorites">favorites</Link>
          <Link href="/profile">profile</Link>
        </nav>

        <div className="auth-zone">
          {user ? (
            <>
              <span className="hello">hi, {user.name || user.email}</span>
              <button type="button" className="ghost-btn" onClick={() => signOut({ callbackUrl: "/" })}>
                sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/signin" className="ghost-btn">
                sign in
              </Link>
              <Link href="/register" className="solid-btn">
                register
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
