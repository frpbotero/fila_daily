# 📋 Daily Standup Bot

Serviço de automação da daily com integração nativa ao **Microsoft Teams**.  
Hospede no **Render** e gerencie a ordem de apresentação com Adaptive Cards interativos.

---

## ✨ Funcionalidades

| Feature | Descrição |
|---|---|
| **Lista de participantes** | Cadastre, ordene e remova participantes |
| **Ordem automática** | Ao iniciar, ordena alfabeticamente |
| **Pular com justificativa** | Participante pulado vai para a posição logo após o próximo |
| **Reset automático** | Ao finalizar, volta à ordem alfabética |
| **Teams Adaptive Cards** | Card bonito com botões "✅ Concluído" e "⏭ Pular" |
| **Cron automático** | Inicia a daily automaticamente de Seg–Sex às 09:00 |
| **Web UI** | Interface local para gerenciar tudo |

---

## 🚀 Deploy no Render

### 1. Fork / clone o repositório

```bash
git clone <repo-url>
cd daily-standup-bot
```

### 2. Configurar webhook do Teams

No Microsoft Teams:
1. Vá até o canal onde quer receber os cards
2. `...` → **Conectores** → **Incoming Webhook**
3. Crie e copie a URL do webhook

### 3. Deploy no Render

1. Acesse [render.com](https://render.com) → **New Web Service**
2. Conecte seu repositório GitHub
3. Configure:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Adicione as variáveis de ambiente:

| Variável | Valor | Obrigatório |
|---|---|---|
| `TEAMS_WEBHOOK_URL` | URL do webhook do Teams | ✅ |
| `BASE_URL` | `https://seu-app.onrender.com` | ✅ |
| `TZ` | `America/Sao_Paulo` | Recomendado |
| `CRON_DAILY` | `0 9 * * 1-5` (seg-sex 09h) | Opcional |
| `PORT` | `3000` | Automático |

5. Deploy! 🎉

---

## 🔗 Endpoints da API

### Participantes
```
POST   /api/participants          # Adicionar: { "name": "Ana" }
DELETE /api/participants/:name    # Remover por nome
```

### Daily
```
GET    /api/state                 # Estado atual
POST   /api/start                 # Iniciar daily (posta card no Teams)
POST   /api/next                  # Avançar para próximo
POST   /api/skip                  # Pular: { "justification": "motivo" }
POST   /api/reset                 # Resetar ordem
GET    /api/history               # Histórico de ações
```

### Chamada manual via curl
```bash
# Iniciar a daily manualmente
curl -X POST https://seu-app.onrender.com/api/start

# Adicionar participante
curl -X POST https://seu-app.onrender.com/api/participants \
  -H "Content-Type: application/json" \
  -d '{"name": "João Silva"}'
```

---

## 📱 Como funciona no Teams

1. **Às 09:00 de Seg–Sex** (ou ao chamar `/api/start`), o bot posta um card no Teams:

```
┌─────────────────────────────────────┐
│ 🗓 Daily Standup                    │
│ Segunda-feira · 12 de jan           │
├─────────────────────────────────────┤
│ É a vez de:                         │
│                                     │
│  🎤 Ana Souza                       │
│                                     │
│ PRÓXIMOS                            │
│  2. Bruno Lima                      │
│  3. Carlos Dias                     │
├─────────────────────────────────────┤
│ [✅ Concluído]  [⏭ Pular]          │
└─────────────────────────────────────┘
```

2. **✅ Concluído** → abre uma página de confirmação e avança para o próximo
3. **⏭ Pular** → abre formulário pedindo justificativa, move a pessoa para depois do próximo
4. Ao finalizar → card de conclusão + ordem resetada

---

## ⌨️ Atalhos na Web UI

| Tecla | Ação |
|---|---|
| `N` | Próximo participante |
| `S` | Pular (abre modal de justificativa) |
| `Esc` | Fechar modal |

---

## 🔧 Desenvolvimento local

```bash
npm install
cp .env.example .env   # configure as variáveis
npm run dev            # nodemon com hot-reload
```

Acesse: http://localhost:3000

---

## 📁 Estrutura

```
daily-standup/
├── src/
│   ├── server.js     # Express + rotas + cron
│   ├── state.js      # Gerenciamento de estado (persistido em JSON)
│   ├── teams.js      # Adaptive Cards + webhook
│   └── pages.js      # HTML das páginas de ação
├── public/
│   └── index.html    # Web UI
├── data/
│   └── state.json    # Estado persistido (auto-criado)
└── package.json
```
