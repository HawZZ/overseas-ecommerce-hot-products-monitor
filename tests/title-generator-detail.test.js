import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDetail, validateDetail } from "../server/title-generator/rules.js";

const facts = {
  productName: "行李箱套",
  category: "箱包配件",
  description: "適用多數行李箱，收納方便",
  specifications: "PET材質",
  material: "PET",
  use: "防刮蹭",
  brand: "",
  authorization: "compatible-third-party",
  sellingPoints: "輕便、易收納"
};

function detail(overrides = {}) {
  return normalizeDetail({
    summary: { text: "適合日常旅行使用的行李箱套。", evidence: ["productName", "use"] },
    sections: [
      { key: "features", items: [{ text: "輕便好收納。", evidence: ["sellingPoints"] }] },
      { key: "specifications", items: [{ text: "PET材質。", evidence: ["material", "specifications"] }] },
      ...(overrides.sections || [])
    ],
    ...overrides
  });
}

test("detail passes with confirmed facts and complete compatibility wording", () => {
  const result = validateDetail(detail({ summary: { text: "適用多數行李箱的輕便箱套。", evidence: ["productName", "description"] } }), facts, "standard");
  assert.equal(result.status, "pass");
  assert.match(result.plainText, /商品介紹/u);
});

test("detail flags medical claims and incomplete compatibility", () => {
  const result = validateDetail(detail({ summary: { text: "治療刮痕的行李箱套。", evidence: ["productName"] } }), facts, "standard");
  assert.equal(result.status, "needs-review");
  assert.ok(result.issues.some((issue) => issue.includes("醫療療效")));
  assert.ok(result.issues.some((issue) => issue.includes("相容商品")));
});

test("detail omits unsupported packaging and flags unsupported evidence", () => {
  const result = validateDetail(detail({ sections: [{ key: "packageContents", items: [{ text: "內含兩個配件。", evidence: ["description"] }] }] }), facts, "standard");
  assert.equal(result.status, "needs-review");
  assert.ok(result.issues.some((issue) => issue.includes("包裝內容")));
});

test("detail normalizes Chinese and flags unconfirmed brand", () => {
  const brandedFacts = { ...facts, brand: "ACME", authorization: "unbranded" };
  const result = validateDetail(detail({ summary: { text: "简体商品介紹 ACME", evidence: ["productName"] } }), brandedFacts, "standard");
  assert.equal(result.status, "needs-review");
  assert.ok(result.issues.some((issue) => issue.includes("未確認品牌")));
  assert.match(result.plainText, /簡體/u);
});
