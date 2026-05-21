const express = require('express');
const path = require('path');
const cron = require('node-cron');

const state = require('./state');
const { postDailyCard, postDailyCompleted } = require('./teams');
const { skipPage, successPage } = require('./pages');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const CRON_DAILY = process.env.CRON_DAILY || '0 9 * * 1-5'; // Mon–Fri at 09:00

// ─────────────────────────────────────────────
//  REST API
// ─────────────────────────────────────────────

/** GET /api/state — current daily state */
app.get('/api/state', (req, res) => {
  res.json(state.getState());
});

/** GET /api/history — last 50 actions */
app.get('/api/history', (req, res) => {
  res.json(state.getHistory());
});

/** POST /api/participants — add participant */
app.post('/api/participants', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Nome é obrigatório' });
  }
  const result = state.addParticipant(name.trim());
  if (!result.success) {
    return res.status(409).json({ error: result.reason });
  }
  res.json({ success: true, participants: state.getState().participants });
});

/** DELETE /api/participants/:name — remove participant */
app.delete('/api/participants/:name', (req, res) => {
  const result = state.removeParticipant(decodeURIComponent(req.params.name));
  if (!result.success) {
    return res.status(404).json({ error: result.reason });
  }
  res.json({ success: true, participants: state.getState().participants });
});

/** POST /api/start — start (or restart) daily, posts card to Teams */
app.post('/api/start', async (req, res) => {
  if (state.getState().participants.length === 0) {
    return res.status(400).json({ error: 'Nenhum participante cadastrado' });
  }
  const newState = state.startDaily();
  await postDailyCard(newState, BASE_URL);
  res.json({ success: true, state: newState });
});

/** POST /api/next — mark current as done, advance to next */
app.post('/api/next', async (req, res) => {
  const current = state.getCurrentPresenter();
  if (!current) {
    return res.status(400).json({ error: 'Nenhuma daily ativa' });
  }
  const result = state.next();
  if (result.done) {
    await postDailyCompleted(state.getState());
  } else {
    await postDailyCard(state.getState(), BASE_URL);
  }
  res.json({ success: true, ...result, state: state.getState() });
});

/** POST /api/skip — skip current presenter */
app.post('/api/skip', async (req, res) => {
  const { justification } = req.body;
  if (!justification || !justification.trim()) {
    return res.status(400).json({ error: 'Justificativa é obrigatória' });
  }
  const current = state.getCurrentPresenter();
  if (!current) {
    return res.status(400).json({ error: 'Nenhuma daily ativa' });
  }
  const result = state.skip(justification.trim());
  await postDailyCard(state.getState(), BASE_URL, {
    skipped: result.skipped,
    justification: justification.trim(),
  });
  res.json({ success: true, ...result, state: state.getState() });
});

/** POST /api/reset — manually reset order to alphabetical */
app.post('/api/reset', (req, res) => {
  const newState = state.resetManual();
  res.json({ success: true, state: newState });
});

// ─────────────────────────────────────────────
//  Action pages (opened via Teams card buttons)
// ─────────────────────────────────────────────

/** GET /actions/next — called when "Concluído" button is clicked in Teams */
app.get('/actions/next', async (req, res) => {
  const current = state.getCurrentPresenter();
  if (!current) {
    return res.send(
      successPage('Daily não ativa', 'Não há daily em andamento no momento.', 'ℹ️')
    );
  }

  const result = state.next();

  if (result.done) {
    await postDailyCompleted(state.getState());
    return res.send(
      successPage(
        'Daily concluída! 🎉',
        'Todos apresentaram. A ordem foi restaurada para a próxima daily.',
        '🎉'
      )
    );
  }

  await postDailyCard(state.getState(), BASE_URL);
  res.send(
    successPage(
      'Próximo!',
      `Agora é a vez de <strong>${result.presenter}</strong>.<br>O card foi atualizado no Teams.`,
      '✅'
    )
  );
});

/** GET /actions/skip — shows justification form */
app.get('/actions/skip', (req, res) => {
  const current = state.getCurrentPresenter();
  if (!current) {
    return res.send(
      successPage('Daily não ativa', 'Não há daily em andamento.', 'ℹ️')
    );
  }
  const error = req.query.error === '1';
  res.send(skipPage(current, BASE_URL, error));
});

/** POST /actions/skip — form submission from skip page */
app.post('/actions/skip', async (req, res) => {
  const { justification } = req.body;

  if (!justification || !justification.trim()) {
    return res.redirect('/actions/skip?error=1');
  }

  const current = state.getCurrentPresenter();
  if (!current) {
    return res.send(
      successPage('Daily não ativa', 'Não há daily em andamento.', 'ℹ️')
    );
  }

  const result = state.skip(justification.trim());
  await postDailyCard(state.getState(), BASE_URL, {
    skipped: result.skipped,
    justification: justification.trim(),
  });

  res.send(
    successPage(
      'Participante pulado',
      `<strong>${result.skipped}</strong> foi pulado(a).<br>Agora é a vez de <strong>${result.next}</strong>.<br>O card foi atualizado no Teams.`,
      '⏭'
    )
  );
});

// ─────────────────────────────────────────────
//  Cron — auto-start daily Mon–Fri
// ─────────────────────────────────────────────

cron.schedule(
  CRON_DAILY,
  async () => {
    console.log('⏰ Cron: iniciando daily automática...');
    if (state.getState().participants.length === 0) {
      console.warn('Nenhum participante cadastrado — daily não iniciada');
      return;
    }
    const newState = state.startDaily();
    await postDailyCard(newState, BASE_URL);
    console.log('✅ Daily iniciada automaticamente');
  },
  { timezone: process.env.TZ || 'America/Sao_Paulo' }
);

// ─────────────────────────────────────────────
//  Fallback SPA
// ─────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚀 Daily Standup Bot rodando em ${BASE_URL}`);
  console.log(`   Teams Webhook: ${process.env.TEAMS_WEBHOOK_URL ? '✅ configurado' : '❌ não configurado'}`);
  console.log(`   Cron schedule: ${CRON_DAILY}\n`);
});
