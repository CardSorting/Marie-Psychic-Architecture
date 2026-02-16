
export type ContentType = "NOVEL" | "SHORT_STORY" | "ARTICLE" | "OP_ED";

export type ContentStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";

export type ProductionPass = "CONCEPT" | "OUTLINE" | "DRAFT" | "REVIEW" | "POLISH" | "FINAL" | string;

export interface ContentLedgerEntry {
    pass: ProductionPass;
    summary: string;
    filesLocked: string[];
    timestamp: string;
}

export interface ContentUnit {
    id: string; // specialized ID (e.g. "Chapter 1", "Section 2")
    title: string;
    description: string;
    type: ContentType;
    currentPass: ProductionPass;
    completedPasses: ProductionPass[];
    continuityLedger: ContentLedgerEntry[];
    files: string[];
    metadata?: Record<string, any>;
}

export interface ProjectStructure {
    id: string;
    title: string;
    type: ContentType;
    units: ContentUnit[];
    status: ContentStatus;
    lastUpdated: string;
}
