// scripts/pipeline/pnu.ts

/**
 * 필지고유번호(PNU) — 법정동코드(10자리) + 산여부(1자리) + 본번(4자리) +
 * 부번(4자리) = 19자리. 한국부동산원 "공동주택 단지 식별정보" API가 단지를
 * 식별하는 키다.
 *
 * **이름이 아니라 필지로 식별하는 이유**: 실거래가 API의 단지명과 K-apt·
 * 한국부동산원의 단지명은 표기가 크게 갈린다 — 실측으로 강남구 실거래
 * 단지 50개를 K-apt 목록과 이름으로 대조하니 12개(24%)만 일치했다("삼익"
 * vs "역삼삼익", "한양3" vs "압구정한양3단지" 같은 식으로 동 이름이 앞에
 * 붙거나 차수 표기가 통째로 다르다). 반면 실거래가 API 자체의 주소
 * 필드(regionCode·umdCd·bonbun·bubun)로 PNU를 만들어 조회하면 같은 50개
 * 전부 정확히 일치했다 — 이름 매칭의 모호함을 완전히 피해간다.
 *
 * **"산"(임야) 여부는 항상 "1"(일반)로 둔다.** 국토부 실거래가 응답에는
 * 산 여부 필드가 아예 없어 판정할 근거가 없고, 아파트 단지가 산 지번에
 * 지어지는 사례는 사실상 없다 — 위 실측 50건이 전부 "1"로 조회에
 * 성공했다는 사실이 그 방증이다.
 */
export function computePnu(
  regionCode: string,
  umdCd: string | null,
  bonbun: string | null,
  bubun: string | null,
): string | null {
  if (umdCd === null || bonbun === null) return null;
  // 자리 수가 넘치면 지어내지 않는다 — padStart로 잘못 늘리는 대신 포기한다.
  if (regionCode.length !== 5 || umdCd.length > 5 || bonbun.length > 4) return null;
  const bubunRaw = bubun ?? "0";
  if (bubunRaw.length > 4) return null;

  // umdCd·bonbun·bubun은 원본이 숫자로 와도 우리 파서가 문자열로 바꾸며
  // 선행 0을 잃을 수 있다(parse-response.ts의 toOptionalText 참고) —
  // padStart로 자리 수를 다시 맞춘다.
  const dongCode = regionCode + umdCd.padStart(5, "0");
  const bonbunPadded = bonbun.padStart(4, "0");
  const bubunPadded = bubunRaw.padStart(4, "0");
  return `${dongCode}1${bonbunPadded}${bubunPadded}`;
}
