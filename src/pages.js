function skipPage(name, baseUrl, error = false) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pular participante</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1a1a2e;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1rem;
    }
    .card {
      background: #16213e;
      border: 1px solid #0f3460;
      border-radius: 16px;
      padding: 2rem;
      width: 100%;
      max-width: 420px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4);
    }
    .icon { font-size: 2.5rem; margin-bottom: 0.5rem; }
    h1 { color: #e94560; font-size: 1.4rem; margin-bottom: 0.25rem; }
    .name { color: #a8b2d8; font-size: 1rem; margin-bottom: 1.5rem; }
    .name strong { color: #fff; }
    label {
      display: block;
      color: #8892b0;
      font-size: 0.8rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 0.5rem;
    }
    textarea {
      width: 100%;
      background: #0d1b2a;
      border: 1px solid #0f3460;
      border-radius: 8px;
      color: #ccd6f6;
      font-size: 0.95rem;
      padding: 0.75rem;
      resize: vertical;
      min-height: 90px;
      outline: none;
      transition: border-color 0.2s;
      font-family: inherit;
    }
    textarea:focus { border-color: #e94560; }
    .error {
      background: rgba(233,69,96,0.1);
      border: 1px solid #e94560;
      border-radius: 8px;
      color: #e94560;
      font-size: 0.85rem;
      padding: 0.6rem 0.8rem;
      margin-bottom: 1rem;
    }
    .actions {
      display: flex;
      gap: 0.75rem;
      margin-top: 1.25rem;
    }
    button {
      flex: 1;
      padding: 0.75rem;
      border-radius: 8px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: opacity 0.2s, transform 0.1s;
    }
    button:active { transform: scale(0.97); }
    .btn-skip { background: #e94560; color: #fff; }
    .btn-skip:hover { opacity: 0.9; }
    .btn-cancel { background: #0f3460; color: #a8b2d8; }
    .btn-cancel:hover { opacity: 0.8; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">⏭</div>
    <h1>Pular participante</h1>
    <p class="name">Vez de: <strong>${name}</strong></p>

    ${error ? '<div class="error">⚠️ Justificativa é obrigatória para pular.</div>' : ''}

    <form method="POST" action="${baseUrl}/actions/skip">
      <label for="just">Justificativa *</label>
      <textarea
        id="just"
        name="justification"
        placeholder="Ex: ausência, problema técnico, reunião paralela…"
        autofocus
        required
      ></textarea>

      <div class="actions">
        <button type="button" class="btn-cancel" onclick="window.close()">Cancelar</button>
        <button type="submit" class="btn-skip">⏭ Confirmar Pulo</button>
      </div>
    </form>
  </div>
</body>
</html>`;
}

function successPage(title, message, emoji = '✅') {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #1a1a2e;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #16213e;
      border: 1px solid #0f3460;
      border-radius: 16px;
      padding: 2.5rem 2rem;
      text-align: center;
      max-width: 380px;
      width: 90%;
    }
    .icon { font-size: 3rem; margin-bottom: 1rem; }
    h1 { color: #ccd6f6; font-size: 1.3rem; margin-bottom: 0.5rem; }
    p { color: #8892b0; font-size: 0.9rem; line-height: 1.5; }
    .close {
      margin-top: 1.5rem;
      display: inline-block;
      background: #0f3460;
      color: #a8b2d8;
      padding: 0.6rem 1.5rem;
      border-radius: 8px;
      cursor: pointer;
      border: none;
      font-size: 0.9rem;
    }
  </style>
  <script>setTimeout(() => window.close(), 3000);</script>
</head>
<body>
  <div class="card">
    <div class="icon">${emoji}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <button class="close" onclick="window.close()">Fechar</button>
  </div>
</body>
</html>`;
}

module.exports = { skipPage, successPage };
