import { Suspense } from "react";

import { SearchView } from "@/views/SearchView";

export default function Page() {
  return (
    <Suspense>
      <SearchView />
    </Suspense>
  );
}
