import { seedDesignPlugin } from "@seed-design/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    // 스니펫의 테마·CSS를 자동으로 연결한다. colorMode는 라이트 고정 —
    // 다크 모드 대응은 별도 작업이며, 지금 켜면 검증하지 않은 색 조합이
    // 사용자에게 나간다.
    seedDesignPlugin({ colorMode: "light-only" }),
  ],
  // tsconfig의 `seed-design/*` 별칭을 Vite가 직접 푼다(Vite 7 네이티브).
  resolve: { tsconfigPaths: true },
  build: { outDir: "dist" },
});
