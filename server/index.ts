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
import fetch from 'node-fetch';
import { Agent } from 'https';
import { getTranslation } from './translations.js';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
console.log('[SERVER START] Environment variables loaded.');

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
let db: sqlite3.Database;

const CREATE_MACHINES_TABLE_SQL = `
CREATE TABLE machines (
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
);`;

const initDB = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('[DATABASE ERROR]', err.message);
        return reject(err);
      }
      console.log('[SERVER START] Connected to the SQLite database.');
      // Use "IF NOT EXISTS" to be safe on initial startup
      db.run(CREATE_MACHINES_TABLE_SQL.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'), (err) => {
        if (err) {
          console.error('[DATABASE ERROR] Could not create table', err.message);
          return reject(err);
        }
        console.log('[SERVER START] Table "machines" is ready.');
        resolve();
      });
    });
  });
};

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

// --- AI Clients Setup ---

// Gemini Client
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  throw new Error('GEMINI_API_KEY is not set');
}
const genAI = new GoogleGenerativeAI(geminiApiKey);
const geminiModel = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Z.ai Client
const zApiKey = process.env.Z_API_KEY;
if (!zApiKey) {
    throw new Error('Z_API_KEY is not set');
}

// Define the interface for Z.ai API response
interface ZApiResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

// Create a custom HTTPS agent that ignores certificate errors
// WARNING: This is not secure and should only be used for development/testing
const httpsAgent = new Agent({
  rejectUnauthorized: false
});

