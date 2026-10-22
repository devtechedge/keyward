import { test } from "node:test";
import assert from "node:assert/strict";
import { detectAnomalies, median } from "../dist/anomaly.js";
import type { SpendSummary } from "../dist/types.js";

function summary(points: number[]): SpendSummary {
  return {
    provider: "openai",
    currency: "USD",
    totalUsd: points.reduce((a, b) => a + b, 0),
    points: points.map((spendUsd, i) => ({
      at: new Date(Date.UTC(2026, 0, i + 1)).toISOString(),
      spendUsd,
      inputTokens: 0,
      outputTokens: 0,
      requests: 0,
    })),
  };
}

test("median ignores one large outlier", () => {
  assert.equal(median([10, 10, 10, 10, 1000]), 10);
  assert.equal(median([10, 20, 30]), 20);
  assert.equal(median([]), 0);
});

test("a spike above the factor and floor is reported", () => {
  const result = detectAnomalies(summary([10, 10, 10, 10, 10, 10, 200]), {
    baselineDays: 5,
    spikeFactor: 2.5,
    floorUsd: 10,
  });
  assert.equal(result.anomalies.length, 1);
  assert.equal(result.anomalies[0]?.severity, "critical");
  assert.ok((result.anomalies[0]?.ratio ?? 0) > 15);
});

test("a spike below the floor is ignored", () => {
  const result = detectAnomalies(summary([1, 1, 1, 1, 1, 1, 5]), {
    baselineDays: 5,
    spikeFactor: 2.5,
    floorUsd: 10,
  });
  assert.equal(result.anomalies.length, 0);
});

test("a collapse in spend is reported", () => {
  const result = detectAnomalies(summary([100, 100, 100, 100, 100, 100, 0]), {
    baselineDays: 5,
    floorUsd: 10,
  });
  assert.equal(result.anomalies.length, 1);
  assert.match(result.anomalies[0]?.summary ?? "", /stopped being used/);
});

test("a flat series produces no anomalies", () => {
  const result = detectAnomalies(summary([50, 50, 50, 50, 50, 50, 50]), {
    baselineDays: 5,
    floorUsd: 10,
  });
  assert.equal(result.anomalies.length, 0);
});
