// server/index.ts
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
const UPLOAD_DIR = path.resolve(__dirname, 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
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
      db.run(
        CREATE_MACHINES_TABLE_SQL.replace('CREATE TABLE', 'CREATE TABLE IF NOT EXISTS'),
        (err) => {
          if (err) {
            console.error('[DATABASE ERROR] Could not create table', err.message);
            return reject(err);
          }
          console.log('[SERVER START] Table "machines" is ready.');
          resolve();
        }
      );
    });
  });
};

// --- Express Setup ---
const app = express();
app.use(cors());
app.use(express.json());

// Upload storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    const safeName = file.originalname.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
    cb(null, Date.now() + '-' + safeName);
  },
});
const upload = multer({ storage: storage });

// --- AI Clients ---
const geminiApiKey = process.env.GEMINI_API_KEY;
if (!geminiApiKey) {
  throw new Error('GEMINI_API_KEY is not set');
}
const genAI = new GoogleGenerativeAI(geminiApiKey);
const geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const zApiKey = process.env.Z_API_KEY;
if (!zApiKey) {
  throw new Error('Z_API_KEY is not set');
}

interface ZApiResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

const httpsAgent = new Agent({
  rejectUnauthorized: false,
});

async function callZAPI(messages: any[], model = 'GLM-4.5-Flash'): Promise<ZApiResponse> {
  const url = 'https://api.z.ai/api/paas/v4/chat/completions';
  console.log(`[Z.ai] Calling model: ${model}`);
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${zApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: model,
      messages: messages,
      temperature: 0.1,
    }),
    agent: httpsAgent,
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[Z.ai] API call failed: ${response.status}`, errorBody);
    throw new Error(`Z.ai API call failed: ${response.status}`);
  }

  return (await response.json()) as ZApiResponse;
}

// --- Load AI Instructions ---
const SQL_INSTRUCTIONS = fs.readFileSync(path.join(__dirname, 'sql_instructions.txt'), 'utf-8');
const CONTEXT_PROMPT_TEMPLATE = fs.readFileSync(
  path.join(__dirname, 'context_prompt.txt'),
  'utf-8'
);

// --- AI Logic ---
const generateSql = async (
  question: string,
  aiModel: 'gemini' | 'zai' = 'gemini'
): Promise<string> => {
  const sqlPrompt = `${SQL_INSTRUCTIONS}\nQuestion: "${question}"\nSQL:`;
  let generatedText: string;

  if (aiModel === 'zai') {
    const messages = [{ role: 'user', content: sqlPrompt }];
    const result = await callZAPI(messages);
    generatedText = result.choices[0].message.content;
  } else {
    const result = await geminiModel.generateContent(sqlPrompt);
    generatedText = result.response.text();
  }

  const sql = generatedText.replace(/```sql/g, '').replace(/```/g, '').trim();
  console.log(`[AI - ${aiModel}] Generated SQL: ${sql}`);
  return sql;
};

const generateExplanation = async (
  data: any[],
  question: string,
  lang: string,
  aiModel: 'gemini' | 'zai' = 'gemini'
): Promise<string | null> => {
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
  } else {
    const result = await geminiModel.generateContent(contextPrompt);
    explanation = result.response.text();
  }

  console.log(`[AI - ${aiModel}] Generated Explanation: ${explanation.substring(0, 100)}...`);
  return explanation;
};

// --- Helpers ---
const excelDateToJSDate = (excelValue: any): string | null => {
  if (!excelValue) return null;
  if (excelValue instanceof Date) {
    return isNaN(excelValue.getTime()) ? null : excelValue.toISOString().split('T')[0];
  }
  if (typeof excelValue === 'string') {
    const trimmed = excelValue.trim();
    if (trimmed.toLowerCase().includes('confirmar')) return null;
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) {
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  if (typeof excelValue === 'number') {
    if (excelValue < 35000) return null;
    try {
      const date = new Date(Math.round((excelValue - 25569) * 86400 * 1000));
      return isNaN(date.getTime()) ? null : date.toISOString().split('T')[0];
    } catch (e) {
      console.error(`[DATE PARSING] Error converting Excel number to date:`, e);
      return null;
    }
  }
  return null;
};

const sanitizePn = (pnValue: any): string | null => {
  if (pnValue == null) return null;
  const pnString = String(pnValue);
  return pnString.endsWith('.0') ? pnString.slice(0, -2) : pnString;
};

// --- Routes ---
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
      throw new Error('Excel file is empty or missing data rows.');
    }

    const rowsToInsert = [];
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const isRowEmpty = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].every((colNumber) => {
        const cell = row.getCell(colNumber);
        return !cell.value || cell.value.toString().trim() === '';
      });

      if (isRowEmpty) continue;

      rowsToInsert.push([
        row.getCell(1).value,
        row.getCell(2).value,
        row.getCell(3).value || 'Unknown Machine',
        sanitizePn(row.getCell(4).value),
        excelDateToJSDate(row.getCell(5).value),
        excelDateToJSDate(row.getCell(6).value),
        excelDateToJSDate(row.getCell(7).value),
        row.getCell(8).value,
        row.getCell(9).value,
        row.getCell(10).value,
        row.getCell(11).value,
      ].map((cell) => (cell === undefined ? null : cell)));
    }

    await new Promise<void>((resolve, reject) => {
      db.serialize(() => {
        db.run('DROP TABLE IF EXISTS machines', (err) => {
          if (err) return reject(err);
          db.run(CREATE_MACHINES_TABLE_SQL, (err) => {
            if (err) return reject(err);
            db.run('BEGIN TRANSACTION');
            const stmt = db.prepare(
              `INSERT INTO machines (customs, reference, machine, pn, etb, eta_port, eta_epiroc, ship, division, status, bl) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );

            rowsToInsert.forEach((row) => {
              stmt.run(row, (err) => {
                if (err) {
                  db.run('ROLLBACK');
                  reject(err);
                }
              });
            });

            stmt.finalize((err) => {
              if (err) {
                db.run('ROLLBACK');
                return reject(err);
              }
              db.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  db.run('ROLLBACK');
                  reject(commitErr);
                } else {
                  console.log(`${logPrefix} Inserted ${rowsToInsert.length} rows.`);
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
      if (err) console.error(`${logPrefix} Error deleting temp file:`, err);
      else console.log(`${logPrefix} Cleaned up temporary file: ${filePath}`);
    });
  }
});

