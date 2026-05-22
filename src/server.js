const express = require('express');
const path = require('path');
const cron = require('node-cron');

const projectManager = require('./projects');
const { postDailyCard, postDailyCompleted } = require('./teams');
const { skipPage, successPage } = require('./pages');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '..', 'public')));

const PORT = process.env.PORT || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const CRON_DAILY = process.env.CRON_DAILY || '0 9 * * 1-5';
const TZ = process.env.TZ || 'America/Sao_Paulo';

// ─────────────────────────────────────────────
//  Cron management (per project)
// ─────────────────────────────────────────────

const cronTasks = new Map();

function scheduleCron(project) {
  stopCron(project.id);
  const schedule = project.cronSchedule || CRON_DAILY;
  if (!cron.validate(schedule)) return;
  const task = cron.schedule(
    schedule,
    async () => {
      const p = projectManager.get(project.id);
      if (!p) return;
      const s = p.dailyState.getState();
      if (s.participants.length === 0) return;
      const newState = p.dailyState.startDaily();
      await postDailyCard(newState, BASE_URL, p.id, p.webhookUrl);
      console.log(`✅ Daily automática iniciada: ${p.name}`);
    },
    { timezone: TZ }
  );
  cronTasks.set(project.id, task);
}

function stopCron(projectId) {
  const existing = cronTasks.get(projectId);
  if (existing) { existing.stop(); cronTasks.delete(projectId); }
}

// Schedule crons for all existing projects on startup
for (const p of projectManager.list()) scheduleCron(p);

// ─────────────────────────────────────────────
//  Middleware: resolve project
// ─────────────────────────────────────────────

function resolveProject(req, res, next) {
  const project = projectManager.get(req.params.id);
  if (!project) return res.status(404).json({ error: 'Projeto não encontrado' });
  req.project = project;
  next();
}

// ─────────────────────────────────────────────
//  Project CRUD
// ─────────────────────────────────────────────

app.get('/api/projects', (req, res) => {
  res.json(projectManager.list());
});

app.post('/api/projects', (req, res) => {
  const { name, webhookUrl, cronSchedule } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  if (!webhookUrl || !webhookUrl.trim()) return res.status(400).json({ error: 'Webhook URL é obrigatória' });
  const project = projectManager.create(name, webhookUrl, cronSchedule);
  scheduleCron(project);
  res.status(201).json(project);
});

app.get('/api/projects/:id', resolveProject, (req, res) => {
  const { id, name, webhookUrl, cronSchedule } = req.project;
  res.json({ id, name, webhookUrl, cronSchedule, state: req.project.dailyState.getState() });
});

app.put('/api/projects/:id', resolveProject, (req, res) => {
  const { name, webhookUrl, cronSchedule } = req.body;
  const updated = projectManager.update(req.params.id, { name, webhookUrl, cronSchedule });
  if (cronSchedule !== undefined) scheduleCron(updated);
  res.json(updated);
});

app.delete('/api/projects/:id', resolveProject, (req, res) => {
  stopCron(req.params.id);
  projectManager.delete(req.params.id);
  res.json({ success: true });
});

// ─────────────────────────────────────────────
//  Daily state routes (scoped per project)
// ─────────────────────────────────────────────

app.get('/api/projects/:id/state', resolveProject, (req, res) => {
  res.json(req.project.dailyState.getState());
});

app.get('/api/projects/:id/history', resolveProject, (req, res) => {
  res.json(req.project.dailyState.getHistory());
});

app.post('/api/projects/:id/participants', resolveProject, (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome é obrigatório' });
  const result = req.project.dailyState.addParticipant(name.trim());
  if (!result.success) return res.status(409).json({ error: result.reason });
  res.json({ success: true, participants: req.project.dailyState.getState().participants });
});

app.delete('/api/projects/:id/participants/:name', resolveProject, (req, res) => {
  const result = req.project.dailyState.removeParticipant(decodeURIComponent(req.params.name));
  if (!result.success) return res.status(404).json({ error: result.reason });
  res.json({ success: true, participants: req.project.dailyState.getState().participants });
});

app.post('/api/projects/:id/start', resolveProject, async (req, res) => {
  const { dailyState, webhookUrl, id } = req.project;
  if (dailyState.getState().participants.length === 0)
    return res.status(400).json({ error: 'Nenhum participante cadastrado' });
  const newState = dailyState.startDaily();
  await postDailyCard(newState, BASE_URL, id, webhookUrl);
  res.json({ success: true, state: newState });
});

