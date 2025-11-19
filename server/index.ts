import express from 'express';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import ExcelJS from 'exceljs';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Configuration ---
const PORT = 3000;
const DB_PATH = path.join(__dirname, '../machines.db');
// Use absolute path for uploads to ensure reliability
const UPLOAD_DIR = path.resolve(__dirname, 'uploads');

// Ensure upload directory exists immediately
if (!fs.existsSync(UPLOAD_DIR)){
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// --- Database Setup ---
const db = new sqlite3.Database(DB_PATH);

const initDB = () => {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS machines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customs TEXT,
      reference TEXT,
      machine TEXT NOT NULL,
      pn TEXT,
      etd TEXT,
      eta_port TEXT,
      eta_epiroc TEXT,
      ship TEXT,
      division TEXT,
      status TEXT,
      bl TEXT
    )`);
  });
};

initDB();

// --- Express Setup ---
const app = express();
app.use(cors());
app.use(express.json());

// Upload storage configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR)
  },
  filename: function (req, file, cb) {
    // sanitize filename
    const safeName = file.originalname.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
    cb(null, Date.now() + '-' + safeName);
  }
});
const upload = multer({ storage: storage });

// --- Gemini Client ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- Instructions for AI ---
const SQL_INSTRUCTIONS = `
You are a SQLite expert for a logistics tracking table named 'machines'.
Schema:
id (INT), customs (TEXT), reference (TEXT), machine (TEXT), pn (TEXT), etd (TEXT YYYY-MM-DD), eta_port (TEXT YYYY-MM-DD), eta_epiroc (TEXT YYYY-MM-DD), ship (TEXT), division (TEXT), status (TEXT), bl (TEXT).

Rules:
1. Return ONLY a raw SQL SELECT string. No Markdown formatting, no \`\`\`.
2. Case insensitive comparisons (e.g. uses LIKE %...%).
3. Never use UPDATE, DELETE, INSERT, DROP.
4. If asking for specific machine name, search in 'machine' column.
5. If asking for location/status, use 'status' or 'customs'.
6. 'pn' is Part Number.
`;

// --- Helper Functions ---

const excelDateToJSDate = (serial: any): string | null => {
  if (!serial) return null;
  
  // Handle string dates
  if (typeof serial === 'string') {
      const trimmed = serial.trim();
      // Strict requirement: "Por confirmar" -> NULL
      if (trimmed.toLowerCase().includes('confirmar')) {
        return null;
      }

      // Try to parse mm/dd/yyyy to YYYY-MM-DD
      const datePattern = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
      const match = trimmed.match(datePattern);
      
      if (match) {
          const month = match[1].padStart(2, '0');
          const day = match[2].padStart(2, '0');
          const year = match[3];
          return `${year}-${month}-${day}`;
      }
      return null;
  }
  
  // Handle Excel Serial Date
  if (typeof serial === 'number') {
    try {
      // Excel epoch starts Dec 30 1899
      // Approx check for valid date range (> year 2000) to avoid garbage numbers
      if (serial < 35000) return null; 

      const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
      const iso = date.toISOString(); 
      return iso.split('T')[0];
    } catch (e) {
      return null;
    }
  }
  
  return null;
};

// --- Routes ---

// 1. Admin Upload
app.post('/api/admin/upload', upload.single('file'), async (req, res) => {
  const token = req.headers['x-admin-token'];
  
  if (!token) {
    return res.status(403).json({ error: 'Unauthorized: Token missing' });
  }

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];

    if (worksheet.rowCount < 2) {
      throw new Error("Excel file is empty or missing data rows.");
    }

    const rowsToInsert: any[] = [];
    // Skip header row (index 1), start from 2
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const rowData = [
        row.getCell(1).value, // customs
        row.getCell(2).value, // reference
        row.getCell(3).value || 'Unknown Machine', // machine
        row.getCell(4).value, // pn
        excelDateToJSDate(row.getCell(5).value), // etd
        excelDateToJSDate(row.getCell(6).value), // eta_port
        excelDateToJSDate(row.getCell(7).value), // eta_epiroc
        row.getCell(8).value, // ship
        row.getCell(9).value, // division
        row.getCell(10).value, // status
        row.getCell(11).value  // bl
      ];
      // Ensure null for empty cells
      rowsToInsert.push(rowData.map(cell => cell === undefined ? null : cell));
    }

    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      db.run("DELETE FROM machines");
      db.run("DELETE FROM sqlite_sequence WHERE name='machines'");

      const stmt = db.prepare(`INSERT INTO machines (customs, reference, machine, pn, etd, eta_port, eta_epiroc, ship, division, status, bl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      rowsToInsert.forEach(row => {
        stmt.run(row);
      });
      
      stmt.finalize((err) => {
        if (err) {
          db.run("ROLLBACK");
          console.error("Error finalizing statement:", err);
          res.status(500).json({ error: 'Database insert failed.' });
          return;
        }
        db.run("COMMIT", (commitErr) => {
          if (commitErr) {
            console.error("Error committing transaction:", commitErr);
            res.status(500).json({ error: 'Database commit failed.' });
            return;
          }
          res.json({ success: true, rows: rowsToInsert.length });
        });
      });
    });

  } catch (err) {
    console.error("File Processing Error:", err);
    res.status(500).json({ error: 'Failed to process Excel file: ' + (err as Error).message });
  } finally {
    // Cleanup the uploaded file
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.error("Error deleting temp file", e);
    }
  }
});

// 2. Query Endpoint
app.post('/api/query', async (req, res) => {
  const { question, lang } = req.body;

  if (!question) return res.status(400).json({ error: 'Question required' });

  try {
    // Step 1: Generate SQL using Gemini
    const sqlPrompt = `${SQL_INSTRUCTIONS}\nQuestion: "${question}"\nSQL:`;
    
    const sqlResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: sqlPrompt,
    });
    
    let sql = sqlResponse.text.trim();
    
    // Strip markdown block if present
    sql = sql.replace(/```sql/g, '').replace(/```/g, '').trim();

    // Validate SQL
    if (!sql.toLowerCase().startsWith('select')) {
      throw new Error('AI generated potentially unsafe SQL');
    }

    // Execute SQL
    db.all(sql, [], async (err, rows) => {
      if (err) {
        console.error("SQL Error", err);
        return res.status(500).json({ error: 'Database error' });
      }

      // Step 2: Generate Explanations if needed
      let directAnswer = null;
      
      if (rows.length > 0 && rows.length < 5) {
        const contextPrompt = `
        Data: ${JSON.stringify(rows)}
        User Question: "${question}"
        Language: ${lang}
        
        Task: Answer the user's question naturally based ONLY on the data provided. Be concise.
        `;
        
        const explanationResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: contextPrompt,
        });
        directAnswer = explanationResponse.text;
      }

      res.json({
        data: rows,
        sql: sql,
        directAnswer: directAnswer
      });
    });

  } catch (error) {
    console.error("Gemini Error", error);
    res.status(500).json({ error: 'AI processing failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});