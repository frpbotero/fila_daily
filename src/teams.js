const axios = require('axios');

const WEEKDAYS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function formatDate() {
  const now = new Date();
  const day = WEEKDAYS[now.getDay()];
  const date = `${now.getDate()} de ${MONTHS[now.getMonth()]}`;
  return { day: day.charAt(0).toUpperCase() + day.slice(1), date };
}

function buildProgressBar(current, total) {
  if (total === 0) return '';
  const filled = Math.round((current / total) * 10);
  return '▓'.repeat(filled) + '░'.repeat(10 - filled) + ` ${current}/${total}`;
}

/**
 * Main daily card — shows current presenter + queue
 */
function buildDailyCard(stateData, baseUrl, projectId, skipInfo = null) {
  const { current, presented, remaining, skips, total, progress } = stateData;
  const { day, date } = formatDate();

  const skipNotice = skipInfo
    ? [
        {
          type: 'TextBlock',
          text: `⏭ **${skipInfo.skipped}** foi pulado(a) — _"${skipInfo.justification}"_`,
          color: 'Warning',
          wrap: true,
          spacing: 'Small',
        },
      ]
    : [];

  const presentedItems =
    presented.length > 0
      ? presented.map((p) => ({
          type: 'TextBlock',
          text: `✅ ${p}`,
          color: 'Good',
          size: 'Small',
          spacing: 'None',
        }))
      : [];

  const remainingItems =
    remaining.length > 0
      ? remaining.map((p, i) => {
          const isSkipped = skips.some((s) => s.name === p);
          return {
            type: 'TextBlock',
            text: `${i + 1 + 1}. ${p}${isSkipped ? ' _(pulado)_' : ''}`,
            color: isSkipped ? 'Warning' : 'Default',
            size: 'Small',
            spacing: 'None',
            isSubtle: true,
          };
        })
      : [
          {
            type: 'TextBlock',
            text: '_Último participante!_',
            isSubtle: true,
            size: 'Small',
            spacing: 'None',
          },
        ];

  const nextUrl = `${baseUrl}/actions/next?project=${projectId}`;
  const skipUrl = `${baseUrl}/actions/skip?project=${projectId}`;

  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.2',
    body: [
      // Header
      {
        type: 'ColumnSet',
        columns: [
          {
            type: 'Column',
            width: 'stretch',
            items: [
              {
                type: 'TextBlock',
                text: '🗓 Daily Standup',
                weight: 'Bolder',
                size: 'Medium',
                color: 'Accent',
              },
              {
                type: 'TextBlock',
                text: `${day} · ${date}`,
                isSubtle: true,
                size: 'Small',
                spacing: 'None',
              },
            ],
          },
          {
            type: 'Column',
            width: 'auto',
            items: [
              {
                type: 'TextBlock',
                text: buildProgressBar(progress, total),
                size: 'Small',
                isSubtle: true,
                horizontalAlignment: 'Right',
              },
            ],
          },
        ],
      },

      ...skipNotice,

      // Current presenter spotlight
      {
        type: 'Container',
        items: [
          {
            type: 'TextBlock',
            text: 'É a vez de:',
            size: 'Small',
            isSubtle: true,
            spacing: 'None',
          },
          {
            type: 'TextBlock',
            text: `🎤 ${current}`,
            size: 'ExtraLarge',
            weight: 'Bolder',
            color: 'Accent',
            spacing: 'None',
          },
        ],
        spacing: 'Medium',
      },

      // Presented
      ...(presentedItems.length > 0
        ? [
            {
              type: 'TextBlock',
              text: 'JÁ APRESENTARAM',
              size: 'Small',
              weight: 'Bolder',
              isSubtle: true,
              spacing: 'Medium',
            },
            ...presentedItems,
          ]
        : []),

      // Remaining
      {
        type: 'TextBlock',
        text: 'PRÓXIMOS',
        size: 'Small',
        weight: 'Bolder',
        isSubtle: true,
        spacing: 'Medium',
        separator: true,
      },
      ...remainingItems,
    ],
    actions: [
      {
        type: 'Action.OpenUrl',
        title: '✅ Concluído',
        url: nextUrl,
      },
      {
        type: 'Action.OpenUrl',
        title: '⏭ Pular',
        url: skipUrl,
      },
    ],
  };
}

/**
 * Completion card — daily finished
 */
function buildCompletionCard(stateData) {
  const { total, skips } = stateData;
  const { day, date } = formatDate();

  const skipLines =
    skips.length > 0
      ? skips.map((s) => ({
          type: 'TextBlock',
          text: `⏭ **${s.name}**: _"${s.justification}"_`,
          wrap: true,
          size: 'Small',
          spacing: 'None',
        }))
      : [{ type: 'TextBlock', text: '_Nenhuma_', isSubtle: true, size: 'Small' }];

  return {
    type: 'AdaptiveCard',
    $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
    version: '1.2',
    body: [
      {
        type: 'TextBlock',
        text: '🎉 Daily concluída!',
        weight: 'Bolder',
        size: 'Large',
        color: 'Good',
        separator: true,
      },
      {
        type: 'TextBlock',
        text: `${day} · ${date} · ${total} participante${total !== 1 ? 's' : ''}`,
        isSubtle: true,
        size: 'Small',
        spacing: 'None',
      },
      {
        type: 'TextBlock',
        text: 'PULADOS HOJE',
        size: 'Small',
        weight: 'Bolder',
        isSubtle: true,
        spacing: 'Medium',
      },
      ...skipLines,
      {
        type: 'TextBlock',
        text: '↺ Ordem restaurada para a próxima daily (alfabética)',
        isSubtle: true,
        size: 'Small',
        wrap: true,
        spacing: 'Medium',
      },
    ],
  };
}

async function postToTeams(card, webhookUrl) {
  if (!webhookUrl) {
    console.warn('⚠️  Webhook URL não configurado — card não enviado ao Teams');
    return false;
  }

  try {
    await axios.post(webhookUrl, card, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000,
    });
    console.log('✅ Card enviado ao Teams via Power Automate');
    return true;
  } catch (err) {
    console.error('❌ Erro ao enviar ao Teams:', err.response?.data || err.message);
    return false;
  }
}

async function postDailyCard(stateData, baseUrl, projectId, webhookUrl, skipInfo = null) {
  const card = buildDailyCard(stateData, baseUrl, projectId, skipInfo);
  return postToTeams(card, webhookUrl);
}

async function postDailyCompleted(stateData, webhookUrl) {
  const card = buildCompletionCard(stateData);
  return postToTeams(card, webhookUrl);
}

module.exports = { postDailyCard, postDailyCompleted, buildDailyCard, buildCompletionCard };
