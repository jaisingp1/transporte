//server/index.ts
import express from 'express';
import multer from 'multer';
import sqlite3 from 'sqlite3';
import ExcelJS from 'exceljs';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

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
      etb DATE,
      eta_port DATE,
      eta_epiroc DATE,
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
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  throw new Error('GEMINI_API_KEY is not set');
}
const genAI = new GoogleGenerativeAI(apiKey);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// --- Instructions for AI ---
const SQL_INSTRUCTIONS = fs.readFileSync(path.join(__dirname, 'sql_instructions.txt'), 'utf-8');

// --- Helper Functions ---

const excelDateToJSDate = (excelValue: any): string | null => {
  if (!excelValue) {
    return null;
  }

  // Case 1: Value is already a JavaScript Date object
  if (excelValue instanceof Date) {
    if (!isNaN(excelValue.getTime())) {
      return excelValue.toISOString().split('T')[0];
    }
    return null;
  }

  // Case 2: Value is a string
  if (typeof excelValue === 'string') {
    const trimmed = excelValue.trim();
    if (trimmed.toLowerCase().includes('confirmar')) {
      return null;
    }
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  // Case 3: Value is a number (Excel Serial Date)
  if (typeof excelValue === 'number') {
    if (excelValue < 35000) { // Approx check for dates after the year 2000
        return null;
    }
    try {
      const date = new Date(Math.round((excelValue - 25569) * 86400 * 1000));
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch (e) {
      console.error(`[DATE PARSING] Error converting Excel number to date:`, e);
      return null;
    }
  }
  
  return null;
};

// --- Routes ---

// 1. Admin Upload
app.post('/api/admin/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const filePath = req.file.path;
  const logPrefix = `[${new Date().toISOString()}]`;
  console.log(`${logPrefix} --- ADMIN UPLOAD START ---`);
  console.log(`${logPrefix} Received file: ${req.file.originalname}`);

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0];

    if (worksheet.rowCount < 2) {
      throw new Error("Excel file is empty or missing data rows.");
    }

    const rowsToInsert = [];
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);

      // Check if all relevant cells are empty to skip the row
      const isRowEmpty = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].every(colNumber => {
        const cell = row.getCell(colNumber);
        // Consider cell empty if it's null, undefined, or just whitespace
        return !cell.value || cell.value.toString().trim() === '';
      });

      if (isRowEmpty) {
        console.log(`${logPrefix} Skipping empty row ${i}.`);
        continue; // Go to the next iteration
      }

      const rowData = [
        row.getCell(1).value, // customs
        row.getCell(2).value, // reference
        row.getCell(3).value || 'Unknown Machine', // machine
        row.getCell(4).value, // pn
        excelDateToJSDate(row.getCell(5).value), // etb
        excelDateToJSDate(row.getCell(6).value), // eta_port
        excelDateToJSDate(row.getCell(7).value), // eta_epiroc
        row.getCell(8).value, // ship
        row.getCell(9).value, // division
        row.getCell(10).value, // status
        row.getCell(11).value  // bl
      ];
      rowsToInsert.push(rowData.map(cell => cell === undefined ? null : cell));
    }
    console.log(`${logPrefix} Parsed ${rowsToInsert.length} rows from Excel.`);

    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        // Drop the table to ensure schema changes are applied
        db.run("DROP TABLE IF EXISTS machines");

        // Re-create the table using the centralized function
        initDB();

        // Insert new data in a transaction
        db.run("BEGIN TRANSACTION");
        const stmt = db.prepare(`INSERT INTO machines (customs, reference, machine, pn, etb, eta_port, eta_epiroc, ship, division, status, bl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

        rowsToInsert.forEach((row) => {
          stmt.run(row, (err) => {
            if (err) {
              console.error(`${logPrefix} Error inserting row:`, err);
              db.run("ROLLBACK");
              reject(err);
            }
          });
        });

        stmt.finalize((err) => {
          if (err) {
            console.error(`${logPrefix} Error finalizing statement:`, err);
            db.run("ROLLBACK");
            reject(err);
            return;
          }
          db.run("COMMIT", (commitErr) => {
            if (commitErr) {
              console.error(`${logPrefix} Error committing transaction:`, commitErr);
              db.run("ROLLBACK");
              reject(commitErr);
            } else {
              console.log(`${logPrefix} Transaction committed successfully. Inserted ${rowsToInsert.length} rows.`);
              resolve();
            }
          });
        });
      });
    });

    res.json({ success: true, rows: rowsToInsert.length });
    console.log(`${logPrefix} --- ADMIN UPLOAD END ---`);

  } catch (err) {
    console.error(`${logPrefix} File Processing Error:`, err);
    res.status(500).json({ error: 'Failed to process Excel file: ' + (err as Error).message });
    console.log(`${logPrefix} --- ADMIN UPLOAD END (WITH ERROR) ---`);
  } finally {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error(`${logPrefix} Error deleting temp file:`, err);
      } else {
        console.log(`${logPrefix} Cleaned up temporary file: ${filePath}`);
      }
    });
  }
});

// 2. Query Endpoint
app.post('/api/query', async (req, res) => {
  const { question, lang } = req.body;

  if (!question) return res.status(400).json({ error: 'Question required' });

  try {
    // Step 1: Generate SQL using Gemini
    const sqlPrompt = `${SQL_INSTRUCTIONS}\nQuestion: "${question}"\nSQL:`;
    
    const result = await model.generateContent(sqlPrompt);
    const sqlResponse = result.response;
    let sql = sqlResponse.text().trim();
    
    // Strip markdown block if present
    sql = sql.replace(/```sql/g, '').replace(/```/g, '').trim();
    console.log(`[AI] Generated SQL: ${sql}`);

    // Validate SQL
    const trimmedSql = sql.trim().toLowerCase();
    if (!trimmedSql.startsWith('select') || trimmedSql.split(';').length > 1) {
      throw new Error('AI generated potentially unsafe SQL. Only single SELECT statements are allowed.');
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
        let contextPrompt = fs.readFileSync(path.join(__dirname, 'context_prompt.txt'), 'utf-8');
        contextPrompt = contextPrompt.replace('{{data}}', JSON.stringify(rows));
        contextPrompt = contextPrompt.replace('{{question}}', question);
        contextPrompt = contextPrompt.replace('{{lang}}', lang);
        
        const explanationResult = await model.generateContent(contextPrompt);
        const explanationResponse = explanationResult.response;
        directAnswer = explanationResponse.text();
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
