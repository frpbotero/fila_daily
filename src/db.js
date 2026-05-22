const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'daily.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    webhook_url   TEXT NOT NULL,
    cron_schedule TEXT NOT NULL DEFAULT '0 9 * * 1-5',
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS participants (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    PRIMARY KEY (project_id, name)
  );

  CREATE TABLE IF NOT EXISTS daily_state (
    project_id    TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    current_order TEXT NOT NULL DEFAULT '[]',
    current_index INTEGER NOT NULL DEFAULT 0,
    daily_active  INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS skips (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    justification TEXT NOT NULL,
    time          TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS history (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    date          TEXT NOT NULL,
    presenter     TEXT NOT NULL,
    action        TEXT NOT NULL,
    justification TEXT
  );
`);

module.exports = db;
