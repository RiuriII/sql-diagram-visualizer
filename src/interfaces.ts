export interface Column {
    name: string;
    type: string;
}

export interface ForeignKey {
    foreignKey: string;
    referenceTable: string;
}

export interface Table {
    tableName: string;
    column: Column[];
    foreignKey: ForeignKey[];
}

export interface SvgTable {
    tableName: string;
    tableMarkup: string;
    posX: number;
    posY: number;
    tableWidth: number;
    tableHeight: number;
    columns: Column[];
    foreignKey: ForeignKey[];
}

export interface Connection {
    sourcePosX: number;
    sourcePosY: number;
    targetPosX: number;
    targetPosY: number;
    color: string;
}