app.post('/api/query', async (req, res) => {
  const { question, lang, model: aiModel = 'gemini' } = req.body;
  if (!question) return res.status(400).json({ error: 'Question is required' });
  if (aiModel !== 'gemini' && aiModel !== 'zai') {
    return res.status(400).json({ error: 'Invalid model specified' });
  }

  try {
    const sql = await generateSql(question, aiModel);
    const trimmedSql = sql.trim().toLowerCase();
    if (!trimmedSql.startsWith('select') || trimmedSql.includes(';')) {
      throw new Error('Only single SELECT statements are allowed.');
    }

    db.all(sql, [], async (err, rows) => {
      if (err) {
        console.error('SQL Execution Error:', err.message);
        return res.status(500).json({
          error: 'Query error. Please rephrase your question.',
          details: err.message,
        });
      }

      try {
        const directAnswer = await generateExplanation(rows, question, lang, aiModel);
        const view = rows.length === 1 ? 'CARD' : rows.length > 1 ? 'TABLE' : undefined;
        res.json({ data: rows, sql, directAnswer, view });
      } catch (explanationError) {
        console.error(`[AI - ${aiModel}] Explanation error:`, explanationError);
        const view = rows.length === 1 ? 'CARD' : rows.length > 1 ? 'TABLE' : undefined;
        res.json({
          data: rows,
          sql,
          directAnswer: getTranslation(lang, 'explanationError'),
          view,
        });
      }
    });
  } catch (error) {
    console.error(`[AI - ${aiModel}] Main error:`, error);
    res.status(500).json({ error: 'AI processing failed.' });
  }
});

// --- Serve Frontend (Production) ---
const distPath = path.join(__dirname, '../dist');
if (fs.existsSync(distPath)) {
  console.log('[SERVER] Serving static frontend from:', distPath);
  app.use(express.static(distPath));

  // Middleware to serve index.html for all non-API routes (SPA support)
  app.use((req, res, next) => {
    // Skip API routes and any other reserved paths
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(distPath, 'index.html'));
  });
} else {
  console.warn('[SERVER] Frontend "dist" folder not found. API-only mode.');
}

// --- Start Server ---
const startServer = async () => {
  try {
    await initDB();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
