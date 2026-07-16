import { inngest } from "@/inngest/client";
import { inngestFunctions } from "@/inngest/functions";
import { serve } from "inngest/next";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: inngestFunctions,
});
