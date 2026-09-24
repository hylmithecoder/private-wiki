import { Suspense } from "react";

import { RecentView } from "@/views/RecentView";

export default function Page() {
  return (
    <Suspense>
      <RecentView />
    </Suspense>
  );
}
