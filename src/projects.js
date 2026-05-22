const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('./db');
const DailyState = require('./state');

const CRON_DEFAULT = process.env.CRON_DAILY || '0 9 * * 1-5';

const stmts = {
  list: db.prepare('SELECT id, name, webhook_url, cron_schedule, created_at FROM projects ORDER BY created_at'),
  get: db.prepare('SELECT id, name, webhook_url, cron_schedule FROM projects WHERE id = ?'),
  insert: db.prepare('INSERT INTO projects (id, name, webhook_url, cron_schedule, created_at) VALUES (?, ?, ?, ?, ?)'),
  insertState: db.prepare('INSERT INTO daily_state (project_id, current_order, current_index, daily_active) VALUES (?, ?, 0, 0)'),
  update: db.prepare('UPDATE projects SET name = ?, webhook_url = ?, cron_schedule = ? WHERE id = ?'),
  delete: db.prepare('DELETE FROM projects WHERE id = ?'),
  count: db.prepare('SELECT COUNT(*) as n FROM projects'),
  insertParticipant: db.prepare('INSERT OR IGNORE INTO participants (project_id, name) VALUES (?, ?)'),
  updateState: db.prepare('UPDATE daily_state SET current_order = ?, current_index = ?, daily_active = ? WHERE project_id = ?'),
};

class ProjectManager {
  constructor() {
    this._migrate();
  }

  _migrate() {
    const { n } = stmts.count.get();
    if (n > 0) return;

    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
    if (!webhookUrl) return;

    const id = crypto.randomBytes(4).toString('hex');
    stmts.insert.run(id, 'Default', webhookUrl, CRON_DEFAULT, new Date().toISOString());
    stmts.insertState.run(id, '[]');

    const legacyPath = path.join(__dirname, '..', 'data', 'state.json');
    try {
      const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
      const participants = legacy.participants || [];
      const sorted = [...participants].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
      for (const name of participants) stmts.insertParticipant.run(id, name);
      stmts.updateState.run(JSON.stringify(sorted), 0, 0, id);
      console.log(`✅ Migração: projeto "Default" criado com ${participants.length} participante(s) de state.json`);
    } catch {
      console.log('✅ Migração: projeto "Default" criado (sem state.json para importar)');
    }
  }

  create(name, webhookUrl, cronSchedule) {
    const id = crypto.randomBytes(4).toString('hex');
    const cron = cronSchedule || CRON_DEFAULT;
    stmts.insert.run(id, name.trim(), webhookUrl.trim(), cron, new Date().toISOString());
    stmts.insertState.run(id, '[]');
    return { id, name: name.trim(), webhookUrl: webhookUrl.trim(), cronSchedule: cron };
  }

  get(id) {
    const row = stmts.get.get(id);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      webhookUrl: row.webhook_url,
      cronSchedule: row.cron_schedule,
      dailyState: new DailyState(row.id, db),
    };
  }

  list() {
    return stmts.list.all().map(r => ({
      id: r.id,
      name: r.name,
      webhookUrl: r.webhook_url,
      cronSchedule: r.cron_schedule,
    }));
  }

  update(id, { name, webhookUrl, cronSchedule }) {
    const row = stmts.get.get(id);
    if (!row) return null;
    const newName = name !== undefined ? name.trim() : row.name;
    const newUrl = webhookUrl !== undefined ? webhookUrl.trim() : row.webhook_url;
    const newCron = cronSchedule !== undefined ? cronSchedule : row.cron_schedule;
    stmts.update.run(newName, newUrl, newCron, id);
    return { id, name: newName, webhookUrl: newUrl, cronSchedule: newCron };
  }

  delete(id) {
    const changes = stmts.delete.run(id);
    return changes.changes > 0;
  }
}

module.exports = new ProjectManager();
