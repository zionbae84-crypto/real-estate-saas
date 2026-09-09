import { useState } from "react";
import { SIDO_NAMES, sigunguBySido } from "../data/regions";

export interface RegionSelectProps {
  /**
   * 구까지 정해지면 그 `regionCode`를, 아직이면 `null`을 알린다.
   *
   * **조회 버튼은 이 카드 안에 없다.** 사용자 지시로 질문 카드들이
   * 모두 끝난 자리(생애최초 다음)로 옮겼다 — 카드 리듬의 끝에 서야
   * "질문이 끝났다"는 신호가 된다. 버튼이 밖으로 나가면서 "무엇을
   * 골랐는가"를 바깥이 알아야 해서 이 콜백이 생겼다.
   *
   * 고른 값 자체는 여전히 이 컴포넌트가 들고 있고(아래 `useState`),
   * 바뀌는 길은 두 select의 `onChange` 둘뿐이다 — 그 둘이 모두 여기로
   * 알리므로 바깥의 값이 뒤처지지 않는다.
   */
  onRegionChange: (regionCode: string | null) => void;
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

export function RegionSelect({ onRegionChange }: RegionSelectProps) {
  const [sido, setSido] = useState<string | null>(DEFAULT_SIDO);
  const [sigungu, setSigungu] = useState<string | null>(null);

  const sigunguOptions = sido === null ? [] : sigunguBySido(sido);

  /** 시/도와 구 이름을 코드로 옮긴다. 하나라도 비면 `null`이다. */
  function codeOf(sidoName: string | null, sigunguName: string | null): string | null {
    if (sidoName === null || sigunguName === null) return null;
    return sigunguBySido(sidoName).find((s) => s.sigunguName === sigunguName)?.regionCode ?? null;
  }

  return (
    <fieldset className="field region-select">
      <legend>어느 지역에 살고 싶으세요?</legend>
      <div className="field">
        <label htmlFor="sido-select">광역단체</label>
        <select
          id="sido-select"
          value={sido ?? ""}
          onChange={(e) => {
            const next = e.target.value === "" ? null : e.target.value;
            setSido(next);
            // 시/도가 바뀌면 그 시/도의 구 목록으로 다시 비운다 — 고른 것이
            // 없어졌으니 바깥에도 그렇게 알린다.
            setSigungu(null);
            onRegionChange(null);
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
            onChange={(e) => {
              const next = e.target.value === "" ? null : e.target.value;
              setSigungu(next);
              onRegionChange(codeOf(sido, next));
            }}
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

    </fieldset>
  );
}
