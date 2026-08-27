import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// 이 앱의 활자는 이것 **한 벌**이다 — 제목도 본문도 같은 글자체를 쓴다
// (사용자 지시: "pretendard로 모두 통일해줘"). 예전에는 여기서 제목용
// 한글 명조 웹폰트를 한 줄 더 들여와 h1·h2에 씌웠다 — 그 경위와 왜
// 걷어냈는지는 styles.css의 body 규칙 주석에 적었다.
import "pretendard/dist/web/static/pretendard.css";
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
