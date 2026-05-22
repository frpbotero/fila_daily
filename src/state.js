class DailyState {
  constructor(projectId, db) {
    this.projectId = projectId;
    this.db = db;

    this._stmts = {
      getParticipants: db.prepare(
        'SELECT name FROM participants WHERE project_id = ? ORDER BY name COLLATE NOCASE'
      ),
      insertParticipant: db.prepare(
        'INSERT OR IGNORE INTO participants (project_id, name) VALUES (?, ?)'
      ),
      deleteParticipant: db.prepare(
        'DELETE FROM participants WHERE project_id = ? AND name = ? COLLATE NOCASE'
      ),
      getState: db.prepare(
        'SELECT current_order, current_index, daily_active FROM daily_state WHERE project_id = ?'
      ),
      updateState: db.prepare(
        'UPDATE daily_state SET current_order = ?, current_index = ?, daily_active = ? WHERE project_id = ?'
      ),
      getSkips: db.prepare(
        'SELECT name, justification, time FROM skips WHERE project_id = ? ORDER BY id'
      ),
      insertSkip: db.prepare(
        'INSERT INTO skips (project_id, name, justification, time) VALUES (?, ?, ?, ?)'
      ),
      deleteSkips: db.prepare(
        'DELETE FROM skips WHERE project_id = ?'
      ),
      insertHistory: db.prepare(
        'INSERT INTO history (project_id, date, presenter, action, justification) VALUES (?, ?, ?, ?, ?)'
      ),
      getHistory: db.prepare(
        'SELECT date, presenter, action, justification FROM history WHERE project_id = ? ORDER BY id DESC LIMIT ?'
      ),
    };
  }

  _getRow() {
    return this._stmts.getState.get(this.projectId);
  }

  _participants() {
    return this._stmts.getParticipants.all(this.projectId).map(r => r.name);
  }

  _parseOrder(row) {
    try { return JSON.parse(row.current_order); } catch { return []; }
  }

  _sort(arr) {
    return [...arr].sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }

  addParticipant(name) {
    const n = name.trim();
    const existing = this._participants();
    if (existing.some(p => p.toLowerCase() === n.toLowerCase()))
      return { success: false, reason: 'Participante já existe' };

    this._stmts.insertParticipant.run(this.projectId, n);

    const row = this._getRow();
    if (!row.daily_active) {
      const sorted = this._sort([...existing, n]);
      this._stmts.updateState.run(JSON.stringify(sorted), 0, 0, this.projectId);
    }
    return { success: true };
  }

  removeParticipant(name) {
    const participants = this._participants();
    const found = participants.find(p => p.toLowerCase() === name.toLowerCase());
    if (!found) return { success: false, reason: 'Participante não encontrado' };

    this._stmts.deleteParticipant.run(this.projectId, name);

    const row = this._getRow();
    const order = this._parseOrder(row);
    const oi = order.findIndex(p => p.toLowerCase() === name.toLowerCase());
    if (oi !== -1) {
      order.splice(oi, 1);
      let newIndex = row.current_index;
      if (oi < newIndex) newIndex = Math.max(0, newIndex - 1);
      this._stmts.updateState.run(JSON.stringify(order), newIndex, row.daily_active, this.projectId);
    }
    return { success: true };
  }

  startDaily() {
    const sorted = this._sort(this._participants());
    this._stmts.updateState.run(JSON.stringify(sorted), 0, 1, this.projectId);
    this._stmts.deleteSkips.run(this.projectId);
    return this.getState();
  }

  getCurrentPresenter() {
    const row = this._getRow();
    if (!row || !row.daily_active) return null;
    const order = this._parseOrder(row);
    return order[row.current_index] || null;
  }

  next() {
    const current = this.getCurrentPresenter();
    if (!current) return { done: true, reason: 'Nenhuma daily ativa' };

    const row = this._getRow();
    const order = this._parseOrder(row);

    this._stmts.insertHistory.run(this.projectId, new Date().toISOString(), current, 'presented', null);

    if (row.current_index >= order.length - 1) {
      const sorted = this._sort(this._participants());
      this._stmts.updateState.run(JSON.stringify(sorted), 0, 0, this.projectId);
      this._stmts.deleteSkips.run(this.projectId);
      return { done: true };
    }

    this._stmts.updateState.run(row.current_order, row.current_index + 1, 1, this.projectId);
    return { done: false, presenter: this._parseOrder(this._getRow())[row.current_index + 1] };
  }

  skip(justification) {
    const current = this.getCurrentPresenter();
    if (!current) return null;

    const row = this._getRow();
    const order = this._parseOrder(row);
    const idx = row.current_index;
    const now = new Date().toISOString();

    this._stmts.insertSkip.run(this.projectId, current, justification, now);
    this._stmts.insertHistory.run(this.projectId, now, current, 'skipped', justification);

    order.splice(idx, 1);
    const insertAt = idx + 1;
    if (insertAt >= order.length) order.push(current);
    else order.splice(insertAt, 0, current);

    this._stmts.updateState.run(JSON.stringify(order), idx, 1, this.projectId);

    return { skipped: current, next: order[idx], newOrder: order };
  }

  moveParticipant(name, toIndex) {
    const row = this._getRow();
    const order = this._parseOrder(row);

    const from = order.findIndex(p => p.toLowerCase() === name.toLowerCase());
    if (from === -1) return { success: false, reason: 'Participante não encontrado' };
    if (toIndex < 0 || toIndex >= order.length) return { success: false, reason: 'Posição inválida' };
    if (toIndex < row.current_index) return { success: false, reason: 'Não é possível mover para antes do atual' };

    const [person] = order.splice(from, 1);
    order.splice(toIndex, 0, person);
    this._stmts.updateState.run(JSON.stringify(order), row.current_index, row.daily_active, this.projectId);
    return { success: true };
  }

  resetManual() {
    const sorted = this._sort(this._participants());
    this._stmts.updateState.run(JSON.stringify(sorted), 0, 0, this.projectId);
    this._stmts.deleteSkips.run(this.projectId);
    return this.getState();
  }

  getState() {
    const row = this._getRow();
    const participants = this._participants();
    const currentOrder = this._parseOrder(row);
    const { current_index: currentIndex, daily_active } = row;
    const dailyActive = !!daily_active;
    const skips = this._stmts.getSkips.all(this.projectId);
    const current = dailyActive ? (currentOrder[currentIndex] || null) : null;

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
    return this._stmts.getHistory.all(this.projectId, limit);
  }
}

module.exports = DailyState;
