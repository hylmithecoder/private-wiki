import { Suspense } from "react";

import { LinedPrintView } from "@/views/LinedPrintView";

export default function Page() {
  return (
    <Suspense>
      <LinedPrintView />
    </Suspense>
  );
}
