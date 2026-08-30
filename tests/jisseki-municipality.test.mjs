import assert from "node:assert/strict";
import test from "node:test";
import {
  inferJissekiMunicipalityFromAddress,
  resolveJissekiMunicipality,
} from "../src/lib/jissekiMunicipality.ts";

const settings = [
  {
    municipality: "春日井市",
    municipality_display_name: "春日井",
    sort_order: 10,
  },
];

test("自治体設定にある住所は設定済み表示名と順序を使う", () => {
  assert.deepEqual(
    resolveJissekiMunicipality("愛知県春日井市西本町2丁目", settings),
    {
      municipality: "春日井市",
      municipality_display_name: "春日井",
      sort_order: 10,
      source: "setting",
    },
  );
});

test("自治体設定にない政令市は住所から市名を補完する", () => {
  assert.deepEqual(
    resolveJissekiMunicipality("愛知県名古屋市千種区神田町1-2", settings),
    {
      municipality: "名古屋市",
      municipality_display_name: "名古屋",
      sort_order: null,
      source: "address",
    },
  );
});

test("一宮市・北名古屋市なども住所から末尾の市を除いて印字名にする", () => {
  assert.equal(
    inferJissekiMunicipalityFromAddress("愛知県一宮市丹陽町森本")
      ?.municipality_display_name,
    "一宮",
  );
  assert.equal(
    inferJissekiMunicipalityFromAddress("愛知県北名古屋市六ツ師")
      ?.municipality_display_name,
    "北名古屋",
  );
});

test("市が省略された区住所も未設定にせず区名を補完する", () => {
  assert.equal(
    inferJissekiMunicipalityFromAddress("愛知県名東区高針台1丁目")
      ?.municipality_display_name,
    "名東",
  );
});

test("都を含む京都府でも府名だけを正しく除く", () => {
  assert.equal(
    inferJissekiMunicipalityFromAddress("京都府京都市中京区御池通")
      ?.municipality_display_name,
    "京都",
  );
});
