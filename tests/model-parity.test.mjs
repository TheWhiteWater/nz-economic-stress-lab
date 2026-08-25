import assert from "node:assert/strict";
import fixtures from "../engine/fixtures/golden.v0.json" with { type: "json" };
import assumptions from "../engine/data/assumptions.v0.json" with { type: "json" };
import { runAssumptionStress } from "../lib/economic-model-core.mjs";
import test from "node:test";

const tolerance = 0.01;

function assertClose(actual, expected, path) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${path}: expected ${expected}, got ${actual}`,
  );
}

function assertRecursiveParity(actual, expected, path = "$") {
  if (typeof expected === "number") {
    assert.equal(typeof actual, "number", `${path}: expected number, got ${typeof actual}`);
    assertClose(actual, expected, path);
    return;
  }

  if (expected === null || typeof expected !== "object") {
    assert.deepEqual(actual, expected, path);
    return;
  }

  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), `${path}: expected array`);
    assert.equal(actual.length, expected.length, `${path}: array length`);
    for (let index = 0; index < expected.length; index += 1) {
      assertRecursiveParity(actual[index], expected[index], `${path}[${index}]`);
    }
    return;
  }

  assert.equal(typeof actual, "object", `${path}: expected object`);
  assert.deepEqual(
    Object.keys(actual).sort(),
    Object.keys(expected).sort(),
    `${path}: object keys`,
  );
  for (const key of Object.keys(expected)) {
    assertRecursiveParity(actual[key], expected[key], `${path}.${key}`);
  }
}

test("TypeScript runtime model matches Python golden fixtures", () => {
  for (const fixtureCase of fixtures.cases) {
    const actual = runAssumptionStress(
      assumptions,
      fixtureCase.scenario,
      fixtureCase.design,
    );
    const expected = fixtureCase.result;
    const label = `${fixtureCase.scenario}/${fixtureCase.design}`;

    assertRecursiveParity(actual, expected, label);
  }
});
