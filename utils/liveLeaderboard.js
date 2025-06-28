const { EmbedBuilder } = require("discord.js");
const Guild = require("../schema/guild.js");
const config = require("../config.js");
const logger = require("./logger.js");

const LEADERBOARD_CHANNEL_ID = "1375178798508802139";

async function createLeaderboardEmbed(period = "total") {  let sortField = "totalXP";
  let titlePeriod = "`🏆` All Time";
  let description = "**Top Guilds ranked by total XP earned**";
  
  if (period === "weekly") {
    sortField = "weeklyXP";
    titlePeriod = "`📅` Weekly";
    description = "**Top Guilds this week**";
  } else if (period === "monthly") {
    sortField = "monthlyXP";
    titlePeriod = "`📅` Monthly";
    description = "**Top Guilds this month**";
  }

  // Get top 10 guilds
  const guilds = await Guild.find({ suspended: false })
    .sort({ [sortField]: -1 })
    .limit(10);

  if (guilds.length === 0) {    return new EmbedBuilder()
      .setTitle(`${titlePeriod} Guild Leaderboard`)
      .setDescription("\`❌\` No active Guilds found!")
      .setColor(config.embedColors.red)
      .setTimestamp();
  }

  const embed = new EmbedBuilder()
    .setTitle(`${titlePeriod} Guild Leaderboard`)
    .setDescription(description)
    .setColor(config.embedColors.gold)
    .setTimestamp()
    .setFooter({ text: "🔄 Updates every 30 minutes" });

  let leaderboardText = "";
  
  for (let i = 0; i < guilds.length; i++) {
    const guild = guilds[i];
    const rank = i + 1;
    const xpValue = guild[sortField] || 0;
      // Get rank emoji
    let rankEmoji = `**${rank}.**`;
    if (rank === 1) rankEmoji = "`🥇`";
    else if (rank === 2) rankEmoji = "`🥈`";
    else if (rank === 3) rankEmoji = "`🥉`";
    else if (rank <= 5) rankEmoji = "`🏅`";
    else if (rank <= 10) rankEmoji = "`⭐`";

    // Format XP with level information
    const levelInfo = guild.level > 1 ? ` • Level ${guild.level}` : "";
    const memberCount = guild.members ? guild.members.length : 0;
      leaderboardText += `${rankEmoji} **${guild.name}**${levelInfo}\n`;
    leaderboardText += `${guild.iconUrl || "<:filipinoGuilds:1379211588464152608>"} ${xpValue.toLocaleString()} XP • \`👥\` ${memberCount}\n\n`;
  }

  embed.setDescription(`${description}\n\n${leaderboardText}`);
  
  return embed;
}

async function sendLiveLeaderboard(client) {
  try {
    const channel = await client.channels.fetch(LEADERBOARD_CHANNEL_ID).catch(err => {
      logger.error(`Failed to fetch leaderboard channel ${LEADERBOARD_CHANNEL_ID}:`, err.message);
      return null;
    });
    
    if (!channel || !channel.isTextBased()) {
      logger.error('Leaderboard channel not found or not text-based:', LEADERBOARD_CHANNEL_ID);
      return;
    }

    // Create embeds for all three periods
    const totalEmbed = await createLeaderboardEmbed("total");
    const weeklyEmbed = await createLeaderboardEmbed("weekly");
    const monthlyEmbed = await createLeaderboardEmbed("monthly");

    // Check for existing leaderboard message
    const messages = await channel.messages.fetch({ limit: 10 }).catch(() => new Map());
    const botMessage = messages.find(
      (msg) =>
        msg.author.id === client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].title && 
        msg.embeds[0].title.includes("Guild Leaderboard")
    );

    const embeds = [totalEmbed, weeklyEmbed, monthlyEmbed];

    if (botMessage) {
      await botMessage.edit({ embeds });
      logger.info('Updated live leaderboard');
    } else {
      await channel.send({ embeds });
      logger.info('Sent new live leaderboard');
    }

  } catch (error) {
    logger.error("Error updating live leaderboard:", error);
  }
}

async function initializeLiveLeaderboard(client) {
  // Send initial leaderboard
  await sendLiveLeaderboard(client);
  
  // Set up 30-minute interval
  setInterval(async () => {
    await sendLiveLeaderboard(client);
  }, 30 * 60 * 1000); // 30 minutes
  
  logger.info('Live leaderboard initialized - updates every 30 minutes');
}

module.exports = {
  createLeaderboardEmbed,
  sendLiveLeaderboard,
  initializeLiveLeaderboard,
  LEADERBOARD_CHANNEL_ID
};