app.post('/api/projects/:id/next', resolveProject, async (req, res) => {
  const { dailyState, webhookUrl, id } = req.project;
  const current = dailyState.getCurrentPresenter();
  if (!current) return res.status(400).json({ error: 'Nenhuma daily ativa' });
  const result = dailyState.next();
  if (result.done) {
    await postDailyCompleted(dailyState.getState(), webhookUrl);
  } else {
    await postDailyCard(dailyState.getState(), BASE_URL, id, webhookUrl);
  }
  res.json({ success: true, ...result, state: dailyState.getState() });
});

app.post('/api/projects/:id/skip', resolveProject, async (req, res) => {
  const { justification } = req.body;
  if (!justification || !justification.trim())
    return res.status(400).json({ error: 'Justificativa é obrigatória' });
  const { dailyState, webhookUrl, id } = req.project;
  const current = dailyState.getCurrentPresenter();
  if (!current) return res.status(400).json({ error: 'Nenhuma daily ativa' });
  const result = dailyState.skip(justification.trim());
  await postDailyCard(dailyState.getState(), BASE_URL, id, webhookUrl, {
    skipped: result.skipped,
    justification: justification.trim(),
  });
  res.json({ success: true, ...result, state: dailyState.getState() });
});

app.post('/api/projects/:id/reset', resolveProject, (req, res) => {
  const newState = req.project.dailyState.resetManual();
  res.json({ success: true, state: newState });
});

app.post('/api/projects/:id/reorder', resolveProject, (req, res) => {
  const { name, toIndex } = req.body;
  if (!name || toIndex === undefined)
    return res.status(400).json({ error: 'name e toIndex são obrigatórios' });
  const result = req.project.dailyState.moveParticipant(name, Number(toIndex));
  if (!result.success) return res.status(400).json({ error: result.reason });
  res.json({ success: true, state: req.project.dailyState.getState() });
});

// ─────────────────────────────────────────────
//  Action pages (Teams card buttons)
// ─────────────────────────────────────────────

function getProjectFromQuery(req, res) {
  const projectId = req.query.project;
  if (!projectId) {
    res.send(successPage('Projeto não especificado', 'Parâmetro ?project= ausente na URL.', '⚠️'));
    return null;
  }
  const project = projectManager.get(projectId);
  if (!project) {
    res.send(successPage('Projeto não encontrado', `Projeto "${projectId}" não existe.`, '❌'));
    return null;
  }
  return project;
}

app.get('/actions/next', async (req, res) => {
  const project = getProjectFromQuery(req, res);
  if (!project) return;

  const { dailyState, webhookUrl, id } = project;
  const current = dailyState.getCurrentPresenter();
  if (!current) {
    return res.send(successPage('Daily não ativa', 'Não há daily em andamento no momento.', 'ℹ️'));
  }

  const result = dailyState.next();

  if (result.done) {
    await postDailyCompleted(dailyState.getState(), webhookUrl);
    return res.send(
      successPage(
        'Daily concluída! 🎉',
        'Todos apresentaram. A ordem foi restaurada para a próxima daily.',
        '🎉'
      )
    );
  }

  await postDailyCard(dailyState.getState(), BASE_URL, id, webhookUrl);
  res.send(
    successPage(
      'Próximo!',
      `Agora é a vez de <strong>${result.presenter}</strong>.<br>O card foi atualizado no Teams.`,
      '✅'
    )
  );
});

app.get('/actions/skip', (req, res) => {
  const project = getProjectFromQuery(req, res);
  if (!project) return;

  const current = project.dailyState.getCurrentPresenter();
  if (!current) {
    return res.send(successPage('Daily não ativa', 'Não há daily em andamento.', 'ℹ️'));
  }
  const error = req.query.error === '1';
  res.send(skipPage(current, BASE_URL, project.id, error));
});

app.post('/actions/skip', async (req, res) => {
  const projectId = req.query.project;
  const project = projectId ? projectManager.get(projectId) : null;

  if (!project) {
    return res.send(successPage('Projeto não encontrado', 'Não foi possível identificar o projeto.', '❌'));
  }

  const { justification } = req.body;

  if (!justification || !justification.trim()) {
    return res.redirect(`/actions/skip?project=${projectId}&error=1`);
  }

  const { dailyState, webhookUrl, id } = project;
  const current = dailyState.getCurrentPresenter();
  if (!current) {
    return res.send(successPage('Daily não ativa', 'Não há daily em andamento.', 'ℹ️'));
  }

  const result = dailyState.skip(justification.trim());
  await postDailyCard(dailyState.getState(), BASE_URL, id, webhookUrl, {
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
//  Fallback SPA
// ─────────────────────────────────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  const projects = projectManager.list();
  console.log(`\n🚀 Daily Standup Bot rodando em ${BASE_URL}`);
  console.log(`   Projetos: ${projects.length}`);
  console.log(`   Cron padrão: ${CRON_DAILY}\n`);
});
