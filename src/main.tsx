import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "pretendard/dist/web/static/pretendard.css";
// 제목용 한글 명조. Bold(700)만 들여온다 — h1/h2는 브라우저 기본 굵기(700)로
// 렌더링되므로 다른 굵기는 실제로 쓰이지 않는다(styles.css --font-serif 참고).
import "@fontsource/nanum-myeongjo/korean-700.css";
import "@seed-design/css/base.css";
// SEED 기본 브랜드 색(당근 주황)을 덮어쓴다. base.css 뒤에 와야 한다.
import "./seed-brand.css";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("#root 엘리먼트를 찾을 수 없습니다");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
