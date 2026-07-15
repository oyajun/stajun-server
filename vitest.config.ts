import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  resolve: {
    // tsconfig の "@/*" -> "./*" を再現
    alias: [{ find: /^@\//, replacement: `${root}` }],
  },
  test: {
    environment: "node",
    // 実DBを共有するため直列実行にする
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    // better-auth/prisma の初回接続などを考慮して長めに
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
