import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: {
      "lucide-react": fileURLToPath(
        new URL("./src/test/__mocks__/lucide-react.ts", import.meta.url),
      ),
    },
  },
});
