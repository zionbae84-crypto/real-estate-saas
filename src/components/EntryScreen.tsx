import { useEffect, useState, type ReactNode } from "react";

export interface EntryScreenProps {
  /**
   * App.tsx의 화면 단계. `"결과"`일 때 이 화면은 시각적으로 숨는다
   * (styles.css의 `.entry-screen--hidden`).
   *
   * **`phase`를 보고 자식(`ProfileForm`·`RegionSelect`)을 조건부로
   * 마운트/언마운트하지 않는다.** `App.tsx`의 `phase` 주석에
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
 * 2. `ProfileForm`이 들고 있는 SEED 입력 컴포넌트들은 화면 전환마다
 *    언마운트되면 리액트가 매번 새 인스턴스를 만들어, 유형·단계를
 *    오가는 기존 테스트(`purchase-type.test.tsx`)가 보는 엣지케이스가
 *    늘어난다.
 *
 *    (`PurchaseTypeSelect`는 예외다 — 리뷰 수정 Important 3으로, 투자
 *    유형에서는 이 화면이 아니라 결과 화면 쪽에 선다. 그 라디오는
 *    `value`/`onChange`만 받는 완전한 controlled 컴포넌트라 자기 상태가
 *    없어서, 자리를 옮겨도 잃을 것이 없다. 자리를 옮긴 이유는 `App.tsx`
 *    의 해당 주석에 적었다.)
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

  /*
   * 리뷰 수정(Minor 10): 이 화면이 떠 있는 동안 문서 스크롤을 잠근다.
   *
   * 이 레이어는 `position: fixed; inset: 0`이라 자기 자신은 문서 높이에
   * 기여하지 않지만, 그 **뒤에** 깔린 결과 트리(`.results-screen`)는
   * 언마운트되지 않고 그대로 높이를 만든다 — 그래서 아무것도 움직이지
   * 않는 페이지 스크롤바가 생긴다. 스크롤해도 화면은 그대로고(오버레이가
   * 고정이다) 스크롤바만 움직인다.
   *
   * design.md §4가 결과 화면에 요구한 `body { overflow: hidden }`과 같은
   * 처리를, 지금 실제로 전체화면인 이 화면에 건다. 원래 값을 기억했다가
   * 되돌린다 — 화면이 걷히면(또는 이 컴포넌트가 사라지면) 결과 화면은
   * 다시 세로로 흐르는 문서라 스크롤이 필요하다.
   */
  useEffect(() => {
    if (phase !== "입력") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [phase]);

  return (
    <section
      className={
        phase === "결과" ? "entry-screen entry-screen--hidden" : "entry-screen"
      }
      aria-hidden={phase === "결과"}
    >
      {/*
        장식이다 — 이 영상은 정보를 담지 않는다. 리뷰 수정(Minor 9):
        `aria-hidden`이 없으면 스크린 리더가 이 자리에 미디어 요소가
        있다고 읽어, 아무 뜻도 없는 항목 하나를 입력 화면 앞에 세운다.
      */}
      <video
        aria-hidden="true"
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
