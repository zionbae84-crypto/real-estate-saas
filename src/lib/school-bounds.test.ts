import { describe, expect, it } from "vitest";
import { regionSchoolBounds, schoolsWithinBounds } from "./school-bounds";

describe("regionSchoolBounds", () => {
  it("좌표가 없으면 null이다", () => {
    expect(regionSchoolBounds(new Map())).toBeNull();
  });

  it("단지 좌표들의 바운딩박스에 여백(0.02도)을 둔다", () => {
    const coordinates = new Map([
      ["a", { lat: 37.5, lon: 127.0 }],
      ["b", { lat: 37.52, lon: 127.05 }],
    ]);
    expect(regionSchoolBounds(coordinates)).toEqual({
      minLat: 37.48,
      maxLat: 37.54,
      minLon: 126.98,
      maxLon: 127.07,
    });
  });

  it("단지가 하나뿐이어도 그 점 주위로 여백을 둔다", () => {
    const coordinates = new Map([["a", { lat: 37.5, lon: 127.0 }]]);
    expect(regionSchoolBounds(coordinates)).toEqual({
      minLat: 37.48,
      maxLat: 37.52,
      minLon: 126.98,
      maxLon: 127.02,
    });
  });
});

describe("schoolsWithinBounds", () => {
  const BOUNDS = { minLat: 37.0, maxLat: 38.0, minLon: 127.0, maxLon: 128.0 };

  it("bounds가 null이면 빈 배열이다", () => {
    const schools = [{ id: "1", name: "안", coordinate: { lat: 37.5, lon: 127.5 } }];
    expect(schoolsWithinBounds(schools, null)).toEqual([]);
  });

  it("범위 안 학교만 남긴다", () => {
    const inside = { id: "1", name: "안", coordinate: { lat: 37.5, lon: 127.5 } };
    const outside = { id: "2", name: "밖", coordinate: { lat: 39.0, lon: 127.5 } };
    expect(schoolsWithinBounds([inside, outside], BOUNDS)).toEqual([inside]);
  });

  it("경계값 자체는 포함한다", () => {
    const onEdge = { id: "1", name: "경계", coordinate: { lat: 37.0, lon: 127.0 } };
    expect(schoolsWithinBounds([onEdge], BOUNDS)).toEqual([onEdge]);
  });

  it("학교가 없으면 빈 배열이다", () => {
    expect(schoolsWithinBounds([], BOUNDS)).toEqual([]);
  });
});
