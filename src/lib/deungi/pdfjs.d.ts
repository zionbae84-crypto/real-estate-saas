/**
 * pdf.js의 워커 모듈에는 타입 선언이 없다.
 *
 * 우리가 이 모듈에서 쓰는 것은 `WorkerMessageHandler` 하나뿐이고, 그것도
 * 직접 부르지 않는다 — `globalThis.pdfjsWorker`에 얹어 두면 pdf.js가
 * **워커를 URL로 새로 띄우지 않고** 이미 번들에 들어 있는 이 모듈을
 * 쓴다. 워커를 URL로 부르는 것은 네트워크 요청이고, 등기부에는 실명·
 * 주소·채무가 들어 있어 어디로도 나가면 안 된다.
 */
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs" {
  export const WorkerMessageHandler: unknown;
}
