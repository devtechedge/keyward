import type { WebSpendPoint } from "../lib/types";

/**
 * A spend chart drawn as inline SVG.
 *
 * No charting library, so the page ships a few hundred bytes of markup instead
 * of a hundred kilobytes of JavaScript. The anomaly point is marked and the
 * baseline is drawn, because the baseline is the thing a reader needs to judge
 * whether a spike matters.
 */
export function SpendChart({
  points,
  anomalies,
  height = 220,
}: {
  points: readonly WebSpendPoint[];
  anomalies?: readonly { detectedAt: string }[];
  height?: number;
}) {
  if (points.length < 2) {
    return <div className="empty">Not enough spend history yet.</div>;
  }

  const width = 720;
  const padding = { top: 16, right: 12, bottom: 24, left: 44 };
  const innerW = width - padding.left - padding.right;
  const innerH = height - padding.top - padding.bottom;

  const values = points.map((p) => p.usd);
  const max = Math.max(...values) * 1.12;
  const min = 0;

  const x = (i: number): number =>
    padding.left + (i / (points.length - 1)) * innerW;
  const y = (v: number): number =>
    padding.top + innerH - ((v - min) / (max - min || 1)) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.usd).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${(padding.top + innerH).toFixed(1)} L${padding.left},${(padding.top + innerH).toFixed(1)} Z`;

  const anomalyTimes = new Set((anomalies ?? []).map((a) => a.detectedAt.slice(0, 10)));
  const baseline = median(values.slice(0, -1));
  const gridLines = [0, 0.25, 0.5, 0.75, 1];

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Spend over the last ${points.length} days, peaking at ${Math.round(Math.max(...values))} US dollars`}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(74,222,128,0.24)" />
          <stop offset="100%" stopColor="rgba(74,222,128,0)" />
        </linearGradient>
      </defs>

      {gridLines.map((g) => {
        const gy = padding.top + innerH - g * innerH;
        return (
          <g key={g}>
            <line className="chart-grid" x1={padding.left} y1={gy} x2={width - padding.right} y2={gy} />
            <text className="chart-axis" x={padding.left - 8} y={gy + 3.5} textAnchor="end">
              {Math.round(max * g)}
            </text>
          </g>
        );
      })}

      {baseline > 0 ? (
        <line
          className="chart-baseline"
          x1={padding.left}
          y1={y(baseline)}
          x2={width - padding.right}
          y2={y(baseline)}
        />
      ) : null}

      <path className="chart-area" d={area} />
      <path className="chart-line" d={line} />

      {points.map((p, i) =>
        anomalyTimes.has(p.at.slice(0, 10)) ? (
          <circle key={p.at} className="chart-anomaly" cx={x(i)} cy={y(p.usd)} r={4.5} />
        ) : null,
      )}

      <circle
        className="chart-dot"
        cx={x(points.length - 1)}
        cy={y(points[points.length - 1]!.usd)}
        r={3.5}
      />

      <text className="chart-axis" x={padding.left} y={height - 6}>
        {points[0]!.at.slice(0, 10)}
      </text>
      <text className="chart-axis" x={width - padding.right} y={height - 6} textAnchor="end">
        {points[points.length - 1]!.at.slice(0, 10)}
      </text>
    </svg>
  );
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}
