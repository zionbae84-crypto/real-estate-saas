import { useState } from "react";
import { SIDO_NAMES, sigunguBySido } from "../data/regions";

export interface RegionSelectProps {
  onSelect: (regionCode: string) => void;
  /**
   * `App.tsx`가 넘긴다 — 예산(현금·연 소득·주택 수)이나 평형대를 아직
   * 다 안 정했을 때 `true`다. 이 컴포넌트는 이제 화면 1의 3번째 자리
   * (예산 다음, 주택 수·생애최초·평형대보다 앞)에 항상 그려지므로
   * (사용자 지시), 지역을 미리 고르는 것 자체는 막지 않는다 — 다만
   * **조회를 실행하는 것**은 막아야 한다. 그 상태로 조회가 성공하면
   * 화면 단계가 "결과"로 넘어가는데(`App.tsx`의 phase 전환 effect),
   * 그 결과 화면은 프로필이 없으면 아무것도 그리지 않는 셸이거나
   * (사용자가 빠져나올 버튼도 없는 빈 화면에 갇힌다 — 이 저장소가 이미
   * 겪은 결함, 커밋 `c90babf`와 같은 모양), 평형대가 없으면 매물을 하나도
   * 못 보여준다(빈 선택을 조용히 "전체"로 읽지 않는다는 원칙과 같은
   * 축). 그래서 둘 중 하나라도 덜 찼으면 버튼을 계속 비활성 상태로
   * 묶어 둔다.
   */
  disabled?: boolean;
}

/**
 * 광역단체 → 자치구 2단 선택.
 *
 * 행정동은 여기서 고르지 않는다 — 국토부 API가 동 단위 파라미터를
 * 지원하지 않고, 조회 결과 안에서 걸러야 하기 때문이다(부모 스펙 §3의
 * 설계 메모 참고). 그래서 이 컴포넌트는 구까지만 확정하면 끝이고, 동
 * 좁히기는 결과를 받은 뒤 다른 컴포넌트가 담당한다.
 *
 * ⚠ **광역단체 기본값은 "서울특별시"다**(사용자 지시). 예전에는 아무것도
 * 고르지 않은 채 시작해 자치구 select 자체가 없었다 — 이제 광역단체가
 * 항상 채워져 있으므로 자치구 select도 처음부터 보인다("고르세요"
 * 상태로). 사용자가 다른 시/도로 바꾸면 그 시/도의 구 목록으로
 * 자치구가 다시 비워진다(아래 onChange와 동일한 로직).
 */
const DEFAULT_SIDO = "서울특별시";

export function RegionSelect({ onSelect, disabled = false }: RegionSelectProps) {
  const [sido, setSido] = useState<string | null>(DEFAULT_SIDO);
  const [sigungu, setSigungu] = useState<string | null>(null);

  const sigunguOptions = sido === null ? [] : sigunguBySido(sido);
  const selectedRegionCode =
    sigungu === null ? null : sigunguOptions.find((s) => s.sigunguName === sigungu)?.regionCode ?? null;
  const canQuery = selectedRegionCode !== null && !disabled;

  return (
    <fieldset className="field region-select">
      <legend>어느 지역에 살고 싶으세요?</legend>
      <div className="field">
        <label htmlFor="sido-select">광역단체</label>
        <select
          id="sido-select"
          value={sido ?? ""}
          onChange={(e) => {
            setSido(e.target.value === "" ? null : e.target.value);
            setSigungu(null);
          }}
        >
          <option value="">고르세요</option>
          {SIDO_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {sido !== null && (
        <div className="field">
          <label htmlFor="sigungu-select">자치구</label>
          <select
            id="sigungu-select"
            value={sigungu ?? ""}
            onChange={(e) => setSigungu(e.target.value === "" ? null : e.target.value)}
          >
            <option value="">고르세요</option>
            {sigunguOptions.map((s) => (
              <option key={s.regionCode} value={s.sigunguName}>
                {s.sigunguName}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        type="button"
        disabled={!canQuery}
        onClick={() => {
          if (canQuery && selectedRegionCode !== null) onSelect(selectedRegionCode);
        }}
      >
        이 지역으로 조회하기
      </button>
      {/*
        비활성 이유가 "구를 안 골랐다"가 아니라 "예산·평형대 답이 덜
        찼다"일 때만 이유를 밝힌다 — 구를 안 고른 것은 select 자체가
        이미 말하고 있으므로("고르세요") 여기서 또 말하면 중복이다.
      */}
      {disabled && selectedRegionCode !== null && (
        <p className="hint">
          현금·연 소득·주택 수·평형대를 먼저 정하면 이 지역으로 조회할 수
          있어요.
        </p>
      )}
    </fieldset>
  );
}
