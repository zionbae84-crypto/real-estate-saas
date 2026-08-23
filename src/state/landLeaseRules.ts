import rawLandLeaseRules from "../../rules/land-lease-2026-08.json";
import { parseLandLeaseRules, type LandLeaseRules } from "../lib/land-lease";

/**
 * 번들에 포함된 토지임대부 룰셋.
 *
 * 빌드 타임에 들어오므로 네트워크 요청도 로딩 상태도 없다
 * (`usePriceCheck`의 `priceRules`와 같은 자리).
 *
 * **훅이 아니라 상수인 이유:** 이 문구에는 상태가 없다. 목록 행·상세·
 * 호가 세 화면이 같은 객체를 읽어야 서로 다른 말을 할 수 없다.
 */
export const landLeaseRules: LandLeaseRules = parseLandLeaseRules(rawLandLeaseRules);
