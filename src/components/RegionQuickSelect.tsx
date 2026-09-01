import { useEffect, useState } from "react";
import { SIDO_NAMES, regionByCode, sigunguBySido } from "../data/regions";

export interface RegionQuickSelectProps {
  /** 지금 조회 중인 지역. 두 select가 이 값을 되비춘다. */
  regionCode: string;
  /** 자치구를 고르면 그 코드로 곧바로 다시 조회한다. */
  onSelect: (regionCode: string) => void;
  /** 조회 중일 때 잠근다 — 연달아 누르면 응답 순서가 엉킨다. */
  disabled?: boolean;
}

/**
 * 결과 화면 상단바에서 지역을 **그 자리에서** 바꾸는 두 select.
 *
 * 사용자 지시: "지도페이지 들어온 후 조건변경은 상단 사이드 바에서
 * 직접하고싶어 … 지역을 직접 변경할 수 있도록 해줘."
 *
 * ⚠ **`RegionSelect`(입력 화면)를 재사용하지 않는다.** 두 화면은 언제나
 * **함께 마운트돼 있다**(App.tsx의 `phase`는 화면을 감추기만 한다) —
 * 그래서 같은 컴포넌트를 한 벌 더 그리면 `sido-select`/`sigungu-select`
 * DOM id와 "광역단체"/"자치구" 라벨, "이 지역으로 조회하기" 버튼 이름이
 * 문서에 두 벌씩 생긴다. id 중복은 라벨 연결을 깨고, 이름 중복은
 * `getByLabelText("광역단체")`류 접근성 질의를 애매하게 만든다(테스트가
 * 실제로 그 이름들로 입력 화면을 찾는다). 그래서 **id도 라벨도 다른**
 * 별도 컴포넌트다.
 *
 * 조회 버튼도 두지 않는다. 입력 화면에서는 "고르고 나서 누른다"가 첫
 * 조회를 여는 동작이지만, 여기서는 이미 결과를 보고 있는 중이라 자치구를
 * 고르는 것 자체가 "이 지역을 보여 달라"는 뜻이다 — 버튼을 한 번 더
 * 누르게 하면 사용자가 말한 "직접 변경"이 아니다.
 */
export function RegionQuickSelect({
  regionCode,
  onSelect,
  disabled = false,
}: RegionQuickSelectProps) {
  const current = regionByCode(regionCode);
  const [sido, setSido] = useState(current?.sidoName ?? SIDO_NAMES[0]!);

  /*
   * 바깥에서 지역이 바뀌면(예: 입력 화면에서 다시 조회하고 돌아오면)
   * 시도 select도 따라간다 — 안 그러면 상단바가 지금 보고 있는 지역과
   * 다른 시도를 펼친 채로 남는다.
   */
  useEffect(() => {
    if (current !== null) setSido(current.sidoName);
  }, [current?.sidoName]);

  const sigunguOptions = sigunguBySido(sido);

  return (
    <div className="region-quick-select">
      <label className="region-quick-select-field">
        <span className="region-quick-select-label">시·도 바꾸기</span>
        <select
          value={sido}
          disabled={disabled}
          onChange={(event) => setSido(event.target.value)}
        >
          {SIDO_NAMES.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </label>
      <label className="region-quick-select-field">
        <span className="region-quick-select-label">시·군·구 바꾸기</span>
        <select
          /*
           * 고른 시도가 지금 지역의 시도와 다르면 되비출 자치구가 없다
           * ("" = placeholder). 그 상태에서 자치구를 고르는 순간 조회가
           * 나가므로, 빈 값은 화면에만 있고 조회로는 이어지지 않는다.
           */
          value={current !== null && current.sidoName === sido ? current.regionCode : ""}
          disabled={disabled}
          onChange={(event) => {
            if (event.target.value !== "") onSelect(event.target.value);
          }}
        >
          <option value="">고르세요</option>
          {sigunguOptions.map((option) => (
            <option key={option.regionCode} value={option.regionCode}>
              {option.sigunguName}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
