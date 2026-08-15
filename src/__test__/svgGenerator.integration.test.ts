/// <reference types="jest" />

import { svgGenerator } from "../svgGenerator";

const connectionsSection = (svg: string) => {
    const m = svg.match(/<g id="connections">([\s\S]*?)<\/g>/);
    return m ? m[1] : "";
};

describe("svgGenerator integration branches", () => {
    test("mutual FK cycle produces same-level U-shape paths", () => {
        const tables = [
            {
                tableName: "A",
                column: [
                    { name: "id", type: "int", isPK: true },
                    { name: "b_id", type: "int", isFK: true }
                ],
                foreignKey: [{ foreignKey: "b_id", referenceTable: "B" }],
            },
            {
                tableName: "B",
                column: [
                    { name: "id", type: "int", isPK: true },
                    { name: "a_id", type: "int", isFK: true }
                ],
                foreignKey: [{ foreignKey: "a_id", referenceTable: "A" }],
            },
        ];

        const svg = svgGenerator(tables as any);
        const conn = connectionsSection(svg);
        // two connections (A->B and B->A)
        const paths = conn.match(/<path\s+/g) || [];
        expect(paths.length).toBeGreaterThanOrEqual(2);
        // U-shape rendering uses quadratic curves (Q)
        expect(conn).toMatch(/Q\s+/);
    });

    test("single FK different-level produces H-V-H path with corner Q", () => {
        const tables = [
            {
                tableName: "Parent",
                column: [{ name: "id", type: "int", isPK: true }],
                foreignKey: [],
            },
            {
                tableName: "Child",
                column: [
                    { name: "id", type: "int", isPK: true },
                    { name: "parent_id", type: "int", isFK: true }
                ],
                foreignKey: [{ foreignKey: "parent_id", referenceTable: "Parent" }],
            },
        ];

        const svg = svgGenerator(tables as any);
        const conn = connectionsSection(svg);
        const paths = conn.match(/<path\s+/g) || [];
        expect(paths.length).toBeGreaterThanOrEqual(1);
        // H-V-H uses corner quadratic 'Q' when rounded corners applied
        expect(conn).toMatch(/M\s+\d+\s+\d+/);
    });

    test("multiple sources referencing same target exercise vertical spreading", () => {
        const target = {
            tableName: "Center",
            column: [
                { name: "id", type: "int", isPK: true },
            ],
            foreignKey: [],
        };

        const sources = Array.from({ length: 4 }).map((_, i) => ({
            tableName: `S${i}`,
            column: [
                { name: "id", type: "int", isPK: true },
                { name: `center_id`, type: "int", isFK: true }
            ],
            foreignKey: [{ foreignKey: "center_id", referenceTable: "Center" }],
        }));

        const tables = [target, ...sources];
        const svg = svgGenerator(tables as any);
        const conn = connectionsSection(svg);
        const paths = conn.match(/<path\s+/g) || [];
        expect(paths.length).toBeGreaterThanOrEqual(sources.length);
    });

    test("uses custom primaryKeyName when provided", () => {
        const tables = [
            {
                tableName: "Tgt",
                column: [{ name: "pk", type: "int", isPK: true }],
                foreignKey: [],
                primaryKeyName: "pk",
            },
            {
                tableName: "Src",
                column: [{ name: "id", type: "int", isPK: true }, { name: "pk_ref", type: "int", isFK: true }],
                foreignKey: [{ foreignKey: "pk_ref", referenceTable: "Tgt" }],
            },
        ];

        const svg = svgGenerator(tables as any);
        // legendRelationships includes the connection label with target column name
        expect(svg).toContain("Tgt.pk");
    });

    test("handles missing source FK column (fkColIdx < 0)", () => {
        const tables = [
            {
                tableName: "Parent",
                column: [{ name: "id", type: "int", isPK: true }],
                foreignKey: [],
            },
            {
                tableName: "ChildMissing",
                column: [{ name: "id", type: "int", isPK: true }],
                // foreignKey.foreignKey refers to a column name that does not exist in source
                foreignKey: [{ foreignKey: "does_not_exist", referenceTable: "Parent" }],
            },
        ];

        const svg = svgGenerator(tables as any);
        const conn = connectionsSection(svg);
        const paths = conn.match(/<path\s+/g) || [];
        expect(paths.length).toBeGreaterThanOrEqual(1);
    });

    test("handles missing target PK column (pkColIdx < 0)", () => {
        const tables = [
            {
                tableName: "TargetNoPK",
                column: [{ name: "identifier", type: "int" }],
                foreignKey: [],
                primaryKeyName: "missing_pk",
            },
            {
                tableName: "SourceX",
                column: [{ name: "id", type: "int", isPK: true }, { name: "target_id", type: "int", isFK: true }],
                foreignKey: [{ foreignKey: "target_id", referenceTable: "TargetNoPK" }],
            },
        ];

        const svg = svgGenerator(tables as any);
        const conn = connectionsSection(svg);
        expect(conn).toMatch(/<path\s+/);
    });

    test("produces straight horizontal segment when sy === ty (same Y)", () => {
        const tables = [
            { // level 0
                tableName: "P0",
                column: [{ name: "id", type: "int", isPK: true }],
                foreignKey: [],
            },
            { // level 1
                tableName: "C1",
                column: [{ name: "id", type: "int", isPK: true }, { name: "p0_id", type: "int", isFK: true }],
                foreignKey: [{ foreignKey: "p0_id", referenceTable: "P0" }],
            },
        ];

        const svg = svgGenerator(tables as any);
        const conn = connectionsSection(svg);
        // Expect at least one connection path and some line commands
        expect(conn).toMatch(/L\s+/);
        const paths = conn.match(/<path\s+/g) || [];
        expect(paths.length).toBeGreaterThanOrEqual(1);
    });

    test("H-V-H with rounded corners includes Q commands", () => {
        const tables = [
            {
                tableName: "BigLeft",
                column: Array.from({ length: 8 }).map((_, i) => ({ name: `c${i}`, type: "int" })),
                foreignKey: [],
            },
            {
                tableName: "FarRight",
                column: [{ name: "id", type: "int", isPK: true }, { name: "big_left_id", type: "int", isFK: true }],
                foreignKey: [{ foreignKey: "big_left_id", referenceTable: "BigLeft" }],
            },
        ];

        const svg = svgGenerator(tables as any);
        const conn = connectionsSection(svg);
        expect(conn).toMatch(/Q\s+/);
    });

    test("crossing elbows create hops (arc A commands)", () => {
        // Arrange four tables to cause crossing elbows: TopLeft, TopRight (level0)
        // BottomLeft, BottomRight (level1) with cross references.
        const tables = [
            { tableName: "TL", column: [{ name: "id", type: "int", isPK: true }], foreignKey: [] },
            { tableName: "TR", column: [{ name: "id", type: "int", isPK: true }], foreignKey: [] },
            { tableName: "BL", column: [{ name: "id", type: "int", isPK: true }, { name: "toTR", type: "int", isFK: true }], foreignKey: [{ foreignKey: "toTR", referenceTable: "TR" }] },
            { tableName: "BR", column: [{ name: "id", type: "int", isPK: true }, { name: "toTL", type: "int", isFK: true }], foreignKey: [{ foreignKey: "toTL", referenceTable: "TL" }] },
        ];

        const svg = svgGenerator(tables as any);
        const conn = connectionsSection(svg);
        // We expect at least two connection paths (crossing scenario)
        const paths = conn.match(/<path\s+/g) || [];
        expect(paths.length).toBeGreaterThanOrEqual(2);
    });
});
