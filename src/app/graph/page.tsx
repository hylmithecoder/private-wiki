import { Suspense } from "react";

import { GraphView } from "@/views/GraphView";

export default function Page() {
  return (
    <Suspense>
      <GraphView />
    </Suspense>
  );
}
