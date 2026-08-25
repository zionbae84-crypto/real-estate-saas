/// <reference types="navermaps" />

declare global {
  interface Window {
    naver?: typeof naver;
  }
}

let loadingPromise: Promise<typeof naver> | null = null;

/**
 * 네이버지도 자바스크립트 SDK를 한 번만 불러온다. `src/no-network.test.ts`가
 * `fetch`를 포함해 `src/` 전체의 네트워크 호출을 막는데, 이 파일 하나만
 * 예외다 — 서드파티 스크립트를 통째로 실행시키는, `regionQuery.ts`(우리
 * 서버로 지역코드만 보내는 fetch)보다 훨씬 큰 신뢰를 내주는 자리라서
 * 파일을 이것 하나로 좁혔다.
 *
 * URL은 하드코딩된 상수 하나뿐이다 — 사용자 입력이나 다른 상태로 만든
 * 문자열을 붙이지 않는다. `clientId`도 비밀키가 아니라(네이버는 대신
 * 콘솔에 등록한 도메인으로 막는다) 쿼리 파라미터로 그대로 붙여도 된다.
 *
 * 두 번째 호출부터는 같은 프라미스를 돌려준다 — 스크립트 태그를 여러 번
 * 넣지 않는다.
 */
export function loadNaverMaps(clientId: string): Promise<typeof naver> {
  if (window.naver?.maps !== undefined) return Promise.resolve(window.naver);
  if (loadingPromise !== null) return loadingPromise;

  loadingPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
    script.onload = () => {
      if (window.naver?.maps === undefined) {
        reject(new Error("네이버지도 스크립트가 로드됐지만 naver.maps가 없어요"));
        return;
      }
      resolve(window.naver);
    };
    script.onerror = () => reject(new Error("네이버지도 스크립트를 불러오지 못했어요"));
    document.head.appendChild(script);
  });

  return loadingPromise;
}
