export interface Column {
    name: string;
    type: string;
    isPK?: boolean;
    isFK?: boolean;
    fkReference?: string;   // \"targetTable.column\" - only if isFK
}

export interface ForeignKey {
    foreignKey: string;
    referenceTable: string;
}

export interface Table {
    tableName: string;
    column: Column[];
    foreignKey: ForeignKey[];
    level?: number;          // hierarchy level (0 = root)
    primaryKeyName?: string; // primary key column name (added by enrichTables)
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
    label: string;          // \"orders.user_id → users.id\"
    sourceColumn: string;
    targetColumn: string;
    targetTable: string;
    sourceTable: string;
    pathData: string;       // SVG path \"d\" attribute (orthogonal route)
    labelX: number;
    labelY: number;
}

export interface SqlBlock {
  header: string;  
  body: string[];   
}
