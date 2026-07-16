import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    globals: true,
    css: false,
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/tests/e2e/**"],
  },
  resolve: {
    alias: [
      // "@/db" exato resolve para "./db"
      { find: "@/db", replacement: path.resolve(__dirname, "./db") },
      // "@/db/..." (com prefixo) resolve para "./db/..."
      { find: /^@\/db\/(.*)$/, replacement: path.resolve(__dirname, "./db/$1") },
      // "@/..." (com prefixo) resolve para "./src/..."
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "./src/$1") },
    ],
  },
});
