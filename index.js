const fs = require("fs");
const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} = require("discord.js");
const dotenv = require("dotenv");

dotenv.config();

// Discordクライアント初期化
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

// コマンドの読み込み
client.commands = new Collection();
const commandFiles = fs
  .readdirSync("./commands")
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

// ダミーHTTPサーバー（Render等の監視対策。Vercelでは不要）
require("http")
  .createServer((_, res) => res.end("Bot is running"))
  .listen(process.env.PORT || 3000);

// Bot準備完了時
client.once("ready", async () => {
  console.log("Botが起動しました。");
  console.log("参加しているサーバー:");
  for (const guild of client.guilds.cache.values()) {
    try {
      const updatedGuild = await guild.fetch();
      const owner = await client.users.fetch(updatedGuild.ownerId);
      console.log(`- サーバー名: ${updatedGuild.name}`);
      console.log(`- サーバーID: ${updatedGuild.id}`);
      console.log(`- オーナー名: ${owner.tag}`);
      console.log(`- オーナーID: ${updatedGuild.ownerId}`);
      console.log("--------------------------");
    } catch (err) {
      console.error("サーバー情報の取得に失敗:", err);
    }
  }

  // スラッシュコマンドの登録
  try {
    const data = Array.from(client.commands.values()).map((cmd) => cmd.data);
    await client.application.commands.set(data);
    console.log("スラッシュコマンドを登録しました。");
  } catch (err) {
    console.error("スラッシュコマンド登録エラー:", err);
  }
});

// コマンド相互作用の処理
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: "コマンドの内部でエラーが発生しました。",
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: "コマンドの内部でエラーが発生しました。",
        ephemeral: true,
      });
    }
  }
});

// DiscordBotの起動
client.login(process.env.DISCORD_TOKEN);
