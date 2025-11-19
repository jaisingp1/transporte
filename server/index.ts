import express from 'express';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import ExcelJS from 'exceljs';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

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
const ai = new GoogleGenAI(process.env.GEMINI_API_KEY || "");

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

const excelDateToJSDate = (excelValue: any): string | null => {
  if (!excelValue) {
    return null;
  }

  // Log the type and value for debugging
  console.log(`[DATE PARSING] Input: "${excelValue}", Type: ${typeof excelValue}`);

  // Case 1: Value is already a JavaScript Date object
  if (excelValue instanceof Date) {
    // Check if the date is valid
    if (!isNaN(excelValue.getTime())) {
      const iso = excelValue.toISOString();
      const formatted = iso.split('T')[0];
      console.log(`[DATE PARSING] Output (from Date object): "${formatted}"`);
      return formatted;
    }
    console.warn(`[DATE PARSING] Invalid Date object received.`);
    return null;
  }

  // Case 2: Value is a string
  if (typeof excelValue === 'string') {
    const trimmed = excelValue.trim();
    if (trimmed.toLowerCase().includes('confirmar')) {
      console.log(`[DATE PARSING] Output (from string 'confirmar'): null`);
      return null;
    }

    // Attempt to parse various string formats, like mm/dd/yyyy
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      // It's a valid date string that the Date constructor could parse
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const formatted = `${year}-${month}-${day}`;
      console.log(`[DATE PARSING] Output (from string): "${formatted}"`);
      return formatted;
    }
  }

  // Case 3: Value is a number (Excel Serial Date)
  if (typeof excelValue === 'number') {
    if (excelValue < 35000) { // Approx check for dates after the year 2000
        console.log(`[DATE PARSING] Output (from number < 35000): null`);
        return null;
    }
    try {
      // Convert Excel serial date to JS date
      const date = new Date(Math.round((excelValue - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        const iso = date.toISOString();
        const formatted = iso.split('T')[0];
        console.log(`[DATE PARSING] Output (from number): "${formatted}"`);
        return formatted;
      }
    } catch (e) {
      console.error(`[DATE PARSING] Error converting Excel number to date:`, e);
      return null;
    }
  }
  
  console.warn(`[DATE PARSING] Could not parse value. Returning null.`);
  return null;
};

// --- Routes ---

// 1. Admin Upload
app.post('/api/admin/upload', upload.single('file'), async (req, res) => {

  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;

  console.log(`[${new Date().toISOString()}] --- ADMIN UPLOAD START ---`);
  console.log(`[${new Date().toISOString()}] Received file: ${req.file.originalname}`);
  console.log(`[${new Date().toISOString()}] Saved temporary file to: ${filePath}`);

  try {
    console.log(`[${new Date().toISOString()}] Reading Excel file with exceljs...`);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];
    console.log(`[${new Date().toISOString()}] Successfully read worksheet: "${worksheet.name}" with ${worksheet.rowCount} rows.`);


    if (worksheet.rowCount < 2) {
      console.warn(`[${new Date().toISOString()}] File has less than 2 rows. Aborting.`);
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
    console.log(`[${new Date().toISOString()}] Parsed ${rowsToInsert.length} rows from Excel.`);

    db.serialize(() => {
      console.log(`[${new Date().toISOString()}] Starting database transaction...`);
      db.run("BEGIN TRANSACTION");

      console.log(`[${new Date().toISOString()}] Clearing existing data from 'machines' table.`);
      db.run("DELETE FROM machines");
      db.run("DELETE FROM sqlite_sequence WHERE name='machines'");

      const stmt = db.prepare(`INSERT INTO machines (customs, reference, machine, pn, etd, eta_port, eta_epiroc, ship, division, status, bl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
      
      console.log(`[${new Date().toISOString()}] Inserting new rows...`);
      rowsToInsert.forEach((row, index) => {
        stmt.run(row, (err) => {
          if (err) {
            console.error(`[${new Date().toISOString()}] Error inserting row ${index + 1}:`, err);
          }
        });
      });
      
      stmt.finalize((err) => {
        if (err) {
          db.run("ROLLBACK");
          console.error("Error finalizing statement:", err);
          res.status(500).json({ error: 'Database insert failed.' });
          return;
        }
        console.log(`[${new Date().toISOString()}] Finalizing statement and committing transaction...`);
        db.run("COMMIT", (commitErr) => {
          if (commitErr) {
            console.error(`[${new Date().toISOString()}] Error committing transaction:`, commitErr);
            res.status(500).json({ error: 'Database commit failed.' });
            return;
          }
          console.log(`[${new Date().toISOString()}] Transaction committed successfully. Inserted ${rowsToInsert.length} rows.`);
          res.json({ success: true, rows: rowsToInsert.length });
          console.log(`[${new Date().toISOString()}] --- ADMIN UPLOAD END ---`);
        });
      });
    });

  } catch (err) {
    console.error(`[${new Date().toISOString()}] File Processing Error:`, err);
    res.status(500).json({ error: 'Failed to process Excel file: ' + (err as Error).message });
    console.log(`[${new Date().toISOString()}] --- ADMIN UPLOAD END (WITH ERROR) ---`);
  } finally {
    try {
      fs.unlinkSync(filePath);
      console.log(`[${new Date().toISOString()}] Cleaned up temporary file: ${filePath}`);
    } catch (e) {
      console.error(`[${new Date().toISOString()}] Error deleting temp file:`, e);
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
      contents: [{ parts: [{ text: sqlPrompt }] }],
    });
    
    let sql = sqlResponse.response.text().trim();
    
    // Strip markdown block if present
    sql = sql.replace(/```sql/g, '').replace(/```/g, '').trim();
    console.log(`[AI] Generated SQL: ${sql}`);

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
            contents: [{ parts: [{ text: contextPrompt }] }],
        });
        directAnswer = explanationResponse.response.text();
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
