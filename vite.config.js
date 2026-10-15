import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  base: "./", // relative asset paths, needed for the packaged file:// build
  plugins: [react()],
  test: {
    // agents/kit has its own node:test runner (run-all.cjs), not vitest suites
    exclude: [...configDefaults.exclude, "agents/**"],
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src/ui"),
    },
  },
});
