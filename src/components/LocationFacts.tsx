import { formatMeters } from "../format/meters";
import type {
  LocationAssessment,
  LocationRules,
  SchoolFinding,
  SubwayFinding,
} from "../lib/location";
import { useLocationFacts } from "../state/useLocationFacts";

export interface LocationFactsProps {
  /** 단지 고유 ID. 좌표는 평형이 아니라 단지에 붙는다 */
  complexKey: string;
}

/**
 * 이 단지 주변에 무엇이 있는가 — **사실만.**
 *
 * 내는 것은 둘뿐이다: 가장 가까운 지하철역과 그 직선거리, 반경 안의
 * 초등학교와 각각의 직선거리.
 *
 * **점수도 등급도 순위도 없다.** "학군 90점"·"교통 우수"는 가치판단을
 * 사실처럼 포장한 것이고 검증할 수 없다 — 이 앱이 `medianPrice`를 화면에서
 * 뺀 것과 같은 이유로 여기에도 그런 표시가 없고, 앞으로 생기지도 않는다.
 * 엔진이 애초에 그런 값을 내지 않으므로(`src/lib/location/types.ts`에 그런
 * 필드가 없다) 이 화면이 그리려 해도 그릴 재료가 없다.
 *
 * **주소를 내지 않는다.** 지번 주소는 좌표를 얻는 입력으로만 쓰고 화면에
 * 오지 않는다.
 *
 * ## 좌표를 모를 때 — 이 화면에서 가장 중요한 자리
 *
 * 지금은 모든 단지가 이 상태다(좌표를 아직 못 구했다). 그때 화면은
 * **빈 목록을 그리지 않는다.** 반경 안에 초등학교가 0곳인 것과 좌표를
 * 몰라 못 세는 것은 완전히 다른 사실인데, 둘 다 빈 목록이 되면 사용자는
 * 언제나 낙관적인 쪽으로 읽는다. 엔진이 두 경우에 아예 다른 모양의 값을
 * 내므로(`unlocated`에는 `subway`·`elementarySchool` 필드 자체가 없다)
 * 이 컴포넌트는 실수로도 "0곳"을 그릴 수 없다.
 *
 * ## 고지
 *
 * 학구도 고지는 **상태와 무관하게** 그려진다 — 아무것도 재지 못한 지금도
 * 마찬가지다. 좌표가 생기는 날 고지만 빠뜨리는 경로를 애초에 만들지 않으려는
 * 것이다.
 *
 * 반면 **직선거리 고지는 거리를 실제로 그리는 `located`에서만** 나간다. 그
 * 문장은 "여기 적힌 거리는 전부 직선거리"라고 말하는데, 좌표를 모르면 적힌
 * 거리가 하나도 없어 가리킬 대상이 없다. `LocationFacts.test.tsx`가 모든
 * 상태에서 이 두 규칙을 함께 확인한다.
 *
 * 이 영역은 인쇄에서 **통째로 남는다.** 조작 장치가 하나도 없어 숨길
 * 것이 없고, 여기서 가장 무거운 말인 두 고지는 종이에서 더 중요하다 —
 * 종이를 건네받은 사람은 화면의 다른 맥락을 보지 못했다.
 */
export function LocationFacts({ complexKey }: LocationFactsProps) {
  const { rules, assessment } = useLocationFacts(complexKey);
  return <LocationFactsView rules={rules} assessment={assessment} />;
}

/**
 * 위 컴포넌트가 그리는 것 전부. 데이터를 어디서 얻는지만 갈라 뒀다.
 *
 * 지금은 좌표가 하나도 없어 {@link LocationFacts}를 통해서는 "아직 위치를
 * 몰라요" 한 갈래밖에 볼 수 없다. 그렇다고 나머지 갈래를 테스트하지 않고
 * 두면, 좌표가 들어오는 날 처음으로 그 화면이 그려진다 — 고지가 빠졌는지
 * "모른다"가 "없다"로 접혔는지를 그때 알게 된다는 뜻이다. 그래서 이 뷰를
 * 따로 내보내 테스트가 엔진 산출물을 직접 먹인다.
 */
