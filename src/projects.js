const crypto = require('crypto');
const mongoose = require('mongoose');
const ProjectModel = require('./models/ProjectModel');
const DailyStateModel = require('./models/DailyStateModel');
const DailyState = require('./state');

const CRON_DEFAULT = process.env.CRON_DAILY || '0 9 * * 1-5';

class ProjectManager {
  constructor() {
    this._cache = new Map();
  }

  async init() {
    if (mongoose.connection.readyState !== 1) return;
    const projects = await ProjectModel.find().lean();
    for (const p of projects) {
      const ds = new DailyState(p._id);
      await ds.load();
      this._cache.set(p._id, {
        id: p._id,
        name: p.name,
        webhookUrl: p.webhookUrl,
        cronSchedule: p.cronSchedule,
        dailyState: ds,
      });
    }
    if (projects.length === 0 && process.env.TEAMS_WEBHOOK_URL) {
      await this.create('Default', process.env.TEAMS_WEBHOOK_URL, CRON_DEFAULT);
      console.log('✅ Projeto "Default" criado automaticamente');
    }
  }

  async create(name, webhookUrl, cronSchedule) {
    const id = crypto.randomBytes(4).toString('hex');
    const cron = cronSchedule || CRON_DEFAULT;
    await ProjectModel.create({
      _id: id,
      name: name.trim(),
      webhookUrl: webhookUrl.trim(),
      cronSchedule: cron,
      createdAt: new Date().toISOString(),
    });
    const ds = new DailyState(id);
    await ds.save();
    const entry = { id, name: name.trim(), webhookUrl: webhookUrl.trim(), cronSchedule: cron, dailyState: ds };
    this._cache.set(id, entry);
    return entry;
  }

  get(id) {
    return this._cache.get(id) || null;
  }

  list() {
    return [...this._cache.values()].map(({ id, name, webhookUrl, cronSchedule }) => ({
      id, name, webhookUrl, cronSchedule,
    }));
  }

  async update(id, { name, webhookUrl, cronSchedule }) {
    const entry = this._cache.get(id);
    if (!entry) return null;
    const updates = {};
    if (name !== undefined) updates.name = name.trim();
    if (webhookUrl !== undefined) updates.webhookUrl = webhookUrl.trim();
    if (cronSchedule !== undefined) updates.cronSchedule = cronSchedule;
    await ProjectModel.findByIdAndUpdate(id, { $set: updates });
    Object.assign(entry, updates);
    return { id, name: entry.name, webhookUrl: entry.webhookUrl, cronSchedule: entry.cronSchedule };
  }

  async delete(id) {
    if (!this._cache.has(id)) return false;
    await ProjectModel.findByIdAndDelete(id);
    await DailyStateModel.findByIdAndDelete(id);
    this._cache.delete(id);
    return true;
  }
}

module.exports = new ProjectManager();
