import { Suspense } from "react";

import { WikiView } from "@/views/WikiView";

export default function Page() {
  return (
    <Suspense>
      <WikiView />
    </Suspense>
  );
}
