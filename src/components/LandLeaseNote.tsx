import { landLeaseNotice } from "../lib/land-lease";
import { landLeaseRules } from "../state/landLeaseRules";

/**
 * 어느 화면에 붙는 표시인가.
 *
 * - `"monthly"`(기본): 월 상환액 옆 — 목록의 행, 단지 상세.
 * - `"price"`: 호가 위치 확인.
 *
 * 문장을 가르는 실질적인 이유는 **단지 상세가 호가 화면을 품고 있다**는
 * 것이다. 두 자리에 같은 문장을 쓰면 한 화면에 똑같은 경고가 두 번 뜨고,
 * 그러면 둘 다 잡음으로 읽힌다. 짚어야 하는 사실도 실제로 다르다 — 한쪽은
 * "이 월 상환액 밖에 매달 나가는 돈이 있다"이고, 다른 쪽은 "이 호가는
 * 땅값이 아니라 건물값이다"이다.
 */
export type LandLeaseNoteVariant = "monthly" | "price";

export interface LandLeaseNoteProps {
  /** `ComplexUnit.landLeasehold` 값을 그대로 넘긴다 */
  landLeasehold: "Y" | "N" | null;
  variant?: LandLeaseNoteVariant;
}

/**
 * 이 평형이 토지임대부라는(또는 토지임대부인지 모른다는) 표시.
 *
 * **월 상환액 옆에 붙는다.** 토지임대부 주택은 건물만 사고 토지는
 * 빌려 쓰므로 토지 사용료가 매달 따로 나가는데, 그 금액은 우리
 * 데이터에 없어 우리가 계산한 월 상환액에도 부담률에도 들어 있지
 * 않다. 사용자가 "월 얼마"를 읽는 바로 그 자리에서 그 사실을 알아야
 * 표시가 제 일을 한다 — 화면 아래 각주로 밀면 읽히지 않는다.
 *
 * **`null`(모름)은 "아님"이 아니다.** 그리지 않는 것은 `"N"` 하나뿐
 * 이고, `null`은 "확인이 필요해요"로 그린다(`landLeaseNotice` 참고).
 *
 * **표시는 색이 아니라 글자다.** `data-state`는 색을 입히는 고리일
 * 뿐이고, 색이 하나도 적용되지 않아도(흑백 인쇄·색각 이상)
 * `.land-lease-badge`의 글자만으로 무슨 상태인지 읽힌다 —
 * `SafetyBadge`·`PriceCheck`와 같은 규칙이다.
 *
 * **문구는 전부 룰셋(`rules/land-lease-2026-08.json`)에서 온다.** 세
 * 화면이 같은 객체를 읽으므로 한쪽만 고쳐져 서로 다른 말을 할 수 없다.
 *
 * ## 왜 전부 `<span>`인가
 *
 * 목록의 행은 `onSelect`가 있으면 통째로 `<button>` 안으로 들어간다.
 * `<button>`의 콘텐츠 모델은 phrasing content라 `<p>`가 유효하지
 * 않다(`ComplexList`의 행 마크업이 같은 이유로 `<span>`이다). 블록
 * 모양과 여백은 `styles.css`가 준다.
 */
export function LandLeaseNote({
  landLeasehold,
  variant = "monthly",
}: LandLeaseNoteProps) {
  const notice = landLeaseNotice(landLeasehold, landLeaseRules);
  if (notice === null) return null;

  return (
    <span
      className="land-lease-note"
      data-state={notice.state}
      data-variant={variant}
    >
      <span className="land-lease-badge">{notice.badge}</span>{" "}
      <span className="land-lease-body">
        {variant === "price" ? notice.priceNote : notice.monthlyNote}
      </span>
      {/*
        "우리가 대신 계산해 주지 못하니 어디서 확인하라"는 줄은 **월
        갈래에만** 붙는다. 금액을 지어내지 않는 대신 반드시 해야 하는
        말이지만, 그 말이 가리키는 것은 **매달 나가는 돈**이라(입주자
        모집공고·분양계약서의 토지 사용료) 월 상환액 옆이 그 문장의
        제자리다.

        빼는 쪽을 택한 이유는 중복이다. 호가 갈래가 뜨는 화면은 단지
        상세 하나뿐이고(`PriceCheck`를 그리는 곳이 거기뿐이다), 거기서는
        월 갈래가 **먼저** 같은 문장을 이미 말한다. 한 화면에 똑같은
        문장이 두 번 뜨면 둘 다 잡음으로 읽혀서, 정작 읽혀야 할 때
        넘겨진다 — 이 컴포넌트가 문장을 두 벌로 가른 이유와 같다.
        종이에서도 같은 문장이 한 번만 남는다.
      */}
      {variant === "monthly" && (
        <>
          {" "}
          <span className="land-lease-check">{notice.checkNote}</span>
        </>
      )}
    </span>
  );
}
