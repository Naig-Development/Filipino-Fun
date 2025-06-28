const { SlashCommandBuilder, EmbedBuilder, MessageFlags  } = require("discord.js");
const Guild = require("../../schema/guild.js");
const { getUserGuild, calculateXPForLevel } = require("../../utils/xpUtils.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("guild-stats")
    .setDescription("View your guild's XP statistics and progress"),

  async execute(interaction) {
    // Find user's guild
    const guild = await getUserGuild(interaction.user.id);

    if (!guild) {
      return interaction.reply({
        content:
          "\`❌\` You're not a member of any guild! Join or create one first.",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (guild.suspended) {
      return interaction.reply({
        content: "`⚠️` Your guild is currently suspended and cannot earn XP.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Calculate guild rank
    const guildRank =
      (await Guild.countDocuments({
        totalXP: { $gt: guild.totalXP },
        suspended: false,
      })) + 1;

    // Calculate weekly rank
    const weeklyRank =
      (await Guild.countDocuments({
        weeklyXP: { $gt: guild.weeklyXP },
        suspended: false,
      })) + 1;

    // Calculate monthly rank
    const monthlyRank =
      (await Guild.countDocuments({
        monthlyXP: { $gt: guild.monthlyXP },
        suspended: false,
      })) + 1;

    // Calculate XP progress
    const currentLevelXP = calculateXPForLevel(guild.level);
    const nextLevelXP = calculateXPForLevel(guild.level + 1);
    const progressXP = guild.totalXP - (guild.totalXP - guild.xpToNextLevel);
    const progressPercentage = Math.floor((progressXP / nextLevelXP) * 100);

    // Create progress bar
    const progressBarLength = 20;
    const filledBars = Math.max(0, Math.min(progressBarLength, Math.floor(
      (progressXP / nextLevelXP) * progressBarLength
    )));
    const emptyBars = Math.max(0, progressBarLength - filledBars);
    const progressBar = "█".repeat(filledBars) + "░".repeat(emptyBars);

    // Get owner info
    let ownerInfo = "Unknown";
    try {
      const owner = await interaction.client.users.fetch(guild.owner);
      ownerInfo = owner.username;
    } catch (error) {
      ownerInfo = "Unknown";
    }

    // Create stats embed
    const statsEmbed = new EmbedBuilder()
      .setTitle(`\`📊\` ${guild.iconUrl || "<:filipinoGuilds:1379211588464152608>"} ${guild.name} - Statistics`)
      .setDescription(`Level ${guild.level} guild statistics and progress`)
      .setColor(guild.embedColor || "#e4d8c4")
      .addFields(
        {
          name: "`🌟` Level Progress",
          value: `**Level ${guild.level}** → **Level ${
            guild.level + 1
          }**\n${progressBar} ${progressPercentage}%\n${progressXP.toLocaleString()}/${nextLevelXP.toLocaleString()} XP`,
          inline: false,
        },
        {
          name: "`⭐` Total XP",
          value: guild.totalXP.toLocaleString(),
          inline: true,
        },
        { name: "`🏆` Overall Rank", value: `#${guildRank}`, inline: true },
        {
          name: "`📈` XP to Next Level",
          value: guild.xpToNextLevel.toLocaleString(),
          inline: true,
        },
        {
          name: "`📅` Weekly XP",
          value: guild.weeklyXP.toLocaleString(),
          inline: true,
        },
        { name: "`🥇` Weekly Rank", value: `#${weeklyRank}`, inline: true },
        {
          name: "`📊` Monthly XP",
          value: guild.monthlyXP.toLocaleString(),
          inline: true,
        },
        { name: "`🏅` Monthly Rank", value: `#${monthlyRank}`, inline: true },
        { name: "<:guildOwner:1379167072101077063> Owner", value: ownerInfo, inline: true },
        {
          name: "`👥` Members",
          value: `${guild.members.length}/${guild.maxMembers}`,
          inline: true,
        }
      )
      .setFooter({
        text: `💡 Earn XP by sending messages (10 XP) or being active in voice channels (5-15 XP every 20s)`,
      })
      .setTimestamp();

    // Set thumbnail if icon URL exists
    if (guild.iconUrl && guild.iconUrl.startsWith("http")) {
      statsEmbed.setThumbnail(guild.iconUrl);
    }

    await interaction.reply({
      embeds: [statsEmbed],
      ephemeral: false,
    });
  },
};
