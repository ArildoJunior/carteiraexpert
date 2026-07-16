import { Suspense } from "react";
import { Verificar2FAForm } from "./verificar-2fa-form";

export const metadata = { title: "Verificacao em duas etapas" };

export default function Verificar2FAPage() {
  return (
    <Suspense fallback={null}>
      <Verificar2FAForm />
    </Suspense>
  );
}
