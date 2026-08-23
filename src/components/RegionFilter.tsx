import { Checkbox } from "seed-design/ui/checkbox";
import { REGION_NAMES, type RegionSummary } from "../data/complexes";

export interface RegionFilterProps {
  regions: readonly RegionSummary[];
  /** 비어 있으면 전체 지역 */
  selected: readonly string[];
  onChange: (regionCodes: string[]) => void;
}

/**
 * 지역(시군구) 다중 선택. 아무것도 안 고르면 전체다.
 *
 * 지역을 고르면 규제지역 여부가 그 지역에서 정해진다 — 호출부가
 * `rules.regulatedRegionCodes`로 판단해 프로필에 반영한다. 그래서 이
 * 화면이 붙으면 "모르니까 안전하게 규제지역" 가정 하나가 사라진다.
 */
export function RegionFilter({ regions, selected, onChange }: RegionFilterProps) {
  function toggle(code: string, checked: boolean | "indeterminate") {
    // SEED Checkbox는 boolean|"indeterminate"를 준다. "indeterminate"는
    // truthy 문자열이라 !! 로 뭉개면 참이 된다 — 명시적으로 좁힌다.
    const isChecked = checked === true;
    onChange(
      isChecked
        ? [...selected, code]
        : selected.filter((c) => c !== code),
    );
  }

  return (
    <section className="region-filter" aria-label="지역 선택">
      <p className="region-filter-title">지역</p>
      <div className="region-filter-options">
        {regions.map((r) => (
          <Checkbox
            key={r.regionCode}
            label={`${REGION_NAMES[r.regionCode] ?? r.regionCode} (${r.complexCount}단지)`}
            checked={selected.includes(r.regionCode)}
            onCheckedChange={(checked) => toggle(r.regionCode, checked)}
          />
        ))}
      </div>
      {selected.length === 0 && (
        <p className="hint">지역을 안 고르면 전체를 봐요.</p>
      )}
    </section>
  );
}
