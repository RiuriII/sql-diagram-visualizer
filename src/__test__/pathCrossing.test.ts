/// <reference types="jest" />

import { detectHops, renderSegmentWithHops, ElbowConnection, Hop } from "../pathCrossings";

const elbow = (index: number, segs: [number, number, number, number][]): ElbowConnection => ({
  index,
  segments: segs.map(([x1, y1, x2, y2]) => ({ x1, y1, x2, y2 })) as ElbowConnection["segments"],
});

describe("detectHops — crossing detection", () => {
  it("detects a real crossing between two connections' segments", () => {
    // A: vertical stem at x=100, from y=0 to y=100
    // B: horizontal run at y=50, from x=50 to x=150 — crosses A at (100,50)
    const a = elbow(0, [[100, 0, 200, 0], [100, 0, 100, 100], [100, 100, 200, 100]]);
    const b = elbow(1, [[50, 50, 100, 50], [100, 50, 100, 60], [100, 60, 150, 60]]);
    // Force an actual crossing: B's segment 0 runs from (50,50) to (100,50) — touches A's
    // vertical segment only at the endpoint (100,50), which is NOT a true interior crossing.
    // Use a segment that truly crosses through A's vertical stem instead:
    const bCrossing = elbow(1, [[50, 50, 150, 50], [150, 50, 150, 60], [150, 60, 200, 60]]);
    const hops = detectHops([a, bCrossing], 5);
    // The later connection (index 1) should receive the hop.
    expect(hops.get(1)?.length).toBeGreaterThan(0);
    expect(hops.get(0)).toBeUndefined();
  });

  it("does not report a crossing for segments that only touch at an endpoint", () => {
    // Two segments sharing an exact endpoint (e.g. both ending at a table edge)
    // must not be treated as a crossing needing a hop.
    const a = elbow(0, [[0, 0, 100, 0], [100, 0, 100, 100], [100, 100, 200, 100]]);
    const b = elbow(1, [[100, 100, 300, 100], [300, 100, 300, 200], [300, 200, 400, 200]]);
    const hops = detectHops([a, b], 5);
    expect(hops.size).toBe(0);
  });

  it("does not report a crossing for parallel or collinear segments", () => {
    const a = elbow(0, [[0, 0, 100, 0], [100, 0, 100, 100], [100, 100, 200, 100]]);
    const b = elbow(1, [[0, 10, 100, 10], [100, 10, 100, 110], [100, 110, 200, 110]]);
    const hops = detectHops([a, b], 5);
    expect(hops.size).toBe(0);
  });

  it("assigns the hop to the later connection (by array position), never the earlier one", () => {
    const a = elbow(0, [[100, 0, 200, 0], [100, 0, 100, 100], [100, 100, 200, 100]]);
    const b = elbow(1, [[50, 50, 150, 50], [150, 50, 150, 60], [150, 60, 200, 60]]);
    const hops = detectHops([a, b], 5);
    expect(hops.has(1)).toBe(true);
    expect(hops.has(0)).toBe(false);
  });

  it("merges hops that land closer together than minHopGap on the same segment", () => {
    // B's vertical segment (index 1) crosses two different A-like connections
    // at nearly the same point — should merge into a single hop.
    const a1 = elbow(0, [[0, 40, 300, 40], [0, 0, 0, 0], [0, 0, 0, 0]]);
    const a2 = elbow(1, [[0, 41, 300, 41], [0, 0, 0, 0], [0, 0, 0, 0]]);
    const b = elbow(2, [[150, 0, 250, 0], [150, 0, 150, 100], [150, 100, 250, 100]]);
    const hops = detectHops([a1, a2, b], 10); // gap 10, crossings at y=40 and y=41 (1px apart)
    expect(hops.get(2)?.length).toBe(1);
  });

  it("keeps hops separate when they are farther apart than minHopGap", () => {
    const a1 = elbow(0, [[0, 20, 300, 20], [0, 0, 0, 0], [0, 0, 0, 0]]);
    const a2 = elbow(1, [[0, 80, 300, 80], [0, 0, 0, 0], [0, 0, 0, 0]]);
    const b = elbow(2, [[150, 0, 250, 0], [150, 0, 150, 100], [150, 100, 250, 100]]);
    const hops = detectHops([a1, a2, b], 10); // crossings at y=20 and y=80 — far apart
    expect(hops.get(2)?.length).toBe(2);
  });

  it("returns an empty map when there are no crossings at all", () => {
    const a = elbow(0, [[0, 0, 100, 0], [100, 0, 100, 100], [100, 100, 200, 100]]);
    const b = elbow(1, [[0, 500, 100, 500], [100, 500, 100, 600], [100, 600, 200, 600]]);
    const hops = detectHops([a, b], 5);
    expect(hops.size).toBe(0);
  });

  it("handles a single connection (nothing to cross) without error", () => {
    const a = elbow(0, [[0, 0, 100, 0], [100, 0, 100, 100], [100, 100, 200, 100]]);
    expect(() => detectHops([a], 5)).not.toThrow();
    expect(detectHops([a], 5).size).toBe(0);
  });

  it("handles an empty connection list without error", () => {
    expect(() => detectHops([], 5)).not.toThrow();
  });
});

