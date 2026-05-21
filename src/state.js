const fs = require('fs-extra');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'state.json');

const DEFAULT_STATE = {
  participants: [],
  currentOrder: [],
  currentIndex: 0,
  dailyActive: false,
  skips: [],
  history: [],
};

class DailyState {
  constructor() {
    this._state = this._load();
  }

  _load() {
    try {
      if (fs.existsSync(DATA_FILE)) {
        return { ...DEFAULT_STATE, ...fs.readJsonSync(DATA_FILE) };
      }
    } catch {
      /* ignore */
    }
    return { ...DEFAULT_STATE };
  }

  _save() {
    try {
      fs.ensureDirSync(path.dirname(DATA_FILE));
      fs.writeJsonSync(DATA_FILE, this._state, { spaces: 2 });
    } catch (e) {
      console.error('Erro ao salvar estado:', e.message);
    }
  }

  // ---------- Participants ----------

  addParticipant(name) {
    const normalized = name.trim();
    const already = this._state.participants.find(
      (p) => p.toLowerCase() === normalized.toLowerCase()
    );
    if (already) return { success: false, reason: 'Participante já existe' };

    this._state.participants.push(normalized);
    this._state.participants.sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    );

    // If no active daily, keep currentOrder in sync
    if (!this._state.dailyActive) {
      this._state.currentOrder = [...this._state.participants];
    }

    this._save();
    return { success: true };
  }

  removeParticipant(name) {
    const idx = this._state.participants.findIndex(
      (p) => p.toLowerCase() === name.toLowerCase()
    );
    if (idx === -1) return { success: false, reason: 'Participante não encontrado' };

    this._state.participants.splice(idx, 1);

    // Remove from currentOrder too
    const orderIdx = this._state.currentOrder.findIndex(
      (p) => p.toLowerCase() === name.toLowerCase()
    );
    if (orderIdx !== -1) {
      this._state.currentOrder.splice(orderIdx, 1);
      // If removed someone before currentIndex, adjust pointer
      if (orderIdx < this._state.currentIndex) {
        this._state.currentIndex = Math.max(0, this._state.currentIndex - 1);
      }
    }

    this._save();
    return { success: true };
  }

  // ---------- Daily flow ----------

  startDaily() {
    this._state.currentOrder = [...this._state.participants].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    );
    this._state.currentIndex = 0;
    this._state.dailyActive = true;
    this._state.skips = [];
    this._save();
    return this.getState();
  }

  getCurrentPresenter() {
    const { currentOrder, currentIndex, dailyActive } = this._state;
    if (!dailyActive || currentOrder.length === 0) return null;
    return currentOrder[currentIndex] || null;
  }

  next() {
    const { currentOrder, currentIndex } = this._state;
    const current = this.getCurrentPresenter();

    if (!current) return { done: true, reason: 'Nenhuma daily ativa' };

    // Log to history
    this._state.history.push({
      date: new Date().toISOString(),
      presenter: current,
      action: 'presented',
    });

    if (currentIndex >= currentOrder.length - 1) {
      // All done → reset
      this._reset();
      return { done: true };
    }

    this._state.currentIndex += 1;
    this._save();
    return { done: false, presenter: this.getCurrentPresenter() };
  }

  /**
   * Skip current presenter with justification.
   * Skipped person moves to the position right after the next person.
   * [A, B, C, D] skip A → [B, A, C, D] (B presents, then A, then C, D)
   */
  skip(justification) {
    const current = this.getCurrentPresenter();
    if (!current) return null;

    const { currentOrder, currentIndex } = this._state;

    this._state.skips.push({
      name: current,
      justification,
      time: new Date().toISOString(),
    });

    this._state.history.push({
      date: new Date().toISOString(),
      presenter: current,
      action: 'skipped',
      justification,
    });

    // Remove from current position
    this._state.currentOrder.splice(currentIndex, 1);

    // Insert after the next person (currentIndex now points to next person)
    const insertAt = currentIndex + 1;
    if (insertAt >= this._state.currentOrder.length) {
      this._state.currentOrder.push(current);
    } else {
      this._state.currentOrder.splice(insertAt, 0, current);
    }

    // currentIndex stays the same → now points to the next person
    this._save();

    return {
      skipped: current,
      next: this.getCurrentPresenter(),
      newOrder: this._state.currentOrder,
    };
  }

  _reset() {
    this._state.currentOrder = [...this._state.participants].sort((a, b) =>
      a.localeCompare(b, 'pt-BR', { sensitivity: 'base' })
    );
    this._state.currentIndex = 0;
    this._state.dailyActive = false;
    this._state.skips = [];
    this._save();
  }

  resetManual() {
    this._reset();
    return this.getState();
  }

  getState() {
    const { currentOrder, currentIndex, dailyActive, participants, skips } = this._state;
    const current = this.getCurrentPresenter();
    const presented = dailyActive ? currentOrder.slice(0, currentIndex) : [];
    const remaining = dailyActive
      ? currentOrder.slice(currentIndex + 1)
      : currentOrder.slice(1);

    return {
      participants,
      currentOrder,
      currentIndex,
      dailyActive,
      current,
      presented,
      remaining,
      skips,
      total: currentOrder.length,
      progress: dailyActive ? currentIndex + 1 : 0,
    };
  }

  getHistory(limit = 50) {
    return this._state.history.slice(-limit).reverse();
  }
}

module.exports = new DailyState();
