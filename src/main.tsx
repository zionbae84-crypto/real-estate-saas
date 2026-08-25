import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
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
