export interface Column {
    name: string;
    type: string;
    isPK?: boolean;
    isFK?: boolean;
    fkReference?: string;  
}

export interface ForeignKey {
    foreignKey: string;
    referenceTable: string;
}

export interface Table {
    tableName: string;
    column: Column[];
    foreignKey: ForeignKey[];
    level?: number;          
    primaryKeyName?: string; 
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
    label: string;          
    sourceColumn: string;
    targetColumn: string;
    targetTable: string;
    sourceTable: string;
    pathData: string;       
    labelX: number;
    labelY: number;
}

export interface SqlBlock {
  header: string;  
  body: string[];   
}
