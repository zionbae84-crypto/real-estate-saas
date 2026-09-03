/**
 * ㎡ ↔ 평 변환. 1평 = 400/121 ㎡(정확한 값, 3.305785...).
 *
 * ⚠ **필터가 실제로 거르는 값은 언제나 ㎡다**(`ComplexUnit.maxExclusiveAreaSqm`,
 * `src/lib/complex-filters.ts`). 이 파일은 그 값을 사람이 익숙한 단위로
 * **보여주기만** 한다 — 평으로 변환한 값을 저장하거나 그 값으로 다시
 * 거르지 않는다. 사용자 지시로 면적 슬라이더의 표시 단위를 평으로
 * 바꿨을 때(참고 사진), 그 지시가 향한 것은 슬라이더 위 숫자였지
 * 부대비용·정책대출 계산이 쓰는 ㎡ 기준이 아니다 — 그 기준은
 * `useProfileForm`의 `toProfile`이 여전히 룰셋의 `ruralTaxAreaThresholdSqm`
 * (85㎡)에서 직접 읽는다.
 */
export const SQM_PER_PYEONG = 400 / 121;

export function sqmToPyeong(sqm: number): number {
  return sqm / SQM_PER_PYEONG;
}

export function pyeongToSqm(pyeong: number): number {
  return pyeong * SQM_PER_PYEONG;
}
