const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, MessageFlags } = require("discord.js");
const Guild = require("../../schema/guild.js");
const { getUserGuild, calculateXPForLevel } = require("../../utils/xpUtils.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("guild-info")
    .setDescription("View detailed information about a guild"),

  async execute(interaction) {
    try {
      // Fetch all guilds from database (including suspended ones for debugging)
      const allGuilds = await Guild.find({})
      .select('name suspended')
      .sort({ totalXP: -1 })
      .limit(25);

      console.log(`Found ${allGuilds.length} total guilds in database`);
      
      // Filter only non-suspended guilds
      const guilds = allGuilds.filter(guild => !guild.suspended);
      
      console.log(`Found ${guilds.length} active guilds`);

      if (!guilds || guilds.length === 0) {
        return interaction.reply({
          content: "\`❌\` No active guilds found in the database!",
          flags: MessageFlags.Ephemeral,
        });
      }

      // Helper function to truncate text safely
      const truncateText = (text, maxLength) => {
        if (!text) return 'Unnamed Guild';
        return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
      };

      // Create select menu options with proper length validation
      const options = guilds.map(guild => {
        const guildName = guild.name || 'Unnamed Guild';
        const truncatedName = truncateText(guildName, 100); // Discord limit is 100 chars for label
        const truncatedDescription = truncateText(`View info for ${guildName}`, 100); // Discord limit is 100 chars for description
        
        return {
          label: truncatedName,
          value: guildName, // Keep original name for database lookup
          description: truncatedDescription,
        };
      });

      // Validate options before creating select menu
      if (options.length === 0) {
        return interaction.reply({
          content: "\`❌\` No valid guild options could be created!",
          flags: MessageFlags.Ephemeral,
        });
      }

      console.log(`Creating select menu with ${options.length} options`);

      // Create select menu
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('guild-select')
        .setPlaceholder('Choose a guild to view information')
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      // Send initial message with select menu
      const response = await interaction.reply({
        content: "**Select a guild to view detailed information:**",
        components: [row],
        flags: MessageFlags.Ephemeral,
      });

      // Create collector for select menu interactions
      const collector = response.createMessageComponentCollector({
        componentType: ComponentType.StringSelect,
        time: 60000, // 60 seconds timeout
      });

      collector.on('collect', async (selectInteraction) => {
        if (selectInteraction.user.id !== interaction.user.id) {
          return selectInteraction.reply({
            content: "\`❌\` This select menu is not for you!",
            flags: MessageFlags.Ephemeral,
          });
        }

        const selectedGuildName = selectInteraction.values[0];
        
        console.log(`User selected guild: ${selectedGuildName}`);
        
        // Fetch the selected guild's full information
        const guild = await Guild.findOne({ name: selectedGuildName });

        if (!guild) {
          return selectInteraction.update({
            content: `\`❌\` Guild **${selectedGuildName}** not found!`,
            components: [],
          });
        }

        // Get owner information
        let ownerInfo = "Unknown";
        try {
          const owner = await interaction.client.users.fetch(guild.owner);
          ownerInfo = `<@${guild.owner}> (${owner.tag})`;
        } catch (error) {
          ownerInfo = `<@${guild.owner}> (User not found)`;
        }

        // Get member information
        const memberList = [];
        for (const memberId of guild.members.slice(0, 10)) { // Show max 10 members
          try {
            const member = await interaction.client.users.fetch(memberId);
            memberList.push(`<@${memberId}>`);
          } catch (error) {
            memberList.push(`<@${memberId}> (User not found)`);
          }
        }

        const memberDisplay = memberList.length > 0 
          ? memberList.join(", ") + (guild.members.length > 10 ? `\n... and ${guild.members.length - 10} more` : "")
          : "No members";

        // Calculate guild rank
        const guildRank = await Guild.countDocuments({
          totalXP: { $gt: guild.totalXP },
          suspended: false
        }) + 1;

        // Create info embed
        const infoEmbed = new EmbedBuilder()
          .setTitle(`<:filipinoGuilds:1379211588464152608> ${guild.name}`)
          .setDescription(guild.description || "No description available")
          .setColor(guild.embedColor || "#e4d8c4")
          .addFields(
            { name: "<:guildOwner:1379167072101077063>  Owner", value: ownerInfo, inline: true },
            { name: "\`👥\` Members", value: `${guild.members.length}/${guild.maxMembers || 20}`, inline: true },
            { name: "\`🎨\` Color", value: guild.embedColor || "#e4d8c4", inline: true },
            { name: "\`🌟\` Level", value: guild.level?.toString() || "1", inline: true },
            { name: "\`⭐\` Total XP", value: guild.totalXP?.toLocaleString() || "0", inline: true },
            { name: "\`📈\` XP to Next Level", value: guild.xpToNextLevel?.toLocaleString() || "1000", inline: true },
            { name: "\`🏆\` Rank", value: `#${guildRank}`, inline: true },
            { name: "\`📊\` Weekly XP", value: guild.weeklyXP?.toLocaleString() || "0", inline: true },
            { name: "\`📈\` Monthly XP", value: guild.monthlyXP?.toLocaleString() || "0", inline: true },
            { name: "\`📅\` Created", value: guild.createdAt ? `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:F>` : "Unknown", inline: true },
            { name: "\`👋\` Welcome Messages", value: guild.welcome ? "\`\`✅\`\` Enabled" : "\`❌\` Disabled", inline: true },
            { name: "\`⚠️\` Status", value: guild.suspended ? "🔒 Suspended" : "\`\`✅\`\` Active", inline: true },
            { name: "\`🏷️\` Discord Role", value: guild.roleId ? `<@&${guild.roleId}>` : "No role", inline: false },
            { name: "\`👥\` Members", value: memberDisplay, inline: false }
          )
          .setTimestamp();

        // Set thumbnail if icon URL exists
        if (guild.icon && (guild.icon.startsWith("http") || guild.icon.startsWith("https"))) {
          infoEmbed.setThumbnail(guild.icon);
        }

        // Set banner if exists
        if (guild.banner && (guild.banner.startsWith("http") || guild.banner.startsWith("https"))) {
          infoEmbed.setImage(guild.banner);
        }

        // Update the interaction with the guild information
        await selectInteraction.update({
          content: null,
          embeds: [infoEmbed],
          components: [], // Remove the select menu after selection
        });
      });

      collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
          try {
            await interaction.editReply({
              content: "`⏰` Guild selection timed out. Please run the command again.",
              components: [],
            });
          } catch (error) {
            console.error('Error editing reply on timeout:', error);
          }
        }
      });

    } catch (error) {
      console.error('Error in guild-info command:', error);
      
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({
          content: "\`❌\` An error occurred while fetching guild information.",
          flags: MessageFlags.Ephemeral,
        });
      } else {
        await interaction.editReply({
          content: "\`❌\` An error occurred while fetching guild information.",
          components: [],
        });
      }
    }
  },
};