export function LocationFactsView({
  rules,
  assessment,
}: {
  rules: LocationRules;
  assessment: LocationAssessment;
}) {
  return (
    <section className="location-facts" aria-label="주변에 무엇이 있는지">
      <h3 className="location-facts-title">{assessment.label}</h3>

      {/*
        상태는 **글자**로 말한다. `data-state`는 색을 입히는 고리일 뿐이고,
        색이 하나도 적용되지 않아도(흑백 인쇄·색각 이상) 지금이 "아직
        위치를 몰라요"인지 아닌지 읽을 수 있어야 한다. RightsVerdict·
        PurchaseVerdict·PriceCheck와 같은 규칙이다.
      */}
      <p className="location-state" data-state={assessment.state}>
        {assessment.stateLabel}
      </p>
      <p className="location-state-note">{assessment.stateNote}</p>

      {assessment.state === "located" && (
        <ul className="location-fact-list">
          <li className="location-fact" data-fact="subway">
            <SubwayFact finding={assessment.subway} rules={rules} />
          </li>
          <li className="location-fact" data-fact="elementarySchool">
            <SchoolFact finding={assessment.elementarySchool} rules={rules} />
          </li>
        </ul>
      )}

      <Disclosure assessment={assessment} />

      <ul className="location-disclaimer">
        {assessment.disclaimer.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}

/**
 * 사실과 함께 나가는 고지.
 *
 * 넷 중 셋(학구도·빠진 요소·점수 안 매김)은 **좌표를 몰라 위에 아무것도
 * 그리지 않은 상태에서도 그대로 나간다.** 특히 학구도 고지가 빠지면 우리가
 * 틀린 확신을 준다 — 화면에 가장 가까운 학교가 적혀 있는데 배정이 거리순이
 * 아니라는 말이 없으면, 그 목록은 배정 결과처럼 읽힌다.
 *
 * **직선거리 고지만 `located`에서만 나간다.** 그 문장은 "여기 적힌 거리는
 * 전부 직선거리"라고 말하는데, 좌표를 모르는 상태에서는 적힌 거리가 하나도
 * 없어서 문장이 가리킬 대상이 없다. 없는 것을 두고 단서를 달면 사용자는
 * 위에 거리가 적혀 있다고 믿고 찾게 되고, 정작 읽어야 할 "재지 못했다"가
 * 그만큼 묻힌다.
 */
function Disclosure({ assessment }: { assessment: LocationAssessment }) {
  const d = assessment.disclosure;
  return (
    <ul className="location-disclosure">
      {assessment.state === "located" && (
        <li data-field="straightLine">{d.straightLineNote}</li>
      )}
      <li data-field="schoolZone">{d.schoolZoneNote}</li>
      <li data-field="missingFactors">{d.missingFactorsNote}</li>
      <li data-field="notARating">{d.notARatingNote}</li>
    </ul>
  );
}

/**
 * 거리 한 줄. **"직선거리"라는 말이 숫자 바로 옆에 붙는다.**
 *
 * 아래 고지가 같은 말을 다시 하지만, 숫자를 읽는 순간에 그 말이 눈에
 * 없으면 사용자는 숫자부터 기억한다 — 표에 박힌 숫자는 옆의 설명보다
 * 먼저 읽힌다.
 */
function Distance({ meters, label }: { meters: number; label: string }) {
  return (
    <span className="location-distance">
      <span className="location-distance-label">{label}</span>{" "}
      <span className="location-distance-value">{formatMeters(meters)}</span>
    </span>
  );
}

/** 가장 가까운 지하철역. 못 쟀으면 왜 못 쟀는지만 말한다 */
function SubwayFact({
  finding,
  rules,
}: {
  finding: SubwayFinding;
  rules: LocationRules;
}) {
  return (
    <>
      <p className="location-fact-head">
        <span className="location-fact-label">{finding.label}</span>
      </p>
      {finding.measured && (
        <p className="location-fact-value">
          <span className="location-place-name">{finding.nearest.name}</span>{" "}
          <span className="location-place-line">{finding.nearest.lineName}</span>{" "}
          <Distance
            meters={finding.nearest.straightLineMeters}
            label={rules.distanceLabel}
          />
        </p>
      )}
      <p className="location-fact-message">{finding.message}</p>
    </>
  );
}

/**
 * 반경 안의 초등학교.
 *
 * **못 센 것과 0곳을 다르게 그린다.** 못 셌으면 목록 자체가 없고(엔진이
 * `schools` 필드를 주지 않는다), 0곳이면 "한 곳도 없었어요"라고 문장으로
 * 말한다. 어느 쪽도 빈 목록을 그리지 않는다 — 빈 목록은 언제나 가장
 * 낙관적으로 읽힌다.
 *
 * 목록의 차례는 거리순이지만 배정 차례가 아니다. 그 사실을 룰셋 문구와
 * 아래 고지가 함께 말한다.
 */
function SchoolFact({
  finding,
  rules,
}: {
  finding: SchoolFinding;
  rules: LocationRules;
}) {
  return (
    <>
      <p className="location-fact-head">
        <span className="location-fact-label">{finding.label}</span>
      </p>
      {finding.measured && finding.schools.length > 0 && (
        <ol className="location-school-list">
          {finding.schools.map((school) => (
            <li key={school.name} className="location-school">
              <span className="location-place-name">{school.name}</span>{" "}
              <Distance
                meters={school.straightLineMeters}
                label={rules.distanceLabel}
              />
            </li>
          ))}
        </ol>
      )}
      <p className="location-fact-message">{finding.message}</p>
    </>
  );
}
