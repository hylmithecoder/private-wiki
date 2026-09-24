"use client";

import useSWR from "swr";

import { keys, type Session } from "./api";

/** Whether the visitor may create, edit, delete and restore pages. */
export function useSession() {
  const { data, isLoading, mutate } = useSWR<Session>(keys.session());
  return {
    canEdit: data?.authenticated ?? false,
    writable: data?.writable ?? true,
    isLoading,
    refresh: mutate,
  };
}

export const loginHref = (next?: string) => (next ? `/login?next=${encodeURIComponent(next)}` : "/login");

/** Login URL that returns to the current page, query string included. */
export const loginHereHref = () => loginHref(window.location.pathname + window.location.search);
