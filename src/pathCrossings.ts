/**
 * Geometric crossing detection and "arc jump" rendering for relationship
 * lines.
 *
 * When two relationship paths cross visually, this module detects the
 * exact intersection point and rewrites the path of one of the two lines
 * so it hops over the other with a small semicircular arc at that point —
 * the same convention used in electrical schematics to signal "these two
 * wires cross but do not connect".
 *
 * Scope (phase 1): only different-level (H-V-H elbow) connections are
 * considered. Same-level connections (routed as a U-shape beneath both
 * tables — see svgGenerator.ts's buildPath) are excluded for now: they
 * would require decomposing a 5-segment path instead of 3, deferred
 * rather than guessed at. This is a real, exercised path shape (self-
 * referencing foreign keys route through it), not dead code — it just
 * doesn't get arc-jump treatment yet.
 */

/** A single straight line segment. */
export interface Segment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

/**
 * The three logical segments of an H-V-H elbow connection, in the exact
 * order they are drawn: source → mid (horizontal), mid → mid (vertical),
 * mid → target (horizontal). Corner rounding is intentionally ignored
 * here — it never changes whether two lines geometrically cross, only how
 * the joint between segments looks.
 */
export interface ElbowConnection {
    /** Index into the caller's connections array — used to assign hops. */
    index: number;
    segments: [Segment, Segment, Segment];
}

/** A single arc-jump to render on one segment of one connection. */
export interface Hop {
    /** Which of the 3 logical segments (0, 1, or 2) the hop belongs to. */
    segmentIndex: 0 | 1 | 2;
    /** Distance from the segment's start point, in px. */
    distanceFromStart: number;
}

/**
 * True intersection test between two line segments (strict interior
 * crossing — segments that only touch at an endpoint, or that are
 * parallel/collinear, are NOT considered crossings). Returns the
 * intersection point, or null if the segments don't cross.
 *
 * Standard parametric line-intersection: each segment is written as
 * `start + param * delta` for `param` in [0, 1]; solving for where the
 * two parametric lines meet gives `paramOnA` / `paramOnB`, the fractional
 * position along each segment where that meeting point falls.
 */
const intersect = (segmentA: Segment, segmentB: Segment): { x: number; y: number } | null => {
    const deltaXA = segmentA.x2 - segmentA.x1;
    const deltaYA = segmentA.y2 - segmentA.y1;
    const deltaXB = segmentB.x2 - segmentB.x1;
    const deltaYB = segmentB.y2 - segmentB.y1;

    const denominator = deltaXA * deltaYB - deltaYA * deltaXB;
    if (denominator === 0) return null; // parallel or collinear — not a crossing

    const startDeltaX = segmentB.x1 - segmentA.x1;
    const startDeltaY = segmentB.y1 - segmentA.y1;

    const paramOnA = (startDeltaX * deltaYB - startDeltaY * deltaXB) / denominator;
    const paramOnB = (startDeltaX * deltaYA - startDeltaY * deltaXA) / denominator;

    // Strict interior intersection: excludes touching exactly at an
    // endpoint (paramOnA/paramOnB === 0 or 1), which is a legitimate
    // shared table edge, not a crossing that needs a hop.
    if (paramOnA <= 0 || paramOnA >= 1 || paramOnB <= 0 || paramOnB >= 1) return null;

    return { x: segmentA.x1 + paramOnA * deltaXA, y: segmentA.y1 + paramOnA * deltaYA };
};

/**
 * Detects every crossing between distinct connections' elbow segments and
 * assigns exactly one hop per crossing to the connection that appears
 * later in `elbows` (a simple, deterministic tie-break — later-drawn line
 * hops over the earlier one). A connection never hops over itself; only
 * cross-connection crossings are considered.
 *
 * Hops that land very close together on the same segment (closer than
 * `minHopGap`) are merged into one, so a cluster of near-simultaneous
 * crossings doesn't produce visually overlapping arcs.
 *
 * @returns A map of connection index → hops to render on that connection's path.
 */
