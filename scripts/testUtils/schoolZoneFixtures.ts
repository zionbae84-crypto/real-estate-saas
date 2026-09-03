import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decodeRing, type SchoolZone } from "../../src/data/school-zones";

/**
 * 테스트가 학교별 통학구역 청크(`public/school-zones/<학교ID>.json`)를 읽는
 * 공용 헬퍼. **`src/` 밖에 두는 이유는 `node:fs`를 쓰기 때문이다** —
 * `src/no-network.test.ts`는 `src/` 전체를 훑어 `node:` 임포트를 막는데
 * (그 자신만 예외다), 이 파일을 그 안에 두면 새 예외를 하나 더 만들어야
 * 한다. 대신 이 저장소가 이미 쓰는 원칙("scripts/는 사용자 데이터를 아예
 * 보지 않는 빌드·테스트 타임 도구")을 그대로 따라 여기 둔다 — `src/`
 * 테스트는 이 파일을 import만 하지, 자기 안에서 직접 fs를 열지 않는다.
 */
interface ZoneChunkFile {
  schemaVersion: number;
  zones: Array<{ id: string; name: string; shared: boolean; rings: number[][] }>;
}

export function readSchoolZoneChunk(schoolId: string): SchoolZone[] {
  const path = join(process.cwd(), "public", "school-zones", `${schoolId}.json`);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return [];
  }
  const chunk = JSON.parse(raw) as ZoneChunkFile;
  return chunk.zones.map((z) => ({
    id: z.id,
    name: z.name,
    shared: z.shared,
    rings: z.rings.map(decodeRing),
  }));
}
