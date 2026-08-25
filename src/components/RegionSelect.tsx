import { useState } from "react";
import { SIDO_NAMES, sigunguBySido } from "../data/regions";

export interface RegionSelectProps {
  onSelect: (regionCode: string) => void;
}

/**
 * 광역단체 → 자치구 2단 선택.
 *
 * 행정동은 여기서 고르지 않는다 — 국토부 API가 동 단위 파라미터를
 * 지원하지 않고, 조회 결과 안에서 걸러야 하기 때문이다(부모 스펙 §3의
 * 설계 메모 참고). 그래서 이 컴포넌트는 구까지만 확정하면 끝이고, 동
 * 좁히기는 결과를 받은 뒤 다른 컴포넌트가 담당한다.
 */
export function RegionSelect({ onSelect }: RegionSelectProps) {
  const [sido, setSido] = useState<string | null>(null);
  const [sigungu, setSigungu] = useState<string | null>(null);

  const sigunguOptions = sido === null ? [] : sigunguBySido(sido);
  const selectedRegionCode =
    sigungu === null ? null : sigunguOptions.find((s) => s.sigunguName === sigungu)?.regionCode ?? null;

  return (
    <section className="region-select" aria-label="지역 선택">
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
        disabled={selectedRegionCode === null}
        onClick={() => {
          if (selectedRegionCode !== null) onSelect(selectedRegionCode);
        }}
      >
        이 지역으로 조회하기
      </button>
    </section>
  );
}