export const detectHops = (
    elbows: ElbowConnection[],
    minHopGap: number
): Map<number, Hop[]> => {
    const hopsByConnection = new Map<number, Hop[]>();

    const addHop = (connectionIndex: number, hop: Hop) => {
        if (!hopsByConnection.has(connectionIndex)) hopsByConnection.set(connectionIndex, []);
        hopsByConnection.get(connectionIndex)!.push(hop);
    };

    for (let earlierIndex = 0; earlierIndex < elbows.length; earlierIndex++) {
        for (let laterIndex = earlierIndex + 1; laterIndex < elbows.length; laterIndex++) {
            const earlierConnection = elbows[earlierIndex];
            const laterConnection = elbows[laterIndex];

            for (let segmentIndexA = 0; segmentIndexA < 3; segmentIndexA++) {
                for (let segmentIndexB = 0; segmentIndexB < 3; segmentIndexB++) {
                    const crossingPoint = intersect(
                        earlierConnection.segments[segmentIndexA],
                        laterConnection.segments[segmentIndexB]
                    );
                    if (!crossingPoint) continue;

                    // The later connection (by array position) hops over the earlier one.
                    const hopSegment = laterConnection.segments[segmentIndexB];
                    const distanceFromStart = Math.hypot(
                        crossingPoint.x - hopSegment.x1,
                        crossingPoint.y - hopSegment.y1
                    );

                    addHop(laterConnection.index, {
                        segmentIndex: segmentIndexB as 0 | 1 | 2,
                        distanceFromStart,
                    });
                }
            }
        }
    }

    // Merge hops that land too close together on the same segment.
    for (const [connectionIndex, hopsForConnection] of hopsByConnection) {
        const hopsBySegment = new Map<number, Hop[]>();
        for (const hop of hopsForConnection) {
            if (!hopsBySegment.has(hop.segmentIndex)) hopsBySegment.set(hop.segmentIndex, []);
            hopsBySegment.get(hop.segmentIndex)!.push(hop);
        }

        const mergedHops: Hop[] = [];
        for (const [segmentIndex, hopsOnThisSegment] of hopsBySegment) {
            hopsOnThisSegment.sort((hopA, hopB) => hopA.distanceFromStart - hopB.distanceFromStart);
            for (const hop of hopsOnThisSegment) {
                const previousHop = mergedHops[mergedHops.length - 1];
                if (
                    previousHop &&
                    previousHop.segmentIndex === segmentIndex &&
                    hop.distanceFromStart - previousHop.distanceFromStart < minHopGap
                ) {
                    continue; // close enough to the previous hop — skip the duplicate
                }
                mergedHops.push(hop);
            }
        }
        hopsByConnection.set(connectionIndex, mergedHops);
    }

    return hopsByConnection;
};

/**
 * Renders a single straight segment as SVG path commands, carving a small
 * semicircular "jump" arc at each requested hop position so the line
 * visually hops over whatever it crosses there.
 *
 * `startInset` / `endInset` reserve space at each end of the segment for
 * corner rounding performed by the caller (see svgGenerator.ts's
 * buildPath) — hop positions are clamped to stay clear of that reserved
 * zone so an arc never collides with a rounded joint.
 *
 * Assumes the path cursor is already positioned at (x1, y1) — this
 * function only emits the commands to reach (x2, y2), it does not emit
 * an initial `M`.
 */
export const renderSegmentWithHops = (
    x1: number, y1: number, x2: number, y2: number,
    hops: Hop[],
    hopRadius: number,
    segmentIndex: 0 | 1 | 2,
    startInset: number,
    endInset: number
): string => {
    const deltaX = x2 - x1;
    const deltaY = y2 - y1;
    const segmentLength = Math.hypot(deltaX, deltaY);
    if (segmentLength === 0) return "";

    const unitX = deltaX / segmentLength;
    const unitY = deltaY / segmentLength;

    // Hops belonging to a different segment are irrelevant here. Each
    // remaining hop's distance is clamped away from both insets so the
    // arc never intrudes into the zone reserved for corner rounding.
    const clampedHopDistances = hops
        .filter(hop => hop.segmentIndex === segmentIndex)
        .map(hop => Math.max(
            startInset + hopRadius,
            Math.min(segmentLength - endInset - hopRadius, hop.distanceFromStart)
        ))
        .sort((distanceA, distanceB) => distanceA - distanceB);

    let pathData = "";
    let distanceCoveredSoFar = 0;

    for (const hopDistance of clampedHopDistances) {
        const arcStartDistance = hopDistance - hopRadius;
        const arcEndDistance = hopDistance + hopRadius;
        if (arcStartDistance < distanceCoveredSoFar) continue; // overlaps the previous hop — skip

        const arcStart = { x: x1 + unitX * arcStartDistance, y: y1 + unitY * arcStartDistance };
        const arcEnd = { x: x1 + unitX * arcEndDistance, y: y1 + unitY * arcEndDistance };

        pathData += ` L ${arcStart.x} ${arcStart.y}`;
        pathData += ` A ${hopRadius} ${hopRadius} 0 0 1 ${arcEnd.x} ${arcEnd.y}`;
        distanceCoveredSoFar = arcEndDistance;
    }

    const drawEndDistance = segmentLength - endInset;
    const drawEnd = { x: x1 + unitX * drawEndDistance, y: y1 + unitY * drawEndDistance };
    pathData += ` L ${drawEnd.x} ${drawEnd.y}`;
    return pathData;
};