"use client";

import * as stylex from "@stylexjs/stylex";
import { Key, SignIn } from "@phosphor-icons/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button, Field, inputStyles, LinkButton, surface } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useTitle } from "@/lib/useTitle";
import { color } from "@/styles/tokens.stylex";
import { media } from "@/styles/media.stylex";

const s = stylex.create({
  wrap: {
    display: "flex",
    justifyContent: "center",
    paddingTop: { default: 24, [media.md]: "10vh" },
  },
  card: {
    width: "min(420px, 100%)",
    display: "flex",
    flexDirection: "column",
    gap: 20,
    padding: { default: 22, [media.md]: 32 },
  },
  icon: { color: color.accent },
  title: { fontSize: 24, fontWeight: 650, letterSpacing: "-0.02em" },
  body: { fontSize: 14.5, lineHeight: 1.55, color: color.textMuted, marginTop: 6 },
  actions: { display: "flex", gap: 8, justifyContent: "flex-end" },
});

// Only allow same-site relative paths as the post-login destination.
function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export function LoginView() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const { canEdit, writable, refresh } = useSession();
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useTitle("Log in");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key) return setError("Enter the admin key.");
    setBusy(true);
    setError(null);
    try {
      await refresh(await api.login(key), { revalidate: false });
      router.replace(next);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div {...stylex.props(s.wrap)}>
      <form onSubmit={onSubmit} {...stylex.props(surface.paper, s.card)}>
        <div>
          <Key size={28} {...stylex.props(s.icon)} />
          <h1 {...stylex.props(s.title)}>{canEdit ? "You're logged in" : "Log in to edit"}</h1>
          <p {...stylex.props(s.body)}>
            {!writable
              ? "Editing is turned off on this server. Set WIKI_ADMIN_KEY in .env and restart it."
              : canEdit
                ? "You can create, edit and delete pages."
                : "Anyone can read this wiki. Creating, editing and deleting pages needs the admin key from the server's .env."}
          </p>
        </div>
        {writable && !canEdit && (
          <Field label="Admin key" htmlFor="key" error={error}>
            <input
              id="key"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoComplete="current-password"
              autoFocus
              aria-invalid={!!error}
              {...stylex.props(inputStyles.input, error != null && inputStyles.invalid)}
            />
          </Field>
        )}
        <div {...stylex.props(s.actions)}>
          <LinkButton href={next} variant="ghost">
            {canEdit ? "Continue" : "Cancel"}
          </LinkButton>
          {writable && !canEdit && (
            <Button type="submit" variant="primary" disabled={busy}>
              <SignIn />
              {busy ? "Checking" : "Log in"}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
