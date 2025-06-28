const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const os = require("os");
const client = require("../../index.js");
const config = require("../../config");

module.exports = {
    data: new SlashCommandBuilder()
        .setName("shard")
        .setDescription("Displays shard information about the bot."),
    name: "shard",
    description: "Displays shard information about the bot.",
    prefix: true,

    async execute(interaction) {
        await interaction.deferReply(); // Ensures the interaction is deferred to avoid acknowledgment issues.

        const embed = createShardInfoEmbed(client, interaction.guild, interaction.user);
        await interaction.editReply({ embeds: [embed] }); // Use `editReply` to send the final response.
    },

    async run(message) {
        const embed = createShardInfoEmbed(client, message.guild, message.author);
        await message.channel.send({ embeds: [embed] });
    },
};

// Helper: Creates the shard info embed
function createShardInfoEmbed(client, guild, user) {
  const shardId = guild.shardId;
  const shard = client.ws.shards.get(shardId);
  const totalShards = client.ws.shards.size;

  // Calculate uptime
  const uptime = client.uptime / 1000;
  const uptimeHours = Math.floor(uptime / 3600);
  const uptimeMinutes = Math.floor((uptime % 3600) / 60);
  const uptimeSeconds = Math.floor(uptime % 60);

  // Gather shard information
  const shardInfo = {
    id: shardId,
    ping: shard.ping,
    uptime: `${uptimeHours}h ${uptimeMinutes}m ${uptimeSeconds}s`,
    guilds: client.guilds.cache.filter((g) => g.shardId === shardId).size,
    users: client.guilds.cache.reduce(
      (acc, guild) =>
        acc + (guild.shardId === shardId ? guild.memberCount : 0),
      0
    ),
    totalShards: totalShards,
  };

  // Define ping and color
  let pingEmoji = "<:GoodConnection:1357782415078064178>";
  let embedColor = config.embedColors.green;

  if (shardInfo.ping >= 800) {
    embedColor = config.embedColors.red;
    pingEmoji = "<:LowConnection:1357782435617706186>";
  } else if (shardInfo.ping >= 500) {
    embedColor = config.embedColors.yellow;
    pingEmoji = "<:IdleConnection:1357782428034535497>";
  }

  const memoryUsage = process.memoryUsage();
  const totalMemory = os.totalmem();
  const usedMemory = (memoryUsage.heapUsed / 1024 / 1024).toFixed(2);
  const totalMemoryInGB = (totalMemory / 1024 / 1024 / 1024).toFixed(2);
  const cpuUsage = (process.cpuUsage().user / 1024 / 1024).toFixed(2);
  const bl = "<:blank:1357782747677982860>";

  return new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(`Shard Information - Shard ${shardInfo.id}`)
    .setDescription(
      `**\`🆔\` Shard ${shardInfo.id}**\n` +
        `${bl}${pingEmoji} **PING:** \`${shardInfo.ping}\`\n` +
        `${bl}\`⏳\` **Uptime:** \`${shardInfo.uptime}\`\n` +
        `${bl}${bl}\`⚙️\` **Stats:**\n` +
        `${bl}${bl}\`💾\` **RAM:** \`${usedMemory} MB / ${totalMemoryInGB} GB\`\n` +
        `${bl}${bl}\`🖥️\` **CPU:** \`${cpuUsage}%\`\n` +
        `${bl}\`🌐\` **Guilds:** \`${shardInfo.guilds}\`\n` +
        `${bl}\`👥\` **Users:** \`${shardInfo.users}\`\n` +
        `${bl}\`🔢\` **Total Shards:** \`${shardInfo.totalShards}\`\n`
    )
    .setFooter({
      text: `Requested by ${user.username} • ${new Date().toLocaleDateString()}`,
      iconURL: user.displayAvatarURL({ dynamic: true }),
    })
    .setTimestamp();
}
