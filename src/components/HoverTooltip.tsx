import { useRef, useState } from "react";

/**
 * 호버·포커스로 여는 짧은 설명 카드의 위치를 잰다.
 *
 * **`position: fixed`로 띄우는 걸 전제로 뷰포트 좌표를 잰다** — 트리거를
 * 감싼 조상 중 `overflow`가 걸린 것이 있으면(예: `.result-topbar`의
 * `overflow-x: auto`) `position: absolute`는 그 경계에서 잘린다(실측,
 * 상단바 무주택·생애최초·규제지역 카드가 이 문제로 잘렸다). `fixed`는
 * `transform`·`filter`가 없는 조상의 overflow에 갇히지 않는다 —
 * `ComplexDetail.tsx`의 "한도 결정 내역"·"부대비용" 팝업이 사이드바의
 * 같은 문제를 같은 방법으로 푼 것과 같다.
 *
 * 그 팝업들과 다른 점: 이건 **클릭이 아니라 호버·포커스**로 여닫히는
 * 순간적인 힌트라, 열려 있는 동안 스크롤을 계속 추적하지 않는다 — 실제
 * 스크롤이 일어나면 마우스가 트리거를 벗어나 자연히 닫히는 경우가
 * 대부분이고, 그 정도 어긋남을 감수하는 편이 스크롤 리스너를 다는
 * 것보다 이 정도 힌트에는 낫다.
 */
export function useHoverTooltip<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function show() {
    const rect = ref.current?.getBoundingClientRect();
    if (rect === undefined) return;
    setPos({ top: rect.bottom + 6, left: rect.left + rect.width / 2 });
  }

  function hide() {
    setPos(null);
  }

  return { ref, pos, show, hide };
}

/**
 * `useHoverTooltip`이 잰 위치에 실제로 뜨는 카드. `pos`가 `null`이면
 * 아무것도 렌더링하지 않는다 — 화면에 없어야 하는 시간에도 DOM에
 * 남아 있다가 CSS로만 숨는 방식(예전 `:hover` 전용 접근)을 쓰지 않는다.
 *
 * **`lines`는 항상 배열이다.** 한 줄짜리도 `["..."]`로 넘긴다 — 사용자
 * 지시("내용이 다르면 2줄로 정리해줘")로 규제지역·생애최초 카드가
 * 서로 다른 두 문장(LTV가 어떻게 바뀌는가 / 그래서 무엇이 달라지는가)을
 * 담게 되면서, 한 줄과 두 줄을 같은 타입으로 받게 했다 — `text: string`
 * 하나였다면 두 줄을 붙이려는 자리마다 줄바꿈 문자를 손으로 넣었을
 * 것이다. `white-space: nowrap`은 카드에 상속돼 각 줄 안에서는 그대로
 * 안 꺾이고, 줄 사이는 `.result-topbar-tooltip-line`이 `display: block`
 * 이라 쌓인다.
 */
export function HoverTooltipCard({
  pos,
  lines,
}: {
  pos: { top: number; left: number } | null;
  lines: readonly string[];
}) {
  if (pos === null) return null;
  return (
    <span className="result-topbar-tooltip" role="tooltip" style={{ top: pos.top, left: pos.left }}>
      {lines.map((line, i) => (
        <span key={i} className="result-topbar-tooltip-line">
          {line}
        </span>
      ))}
    </span>
  );
}
