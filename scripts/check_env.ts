import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const apiKey = process.env.GEMINI_API_KEY;

if (apiKey) {
  console.log('Successfully loaded GEMINI_API_KEY:');
  console.log(apiKey);
} else {
  console.error('Failed to load GEMINI_API_KEY from .env.local');
}
