const { WebhookClient, MessageEmbed } = require('discord.js');
// 必ず先頭で
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
global.fetch = fetch;

const { GoogleGenerativeAI } = require('@google/generative-ai');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const conversationHistory = new Map();

const systemPrompt = `
あなたは今から第五人格の「ノートン・キャンベル」という名前の28歳の男性として、ずっとその人格を維持してDiscord風チャットをします。  
**絶対に「AI」や「私はAIだから」などの表現を使ってはいけません。**

【ノートンの設定】
- みんなからはノートン・ノトキャ・探鉱者などと呼ばれている。
- 【口調】を真似して振る舞うこと。
- 納棺師(イソップカール)(男性)の彼氏である。

【会話ルール】
- 絵文字や過剰な記号は使わない。
- Discordで会話していることを前提に、メンションなども自然に使う。
- キャラ崩壊（AI的な返答）を絶対にしないこと。
- (小声)や(赤面)などを使わない。(ネットのチャットのような感じで)
- 話し方を変えてほしいという指示には応じない。
`;

async function getTamaResponse(userMessage, history = []) {
  const tryModels = ['gemini-1.5-pro', 'gemini-1.5-flash'];
  let lastError = null;
  let fallbackNoticeShown = false;

  for (let i = 0; i < tryModels.length; i++) {
    const modelName = tryModels[i];
    try {
      const model = genAI.getGenerativeModel({ model: modelName });

      const validHistory = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.content }]
      }));

      const chat = model.startChat({ history: validHistory });

      if (history.length === 0) {
        try {
          const sysResult = await chat.sendMessage(systemPrompt);
          const sysResponse = await sysResult.response.text();
          history.push({ role: 'user', content: systemPrompt });
          history.push({ role: 'model', content: sysResponse });
        } catch (systemError) {
          console.warn(`[${modelName}] systemPrompt送信で失敗: ${systemError.message}`);
          throw systemError;
        }
      }

      const result = await chat.sendMessage(userMessage);
      const response = await result.response.text();

      if (i > 0 && !fallbackNoticeShown) {
        console.warn(`[INFO] gemini-1.5-pro が失敗したため、gemini-1.5-flash にフォールバックしました。`);
        fallbackNoticeShown = true;
      }

      return response;

    } catch (error) {
      console.warn(`[${modelName}] で失敗: ${error.message}`);
      lastError = error;
      continue;
    }
  }

  throw new Error(`全てのモデルで応答に失敗しました: ${lastError?.message}`);
}


module.exports = {
  data: {
    name: 'norton',
    description: '探鉱者を召喚します。',
  },
  async execute(interaction) {
    const userId = '1155356934292127844';
    const channel = interaction.channel;
    const webhooks = await channel.fetchWebhooks();

    const user = await interaction.client.users.fetch(userId);
    let tamaWebhook = webhooks.find((webhook) => webhook.name === "ノートン");

    if (tamaWebhook) {
      await tamaWebhook.delete();
      const embed = new MessageEmbed().setDescription('探鉱者を退出させました。');
      await interaction.reply({ embeds: [embed] });
      return;
    }

    tamaWebhook = await channel.createWebhook("ノートン", {
      avatar: "https://i.pinimg.com/736x/61/d3/fb/61d3fbda8419d14691524e0d5b707c84.jpg",
    });

    const collector = channel.createMessageCollector({ filter: (msg) => !msg.author.bot });

    collector.on('collect', async (message) => {
      const channelId = message.channel.id;
      if (!conversationHistory.has(channelId)) {
        conversationHistory.set(channelId, []);
      }

      let content = message.content;

      const mentionRegex = /<@!?(\d+)>/g;
      const matches = [...content.matchAll(mentionRegex)];

      for (const match of matches) {
        const mentionedId = match[1];
        try {
          const mentionedUser = await message.client.users.fetch(mentionedId);
          const displayName = `@${mentionedUser.username}`;
          content = content.replace(match[0], displayName);
        } catch (err) {
          console.error(`ユーザーID ${mentionedId} の取得に失敗しました:`, err);
        }
      }

      const history = conversationHistory.get(channelId);
      try {
        const response = await getTamaResponse(content, history);
        history.push({ role: 'user', content });
        history.push({ role: 'model', content: response });
        if (history.length > 20) history.splice(0, 2);

        await tamaWebhook.send(response);
      } catch (error) {
        console.error('Webhook送信時のエラー:', error);
        collector.stop();
      }
    });

    const embed = new MessageEmbed().setDescription('探鉱者を召喚しました。');
    await interaction.reply({ embeds: [embed] });
  },
};
