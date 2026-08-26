import { AREA_BANDS, areaBandRanges, type AreaBand } from "../lib/area-band";

export interface AreaBandSelectProps {
  value: readonly AreaBand[];
  onChange: (bands: AreaBand[]) => void;
  /** 농특세가 갈리는 전용면적(㎡). 룰셋에서 받는다 — 숫자를 박지 않는다 */
  ruralTaxAreaThresholdSqm: number;
}

/**
 * 화면 1의 네 번째 질문 — **어느 평형대요?**
 *
 * 손으로 숫자를 치지 않게 **세 구간**을 칩으로 낸다(60㎡ 이하 / 60~85㎡ /
 * 85㎡ 초과). **복수 선택**이고 기본값은 전체 선택(= 필터 없음)이다.
 *
 * 구간의 뜻과 경계는 전부 `lib/area-band.ts`가 정한다 — 이 컴포넌트는
 * 숫자를 하나도 모른다.
 *
 * **네이티브 `<input type="checkbox">`를 라벨로 감싼다.** SEED의
 * 체크박스·라디오를 재구현하지 않는다는 전역 제약을 지키면서(벤더
 * 컴포넌트를 흉내 낸 커스텀 위젯을 만들지 않는다), 키보드 조작·포커스
 * 순서·스크린 리더 노출을 브라우저가 그대로 담당하게 한다. 같은 화면의
 * 주택 보유 세그먼트가 라디오로 쓰던 방식과 같은 방식이고, 그 자리는
 * CSS만으로 세그먼트 모양이 됐다 — 여기서도 모양은 `styles.css`가
 * 맡는다.
 *
 * `<fieldset>`/`<legend>`인 이유: 체크박스 셋이 **하나의 질문**에 대한
 * 답이라, 각 칩의 라벨만으로는 무엇을 묻는지 알 수 없다. 스크린 리더가
 * 그룹 이름을 함께 읽어야 "소형"이 무엇의 소형인지 뜻이 선다.
 *
 * 배치는 `DESIGN.md`의 Stat Block 규율을 빌린다 — **라벨 작게 위, 값
 * 크게 아래, 왼쪽 정렬.** 여기서 라벨은 범위(`60㎡ 이하`)이고 값은 구간
 * 이름(`소형`)이다. DOM 순서는 이름 → 범위라 접근성 이름이
 * "소형 60㎡ 이하"로 읽히고, 눈에 보이는 순서만 CSS가 뒤집는다.
 *
 * ⚠ **범위 라벨은 ㎡가 주(主)다**(스펙 §4). 평(坪)은 병기하지 않았다 —
 * 병기하면 칩 하나에 숫자가 넷이 되어, 손으로 숫자를 치지 않게 하려고
 * 만든 컨트롤이 다시 숫자 읽기 과제가 된다.
 */
export function AreaBandSelect({
  value,
  onChange,
  ruralTaxAreaThresholdSqm,
}: AreaBandSelectProps) {
  const ranges = areaBandRanges(ruralTaxAreaThresholdSqm);

  function toggle(band: AreaBand) {
    // 순서는 저장·표시 모두 AREA_BANDS가 정한다 — 누른 순서대로 쌓으면
    // 종이에 적히는 순서가 사용자의 클릭 순서에 좌우된다.
    const next = value.includes(band)
      ? value.filter((b) => b !== band)
      : AREA_BANDS.filter((b) => b === band || value.includes(b));
    onChange([...next]);
  }

  return (
    <fieldset className="field area-band-select">
      <legend>어느 평형대요?</legend>
      <p className="hint">
        전용면적 기준이에요. 여러 개 고를 수 있고, 고른 평형대만 지도와
        목록에 보여줘요.
      </p>
      <div className="area-band-options">
        {ranges.map((range) => (
          <label className="area-band-option" key={range.band}>
            <input
              type="checkbox"
              name="area-band"
              value={range.band}
              checked={value.includes(range.band)}
              onChange={() => toggle(range.band)}
            />
            <span className="area-band-text">
              <span className="area-band-name">{range.band}</span>{" "}
              <span className="area-band-range">{range.rangeLabel}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
