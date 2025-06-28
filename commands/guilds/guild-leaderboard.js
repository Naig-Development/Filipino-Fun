const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require("discord.js");
const Guild = require("../../schema/guild.js");
const { calculateXPForLevel } = require("../../utils/xpUtils.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("guild-leaderboard")
    .setDescription("View the guild leaderboard")
    .addStringOption((option) =>
      option
        .setName("period")
        .setDescription("Time period for the leaderboard")
        .setRequired(false)
        .addChoices(
          { name: "All Time", value: "total" },
          { name: "Weekly", value: "weekly" },
          { name: "Monthly", value: "monthly" }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName("page")
        .setDescription("Page number (default: 1)")
        .setRequired(false)
        .setMinValue(1)
    ),

  async execute(interaction) {
      const period = interaction.options.getString("period") || "total";
      const page = interaction.options.getInteger("page") || 1;
      const guildsPerPage = 10;
      const skip = (page - 1) * guildsPerPage;
  
      // Determine sort field based on period
      let sortField = "totalXP";
      let titlePeriod = "All Time";
      
      if (period === "weekly") {
        sortField = "weeklyXP";
        titlePeriod = "Weekly";
      } else if (period === "monthly") {
        sortField = "monthlyXP";
        titlePeriod = "Monthly";
      }
  
      // Get guilds sorted by XP
      const guilds = await Guild.find({ suspended: false })
        .sort({ [sortField]: -1 })
        .skip(skip)
        .limit(guildsPerPage);
  
      const totalGuilds = await Guild.countDocuments({ suspended: false });
      const totalPages = Math.ceil(totalGuilds / guildsPerPage);
  
      if (guilds.length === 0) {
        return interaction.reply({
          content: "\`❌\` No active guilds found!",
          flags: MessageFlags.Ephemeral,
        });
      }
  
      // Create leaderboard embed
      const leaderboardEmbed = new EmbedBuilder()
        .setTitle(`\`🏆\` guild Leaderboard - ${titlePeriod}`)
        .setDescription(`Showing page ${page} of ${totalPages}`)
        .setColor("#FFD700")
        .setTimestamp();
  
      let leaderboardText = "";
      let currentRank = skip + 1;
  
      for (const guild of guilds) {
        const xpValue = guild[sortField] || 0;
        const xpForNextLevel = calculateXPForLevel(guild.level + 1);
        const progressPercentage = Math.floor((guild.xpToNextLevel / xpForNextLevel) * 100);
  
        // Get rank emoji
        let rankEmoji = `**${currentRank}.**`;
        if (currentRank === 1) rankEmoji = "`🥇`";
        else if (currentRank === 2) rankEmoji = "`🥈`";
        else if (currentRank === 3) rankEmoji = "`🥉`";
  
        // Get owner info
        let ownerInfo = "Unknown Owner";
        try {
          const owner = await interaction.client.users.fetch(guild.owner);
          ownerInfo = owner.username;
        } catch (error) {
          ownerInfo = "Unknown Owner";
        }
  
        leaderboardText += `${rankEmoji} **${guild.name}**\n`;
        leaderboardText += `${guild.iconUrl || "<:filipinoGuilds:1379211588464152608>"} Level ${guild.level} • ${xpValue.toLocaleString()} XP\n`;
        leaderboardText += `<:guildOwner:1379167072101077063> ${ownerInfo} • \`👥\` ${guild.members.length}/${guild.maxMembers}\n\n`;
  
        currentRank++;
      }
  
      leaderboardEmbed.setDescription(leaderboardText);
  
      // Add footer with user's guild position if they're in one
      const userGuild = await Guild.findOne({ members: interaction.user.id });
      if (userGuild && !userGuild.suspended) {
        const userGuildRank = await Guild.countDocuments({
          [sortField]: { $gt: userGuild[sortField] },
          suspended: false
        }) + 1;
  
        leaderboardEmbed.setFooter({
          text: `Your guild "${userGuild.name}" is ranked #${userGuildRank} with ${userGuild[sortField].toLocaleString()} XP`
        });
      }
  
      await interaction.reply({
        embeds: [leaderboardEmbed],
        ephemeral: false,
      });
    },
};