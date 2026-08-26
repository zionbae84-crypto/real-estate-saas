import { useState, type ReactNode } from "react";

export interface EntryScreenProps {
  /**
   * App.tsx의 화면 단계. `"결과"`일 때 이 화면은 시각적으로 숨는다
   * (styles.css의 `.entry-screen--hidden`).
   *
   * **여기서 자식(`PurchaseTypeSelect`·`ProfileForm`·`RegionSelect`)을
   * 조건부로 마운트/언마운트하지 않는다.** `App.tsx`의 `phase` 주석에
   * 이유를 자세히 적었다 — 요약하면, `AssumptionLine`이 여는
   * `ProfileForm`의 전용면적 입력란이 지역 조회 성공 **이후**(즉
   * `phase === "결과"`가 된 뒤)에도 계속 도달 가능해야 하는 기존 계약이
   * 있다(App.test.tsx "상세가 열려 있는 동안에는 전용면적 입력란을
   * 내보내지 않는다"). 언마운트 방식으로는 이 계약을 지킬 수 없다.
   */
  phase: "입력" | "결과";
  children: ReactNode;
}

/**
 * 화면 1 — 영상 배경 위 입력 화면의 시각 프레임.
 *
 * `docs/superpowers/specs/2026-08-26-영상히어로-전체화면지도-design.md`
 * §3을 그대로 따른다: 전체화면 영상(`object-fit: cover`, 무음 루프) 위에
 * 좌측 스크림과 입력 패널을 얹는다.
 *
 * **자식을 감싸기만 한다.** `PurchaseTypeSelect`·`ProfileForm`·
 * `RegionSelect`(와 지역 조회 로딩/실패 문구)는 `App.tsx`가 그대로
 * 조립해 `children`으로 넘긴다 — 이 컴포넌트는 그 내용이 무엇인지 모르고,
 * prop 배선도 만지지 않는다(브리프의 "로직·prop은 바꾸지 않는다").
 *
 * **`phase === "결과"`가 되어도 언마운트하지 않는다.** 대신
 * `.entry-screen--hidden` 클래스로 시각적으로만 감춘다. 이유 셋:
 *
 * 1. 위 `phase` prop 문서가 적은 것처럼, `ProfileForm`의 일부(전용면적
 *    입력란)는 결과 화면에서도 `AssumptionLine`을 통해 도달 가능해야
 *    한다는 기존 테스트 계약이 있다.
 * 2. `PurchaseTypeSelect`를 여러 번 연달아 눌러 유형을 오가는 기존
 *    테스트(`purchase-type.test.tsx`)가 다수 있다 — 그 라디오가 화면
 *    전환 때마다 언마운트되면 리액트가 매번 새 인스턴스를 만들면서
 *    엣지케이스가 늘어난다.
 * 3. `RegionSelect`의 내부 상태(광역단체·자치구 선택)가 "조건 다시
 *    넣기"로 돌아왔을 때 그대로 남아 있어야 재조회가 자연스럽다 —
 *    언마운트하면 이 상태가 초기화된다.
 */
export function EntryScreen({ phase, children }: EntryScreenProps) {
  /*
   * `prefers-reduced-motion: reduce`이면 영상을 재생하지 않는다(브리프
   * 요구사항). CSS만으로는 `<video autoplay>`의 실제 재생을 막을 수
   * 없으므로(`animation`/`transition`이 아니라 미디어 재생이다) 여기서
   * `autoPlay`를 아예 끈다 — 재생이 시작되지 않으면 `poster` 속성이 그대로
   * 남아 보인다(브라우저가 자동재생을 차단했을 때와 같은 결과).
   *
   * 마운트 시점에 한 번만 읽는다. 세션 중간에 OS 설정이 바뀌는 경우까지
   * 실시간으로 따라가는 것은 이 화면의 요구사항 밖이다.
   */
  const [prefersReducedMotion] = useState(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false,
  );

  return (
    <section
      className={
        phase === "결과" ? "entry-screen entry-screen--hidden" : "entry-screen"
      }
      aria-hidden={phase === "결과"}
    >
      <video
        className="entry-screen-video"
        autoPlay={!prefersReducedMotion}
        muted
        loop
        playsInline
        poster="/media/cheongdam-han-river-hero.png"
      >
        <source src="/media/cheongdam-hero.mp4" type="video/mp4" />
      </video>
      <div className="entry-screen-scrim">
        <div className="entry-screen-panel">{children}</div>
      </div>
    </section>
  );
}
