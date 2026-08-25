// 로컬 개발 서버: Vite 미들웨어 모드에 두 Vercel API 핸들러(api/complexes.ts,
// api/geocode.ts)를 직접 붙여 실행한다. `npm run dev`(순수 vite)는 /api를
// 소스 파일 그대로 내려줄 뿐 실행하지 않고, `vercel dev`는 이 리포 구조에서
// 정적 빌드 단계의 개발 서버 자동 감지가 멈춰 쓸 수 없다 — 그 대신이다.
import { createServer as createHttpServer } from "node:http";
import { createServer as createViteServer } from "vite";

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: "spa",
});

const API_ROUTES = {
  "/api/complexes": "./api/complexes.ts",
  "/api/geocode": "./api/geocode.ts",
};

const server = createHttpServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const routeFile = API_ROUTES[url.pathname];

  if (routeFile) {
    try {
      const mod = await vite.ssrLoadModule(routeFile);
      const handler = mod.default;
      const vercelReq = { query: Object.fromEntries(url.searchParams) };
      const vercelRes = {
        status(code) {
          res.statusCode = code;
          return this;
        },
        json(body) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.end(JSON.stringify(body));
        },
      };
      await handler(vercelReq, vercelRes);
    } catch (e) {
      console.error(`[api] ${url.pathname} error:`, e);
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
    }
    return;
  }

  vite.middlewares(req, res);
});

const port = 5180;
server.listen(port, () => {
  console.log(`ready: http://localhost:${port}`);
});
