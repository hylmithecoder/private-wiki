import { Suspense } from "react";

import { LoginView } from "@/views/LoginView";

export default function Page() {
  return (
    <Suspense>
      <LoginView />
    </Suspense>
  );
}