async function callZAPI(messages: any[], model = 'GLM-4.5-Flash'): Promise<ZApiResponse> {
    const url = 'https://api.z.ai/api/paas/v4/chat/completions';
    console.log(`[Z.ai] Calling model: ${model}`);
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${zApiKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            model: model,
            messages: messages,
            temperature: 0.1 // Lower temperature for more deterministic SQL
        }),
        agent: httpsAgent // Use the custom agent that ignores certificate errors
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[Z.ai] API call failed: ${response.status}`, errorBody);
        throw new Error(`Z.ai API call failed: ${response.status}`);
    }

    return await response.json() as ZApiResponse;
}


// --- Instructions for AI ---
const SQL_INSTRUCTIONS = fs.readFileSync(path.join(__dirname, 'sql_instructions.txt'), 'utf-8');
const CONTEXT_PROMPT_TEMPLATE = fs.readFileSync(path.join(__dirname, 'context_prompt.txt'), 'utf-8');


// --- AI Generation Logic ---

const generateSql = async (question: string, aiModel: 'gemini' | 'zai' = 'gemini'): Promise<string> => {
    const sqlPrompt = `${SQL_INSTRUCTIONS}\nQuestion: "${question}"\nSQL:`;

    let generatedText: string;

    if (aiModel === 'zai') {
        const messages = [{ role: 'user', content: sqlPrompt }];
        const result = await callZAPI(messages);
        generatedText = result.choices[0].message.content;
    } else { // Default to gemini
        const result = await geminiModel.generateContent(sqlPrompt);
        generatedText = result.response.text();
    }

    // Strip markdown block and trim
    const sql = generatedText.replace(/```sql/g, '').replace(/```/g, '').trim();
    console.log(`[AI - ${aiModel}] Generated SQL: ${sql}`);
    return sql;
};

const generateExplanation = async (data: any[], question: string, lang: string, aiModel: 'gemini' | 'zai' = 'gemini'): Promise<string | null> => {
    if (data.length === 0 || data.length >= 5) {
        return null;
    }

    let contextPrompt = CONTEXT_PROMPT_TEMPLATE
        .replace('{{data}}', JSON.stringify(data))
        .replace('{{question}}', question)
        .replace('{{lang}}', lang);

    let explanation: string;

    if (aiModel === 'zai') {
        const messages = [{ role: 'user', content: contextPrompt }];
        const result = await callZAPI(messages);
        explanation = result.choices[0].message.content;
    } else { // Default to gemini
        const result = await geminiModel.generateContent(contextPrompt);
        explanation = result.response.text();
    }

    console.log(`[AI - ${aiModel}] Generated Explanation: ${explanation.substring(0, 100)}...`);
    return explanation;
}


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

const sanitizePn = (pnValue: any): string | null => {
  if (pnValue === null || pnValue === undefined) {
    return null;
  }
  const pnString = String(pnValue);
  if (pnString.endsWith('.0')) {
    return pnString.slice(0, -2);
  }
  return pnString;
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
        sanitizePn(row.getCell(4).value), // pn
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
        // 1. Drop the old table
        db.run("DROP TABLE IF EXISTS machines", (err) => {
          if (err) {
            console.error(`${logPrefix} Error dropping table:`, err);
            return reject(err);
          }

          // 2. Re-create the table on the same connection
          db.run(CREATE_MACHINES_TABLE_SQL, (err) => {
            if (err) {
              console.error(`${logPrefix} Error re-creating table:`, err);
              return reject(err);
            }

            // 3. Insert new data in a transaction
            db.run("BEGIN TRANSACTION");
            const stmt = db.prepare(`INSERT INTO machines (customs, reference, machine, pn, etb, eta_port, eta_epiroc, ship, division, status, bl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

            rowsToInsert.forEach((row) => {
              stmt.run(row, (err) => {
                if (err) {
                  console.error(`${logPrefix} Error inserting row:`, err);
                  db.run("ROLLBACK"); // Rollback on error
                  reject(err);
                }
              });
            });

            stmt.finalize((err) => {
              if (err) {
                console.error(`${logPrefix} Error finalizing statement:`, err);
                db.run("ROLLBACK");
                return reject(err);
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
  const { question, lang, model: aiModel = 'gemini' } = req.body; // default to gemini

  if (!question) return res.status(400).json({ error: 'Question is required' });
  if (aiModel !== 'gemini' && aiModel !== 'zai') {
    return res.status(400).json({ error: 'Invalid model specified' });
  }

  try {
    // Step 1: Generate SQL using the selected AI model
    const sql = await generateSql(question, aiModel);

    // Validate SQL
    const trimmedSql = sql.trim().toLowerCase();
    if (!trimmedSql.startsWith('select') || trimmedSql.split(';').length > 1) {
      throw new Error('AI generated potentially unsafe SQL. Only single SELECT statements are allowed.');
    }

    // Step 2: Execute SQL
    db.all(sql, [], async (err, rows) => {
      if (err) {
        console.error("SQL Execution Error:", err.message);
        // Inform the user about the SQL error
        return res.status(500).json({
            error: 'There was an error with the generated query. Please try rephrasing your question.',
            details: err.message
        });
      }

      try {
        // Step 3: Generate Explanation using the selected AI model
        const directAnswer = await generateExplanation(rows, question, lang, aiModel);

        // Determine view mode based on results
        const view = rows.length === 1 ? 'CARD' : rows.length > 1 ? 'TABLE' : undefined;

        res.json({
          data: rows,
          sql: sql,
          directAnswer: directAnswer,
          view: view
        });

      } catch (explanationError) {
        console.error(`[AI - ${aiModel}] Explanation Generation Error:`, explanationError);

        // Determine view mode even on explanation failure
        const view = rows.length === 1 ? 'CARD' : rows.length > 1 ? 'TABLE' : undefined;

        // Still return the data even if explanation fails
        res.json({
          data: rows,
          sql: sql,
          directAnswer: getTranslation(lang, 'explanationError'),
          view: view
        });
      }
    });

  } catch (error) {
    console.error(`[AI - ${aiModel}] Main Query Processing Error:`, error);
    res.status(500).json({ error: 'An error occurred while processing your request with the AI.' });
  }
});

const startServer = async () => {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();