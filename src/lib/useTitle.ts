"use client";

import { useEffect } from "react";

/** Client pages can't export `metadata` in a static export, so set it here. */
export function useTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} - Wiki` : "Wiki";
  }, [title]);
}
