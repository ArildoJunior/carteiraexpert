import { Suspense } from "react";
import { ResetarSenhaForm } from "./resetar-senha-form";

export const metadata = { title: "Redefinir senha" };

export default function ResetarSenhaPage() {
  return (
    <Suspense fallback={null}>
      <ResetarSenhaForm />
    </Suspense>
  );
}
