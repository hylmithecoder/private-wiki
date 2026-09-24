import { Suspense } from "react";

import { HistoryView } from "@/views/HistoryView";

export default function Page() {
  return (
    <Suspense>
      <HistoryView />
    </Suspense>
  );
}
