// scripts/pipeline/probe.ts
//
// 실거래가 API가 XML을 주는지 JSON을 주는지, 어느 엔드포인트가 살아 있는지,
// serviceKey를 Encoding 형태로 기대하는지 Decoding 형태로 기대하는지는
// 문서만으로 알 수 없다. 이 스크립트는 후보를 모두 시도해 실제 응답을 관찰한다.
//
// 공공데이터포털은 같은 키를 Encoding(퍼센트 인코딩됨)과 Decoding(평문) 두 형태로
// 함께 발급한다. 어느 쪽을 API가 기대하는지는 시도해봐야 안다:
//   - URL.searchParams로 붙이면 Decoding 키에 맞다.
//   - 쿼리스트링 끝에 그대로 이어붙이면 Encoding 키에 맞다 — searchParams를 쓰면
//     이미 퍼센트 인코딩된 값을 다시 인코딩해 %2B가 %252B로 깨지기 때문이다.
//
// 키는 절대 출력하지 않는다. URL 자체도 키를 포함하므로 로그에 남기지 않는다.
// 에러 메시지에도 키가 우연히 섞여 나올 수 있어 출력 전에 반드시 치환한다.

export {};

const KEY = process.env.PUBLIC_DATA_API_KEY;
if (!KEY) {
  console.error("PUBLIC_DATA_API_KEY 환경변수가 없습니다.");
  process.exit(1);
}

interface Endpoint {
  readonly label: string;
  readonly base: string;
}

const ENDPOINTS: readonly Endpoint[] = [
  {
    label: "A(apis.data.go.kr)",
    base: "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev",
  },
  {
    label: "B(openapi.molit.go.kr)",
    base: "http://openapi.molit.go.kr/OpenAPI_ToolInstallPackage/service/rest/RTMSOBJSvc/getRTMSDataSvcAptTrade",
  },
];

const TYPES = ["json", ""] as const;

type KeyMode = "searchParams" | "rawAppend";
const KEY_MODES: readonly KeyMode[] = ["searchParams", "rawAppend"];

/** 키를 뺀 공통 쿼리 파라미터. */
function commonParams(type: string): URLSearchParams {
  const params = new URLSearchParams();
  params.set("LAWD_CD", "11680"); // 서울 강남구
  params.set("DEAL_YMD", "202606");
  params.set("numOfRows", "5");
  params.set("pageNo", "1");
  if (type) params.set("_type", type);
  return params;
}

/**
 * 요청 URL 문자열을 만든다. 반환값은 키를 포함하므로 호출부에서 절대 로그에
 * 남기지 않는다 — fetch에 넘기는 용도로만 쓴다.
 *
 * - "searchParams" 모드: 키를 URL.searchParams로 붙인다 (Decoding 키 가정).
 * - "rawAppend" 모드: 키가 이미 퍼센트 인코딩돼 있다고 보고 쿼리스트링 끝에
 *   그대로 이어붙인다 (Encoding 키 가정).
 */
function buildUrl(base: string, type: string, mode: KeyMode, key: string): string {
  const params = commonParams(type);
  if (mode === "searchParams") {
    params.set("serviceKey", key);
    return `${base}?${params.toString()}`;
  }
  return `${base}?${params.toString()}&serviceKey=${key}`;
}

/** 에러 메시지에 키 값이 우연히 섞여 있으면 지운다. */
function redactKey(message: string, key: string): string {
  return message.split(key).join("<REDACTED>");
}

async function probeOne(endpoint: Endpoint, type: string, mode: KeyMode, key: string): Promise<void> {
  const label = `${endpoint.label} _type=${type || "(none)"} key=${mode}`;
  const url = buildUrl(endpoint.base, type, mode, key);
  try {
    const res = await fetch(url);
    const body = await res.text();
    console.log(`--- ${label} → HTTP ${res.status} ---`);
    console.log(body.slice(0, 800));
    console.log();
  } catch (e) {
    console.log(`--- ${label} → 실패: ${redactKey(String(e), key)}`);
    console.log();
  }
}

async function main(key: string): Promise<void> {
  for (const endpoint of ENDPOINTS) {
    for (const type of TYPES) {
      for (const mode of KEY_MODES) {
        await probeOne(endpoint, type, mode, key);
      }
    }
  }
}

await main(KEY);
