import fs from 'fs';
import path from 'path';

// Create a unique run directory like runs/2025-09-02_ab12cd
export function createRunDir() {
  const base = path.resolve('runs');
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 10);
  const short = Math.random().toString(36).slice(2, 8);
  const dir = path.join(base, `${stamp}_${short}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
