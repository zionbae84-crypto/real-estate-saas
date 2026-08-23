/**
 * 토지임대부 표시의 공개 표면.
 *
 * `src/lib/finance`·`src/lib/rights`·`src/lib/price`와 나란한 자리다.
 * **예산 엔진을 건드리지 않는다** — 토지 사용료 금액이 데이터에 없어
 * 계산에 넣을 값이 없고, 없는 값을 추정해 넣으면 그때부터 화면이 없는
 * 근거로 계산한다. 이 모듈이 하는 일은 "우리가 모르는 돈이 매달 더
 * 나간다"는 사실을 세 화면에 같은 문구로 실어 보내는 것뿐이다.
 */
export { landLeaseNotice } from "./notice";
export { parseLandLeaseRules } from "./rules";
export { LAND_LEASE_STATES } from "./types";
export type {
  LandLeaseNotice,
  LandLeaseRules,
  LandLeaseState,
  LandLeaseStateCopy,
} from "./types";
