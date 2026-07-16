import { Suspense } from "react";
import { VerificarEmailStatus } from "./verificar-email-status";

export const metadata = { title: "Verificando e-mail" };

export default function VerificarEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerificarEmailStatus />
    </Suspense>
  );
}
