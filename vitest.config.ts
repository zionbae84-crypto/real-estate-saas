import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // tsconfig의 `seed-design/*` 별칭을 테스트에서도 풀어 준다. vite.config.ts와
  // 별개 파일이라 한쪽만 고치면 앱은 뜨는데 테스트만 모듈을 못 찾는다.
  resolve: { tsconfigPaths: true },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"],
    server: {
      deps: {
        // @seed-design/react는 자기 CSS를 import한다. 기본값대로 외부화하면
        // Node가 .css를 그대로 읽으려다 죽으므로 Vite가 처리하도록 인라인한다.
        inline: [/@seed-design\//],
      },
    },
  },
});
