export interface Machine {
  id: number;
  customs: string | null;
  reference: string | null;
  machine: string;
  pn: string | null;
  etd: string | null;
  eta_port: string | null;
  eta_epiroc: string | null;
  ship: string | null;
  division: string | null;
  status: string | null;
  bl: string | null;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  isError?: boolean;
}

export interface QueryResponse {
  data: Machine[];
  sql: string;
  explanation?: string;
  directAnswer?: string;
}

// Strict mapping for Excel column indices (0-based)
export enum ExcelColumn {
  CUSTOMS = 0,   // A
  REFERENCE = 1, // B
  MACHINE = 2,   // C
  PN = 3,        // D
  ETD = 4,       // E
  ETA_PORT = 5,  // F
  ETA_EPIROC = 6,// G
  SHIP = 7,      // H
  DIVISION = 8,  // I
  STATUS = 9,    // J
  BL = 10        // K
}