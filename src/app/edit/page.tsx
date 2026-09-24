import { Suspense } from "react";

import { EditView } from "@/views/EditView";

export default function Page() {
  return (
    <Suspense>
      <EditView />
    </Suspense>
  );
}
