import { Suspense } from "react";

import { TagsView } from "@/views/TagsView";

export default function Page() {
  return (
    <Suspense>
      <TagsView />
    </Suspense>
  );
}