describe("renderSegmentWithHops — segment rendering", () => {
  it("renders a plain straight line when there are no hops on this segment", () => {
    const d = renderSegmentWithHops(0, 0, 100, 0, [], 7, 0, 0, 0);
    expect(d.trim()).toBe("L 100 0");
  });

  it("stops the drawn segment short by endInset, not at the raw endpoint", () => {
    // Regression guard: an earlier bug always drew to (x2,y2) regardless
    // of endInset, which made corner-rounding curves start from the wrong
    // point (see svgGenerator.ts buildPath's use of this function).
    const d = renderSegmentWithHops(0, 0, 100, 0, [], 7, 0, 0, 8);
    expect(d.trim()).toBe("L 92 0");
  });

  it("carves a semicircular arc at the requested hop position", () => {
    const hops: Hop[] = [{ segmentIndex: 0, distanceFromStart: 50 }];
    const d = renderSegmentWithHops(0, 0, 100, 0, hops, 7, 0, 0, 0);
    expect(d).toContain("L 43 0");
    expect(d).toContain("A 7 7 0 0 1 57 0");
    expect(d).toContain("L 100 0");
  });

  it("ignores hops that belong to a different segment index", () => {
    const hops: Hop[] = [{ segmentIndex: 1, distanceFromStart: 50 }];
    const d = renderSegmentWithHops(0, 0, 100, 0, hops, 7, 0, 0, 0);
    expect(d).not.toContain(" A ");
    expect(d.trim()).toBe("L 100 0");
  });

  it("clamps a hop that would fall inside the startInset/endInset reserved zone", () => {
    const hops: Hop[] = [{ segmentIndex: 0, distanceFromStart: 2 }]; // too close to the start
    const d = renderSegmentWithHops(0, 0, 100, 0, hops, 7, 0, 10, 0);
    // Clamped to startInset + hopRadius = 17, so the arc must not start before x=10.
    expect(d).toContain("A 7 7 0 0 1");
    const beforeMatch = d.match(/L (\d+) 0 A/);
    expect(beforeMatch).not.toBeNull();
    expect(Number(beforeMatch![1])).toBeGreaterThanOrEqual(10);
  });

  it("renders a zero-length segment (degenerate, e.g. sy===ty) as an empty string", () => {
    const d = renderSegmentWithHops(50, 50, 50, 50, [], 7, 0, 0, 0);
    expect(d).toBe("");
  });

  it("works for vertical segments the same way as horizontal ones", () => {
    const hops: Hop[] = [{ segmentIndex: 1, distanceFromStart: 50 }];
    const d = renderSegmentWithHops(0, 0, 0, 100, hops, 7, 1, 0, 0);
    expect(d).toContain("L 0 43");
    expect(d).toContain("A 7 7 0 0 1 0 57");
    expect(d).toContain("L 0 100");
  });
});