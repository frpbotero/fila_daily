jest.mock('mongoose', () => ({ connection: { readyState: 0 } }));
jest.mock('../src/models/DailyStateModel', () => ({}));

const DailyState = require('../src/state');

function makeState(...names) {
  const s = new DailyState('test-project');
  for (const n of names) s.addParticipant(n);
  return s;
}

describe('addParticipant', () => {
  test('adiciona e ordena alfabeticamente', () => {
    const s = makeState('Carlos', 'Ana', 'Bruno');
    expect(s.getState().participants).toEqual(['Ana', 'Bruno', 'Carlos']);
  });

  test('rejeita duplicado (case-insensitive)', () => {
    const s = makeState('Ana');
    expect(s.addParticipant('ana')).toEqual({ success: false, reason: 'Participante já existe' });
  });
});

describe('removeParticipant', () => {
  test('remove participante existente', () => {
    const s = makeState('Ana', 'Bruno');
    s.removeParticipant('Ana');
    expect(s.getState().participants).toEqual(['Bruno']);
  });

  test('retorna erro para participante inexistente', () => {
    const s = makeState('Ana');
    expect(s.removeParticipant('Zé')).toEqual({ success: false, reason: 'Participante não encontrado' });
  });
});

describe('startDaily', () => {
  test('ativa daily e define ordem alfabética', () => {
    const s = makeState('Carlos', 'Ana', 'Bruno');
    const state = s.startDaily();
    expect(state.dailyActive).toBe(true);
    expect(state.currentOrder).toEqual(['Ana', 'Bruno', 'Carlos']);
    expect(state.current).toBe('Ana');
  });
});

describe('next', () => {
  test('avança para o próximo participante', () => {
    const s = makeState('Ana', 'Bruno', 'Carlos');
    s.startDaily();
    const r = s.next();
    expect(r.done).toBe(false);
    expect(r.presenter).toBe('Bruno');
  });

  test('conclui a daily no último participante', () => {
    const s = makeState('Ana');
    s.startDaily();
    const r = s.next();
    expect(r.done).toBe(true);
    expect(s.getState().dailyActive).toBe(false);
  });

  test('retorna erro se não há daily ativa', () => {
    const s = makeState('Ana');
    expect(s.next()).toEqual({ done: true, reason: 'Nenhuma daily ativa' });
  });
});

describe('skip', () => {
  test('move participante para depois do próximo', () => {
    const s = makeState('Ana', 'Bruno', 'Carlos');
    s.startDaily();
    const r = s.skip('reunião');
    expect(r.skipped).toBe('Ana');
    expect(r.next).toBe('Bruno');
    expect(r.newOrder).toEqual(['Bruno', 'Ana', 'Carlos']);
  });

  test('retorna null se não há daily ativa', () => {
    const s = makeState('Ana');
    expect(s.skip('motivo')).toBeNull();
  });
});

describe('moveParticipant', () => {
  test('move participante para nova posição', () => {
    const s = makeState('Ana', 'Bruno', 'Carlos');
    s.startDaily();
    s.next(); // avança para Bruno (currentIndex = 1)
    s.moveParticipant('Carlos', 1);
    expect(s.getState().currentOrder).toEqual(['Ana', 'Carlos', 'Bruno']);
  });

  test('rejeita mover para antes do atual', () => {
    const s = makeState('Ana', 'Bruno', 'Carlos');
    s.startDaily();
    s.next(); // currentIndex = 1
    const r = s.moveParticipant('Carlos', 0);
    expect(r.success).toBe(false);
  });
});

describe('getState', () => {
  test('retorna presented e remaining corretamente', () => {
    const s = makeState('Ana', 'Bruno', 'Carlos');
    s.startDaily();
    s.next(); // Ana apresentou
    const state = s.getState();
    expect(state.presented).toEqual(['Ana']);
    expect(state.remaining).toEqual(['Carlos']);
    expect(state.current).toBe('Bruno');
    expect(state.progress).toBe(2);
  });
});

describe('resetManual', () => {
  test('reseta ordem e desativa daily', () => {
    const s = makeState('Ana', 'Bruno');
    s.startDaily();
    s.next();
    const state = s.resetManual();
    expect(state.dailyActive).toBe(false);
    expect(state.currentIndex).toBe(0);
    expect(state.skips).toEqual([]);
  });
});
