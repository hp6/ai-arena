import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@ai-arena/shared": path.resolve(__dirname, "../shared/src/index.ts"),
    },
  },
});
