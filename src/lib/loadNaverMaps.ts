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
 * 로딩 중이면 두 번째 호출부터는 같은 프라미스를 돌려준다 — 스크립트
 * 태그를 여러 번 넣지 않는다.
 *
 * **실패한 프라미스는 캐시하지 않는다.** 실패까지 남겨 두면 한 번의
 * 일시적 실패(네트워크 끊김, 첫 배포 때 도메인이 아직 콘솔에 등록되지
 * 않음)가 그 세션 내내 회복 불가능해진다 — 화면의 "다시 시도" 버튼도,
 * `<ComplexMap>`을 다시 마운트하는 것도 같은 거부된 프라미스를 그대로
 * 돌려받는다. 그래서 거부되면 캐시를 비워, 다음 호출이 스크립트 태그를
 * 새로 넣고 처음부터 다시 시도하게 한다.
 */
export function loadNaverMaps(clientId: string): Promise<typeof naver> {
  if (window.naver?.maps !== undefined) return Promise.resolve(window.naver);
  if (loadingPromise !== null) return loadingPromise;

  const pending = new Promise<typeof naver>((resolve, reject) => {
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

  loadingPromise = pending;
  // 거부되면 캐시를 비운다. `pending`을 그대로 반환하고 이 체인은 버리므로
  // 호출자가 받는 프라미스는 여전히 원래 사유로 거부된다 — 여기서
  // 다시 던져 처리되지 않은 거부를 만들지 않도록 catch로 삼킨다.
  void pending.catch(() => {
    if (loadingPromise === pending) loadingPromise = null;
  });

  return pending;
}

/**
 * 테스트 전용 — 모듈 수준 로딩 캐시를 비운다.
 *
 * `vi.resetModules()`는 이미 static import된 참조를 다시 묶어주지 않아
 * 이 캐시를 비우지 못한다. 테스트 간 격리는 이 함수로만 보장된다.
 */
export function resetNaverMapsLoaderForTest(): void {
  loadingPromise = null;
}
