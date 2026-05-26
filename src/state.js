const mongoose = require('mongoose');
const DailyStateModel = require('./models/DailyStateModel');

const DEFAULT = () => ({
  participants: [],
  currentOrder: [],
  currentIndex: 0,
  dailyActive: false,
  skips: [],
  history: [],
});

class DailyState {
  constructor(projectId) {
    this.projectId = projectId;
    this._s = DEFAULT();
  }

  _sort(arr) {
    return [...arr].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }

  addParticipant(name) {
    const n = name.trim();
    if (this._s.participants.find(p => p.toLowerCase() === n.toLowerCase()))
      return { success: false, reason: 'Participante já existe' };
    this._s.participants.push(n);
    this._s.participants.sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
    if (!this._s.dailyActive) this._s.currentOrder = [...this._s.participants];
    return { success: true };
  }

  removeParticipant(name) {
    const idx = this._s.participants.findIndex(p => p.toLowerCase() === name.toLowerCase());
    if (idx === -1) return { success: false, reason: 'Participante não encontrado' };
    this._s.participants.splice(idx, 1);
    const oi = this._s.currentOrder.findIndex(p => p.toLowerCase() === name.toLowerCase());
    if (oi !== -1) {
      this._s.currentOrder.splice(oi, 1);
      if (oi < this._s.currentIndex) this._s.currentIndex = Math.max(0, this._s.currentIndex - 1);
    }
    return { success: true };
  }

  startDaily() {
    this._s.currentOrder = this._sort(this._s.participants);
    this._s.currentIndex = 0;
    this._s.dailyActive = true;
    this._s.skips = [];
    return this.getState();
  }

  getCurrentPresenter() {
    const { currentOrder, currentIndex, dailyActive } = this._s;
    if (!dailyActive || currentOrder.length === 0) return null;
    return currentOrder[currentIndex] || null;
  }

  next() {
    const current = this.getCurrentPresenter();
    if (!current) return { done: true, reason: 'Nenhuma daily ativa' };
    this._s.history.push({ date: new Date().toISOString(), presenter: current, action: 'presented' });
    if (this._s.currentIndex >= this._s.currentOrder.length - 1) {
      this._reset();
      return { done: true };
    }
    this._s.currentIndex += 1;
    return { done: false, presenter: this.getCurrentPresenter() };
  }

  skip(justification) {
    const current = this.getCurrentPresenter();
    if (!current) return null;
    const { currentIndex } = this._s;
    this._s.skips.push({ name: current, justification, time: new Date().toISOString() });
    this._s.history.push({ date: new Date().toISOString(), presenter: current, action: 'skipped', justification });
    this._s.currentOrder.splice(currentIndex, 1);
    const insertAt = currentIndex + 1;
    if (insertAt >= this._s.currentOrder.length) this._s.currentOrder.push(current);
    else this._s.currentOrder.splice(insertAt, 0, current);
    return { skipped: current, next: this.getCurrentPresenter(), newOrder: this._s.currentOrder };
  }

  _reset() {
    this._s.currentOrder = this._sort(this._s.participants);
    this._s.currentIndex = 0;
    this._s.dailyActive = false;
    this._s.skips = [];
  }

  moveParticipant(name, toIndex) {
    const from = this._s.currentOrder.findIndex(p => p.toLowerCase() === name.toLowerCase());
    if (from === -1) return { success: false, reason: 'Participante não encontrado' };
    if (toIndex < 0 || toIndex >= this._s.currentOrder.length)
      return { success: false, reason: 'Posição inválida' };
    if (toIndex < this._s.currentIndex)
      return { success: false, reason: 'Não é possível mover para antes do atual' };
    const [person] = this._s.currentOrder.splice(from, 1);
    this._s.currentOrder.splice(toIndex, 0, person);
    return { success: true };
  }

  resetManual() {
    this._reset();
    return this.getState();
  }

  getState() {
    const { currentOrder, currentIndex, dailyActive, participants, skips } = this._s;
    const current = this.getCurrentPresenter();
    return {
      participants,
      currentOrder,
      currentIndex,
      dailyActive,
      current,
      presented: dailyActive ? currentOrder.slice(0, currentIndex) : [],
      remaining: dailyActive ? currentOrder.slice(currentIndex + 1) : currentOrder.slice(1),
      skips,
      total: currentOrder.length,
      progress: dailyActive ? currentIndex + 1 : 0,
    };
  }

  getHistory(limit = 50) {
    return this._s.history.slice(-limit).reverse();
  }

  async load() {
    if (mongoose.connection.readyState !== 1) return;
    const doc = await DailyStateModel.findById(this.projectId).lean();
    if (doc) {
      this._s.participants = doc.participants ?? [];
      this._s.currentOrder = doc.currentOrder ?? [];
      this._s.currentIndex = doc.currentIndex ?? 0;
      this._s.dailyActive = doc.dailyActive ?? false;
      this._s.skips = doc.skips ?? [];
      this._s.history = doc.history ?? [];
    }
  }

  async save() {
    if (mongoose.connection.readyState !== 1) return;
    await DailyStateModel.findByIdAndUpdate(
      this.projectId,
      { $set: { _id: this.projectId, ...this._s } },
      { upsert: true, new: true }
    );
  }
}

module.exports = DailyState;
