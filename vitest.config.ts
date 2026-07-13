import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
    restoreMocks: true,
  },
  resolve: { alias: { "@": new URL("./apps/kitty/src", import.meta.url).pathname } },
});
