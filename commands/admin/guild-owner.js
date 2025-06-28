const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require("discord.js");
const config = require("../../config.js");
const logger = require("../../utils/logger.js");
const Guild = require("../../schema/guild.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("guild-owner")
    .setDescription("Manage Guild Owner role (Bot only)")
    .addSubcommand(subcommand =>
      subcommand
        .setName("add")
        .setDescription("Add Guild Owner role to a user")
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("User to give Guild Owner role")
            .setRequired(true)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName("remove")
        .setDescription("Remove Guild Owner role from a user")
        .addUserOption(option =>
          option
            .setName("user")
            .setDescription("User to remove Guild Owner role from")
            .setRequired(true)
        )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    try {
      // Check if user is bot developer or has admin permissions
      const isDeveloper = interaction.user.id === config.developerId;
      const hasAdminPerms = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

      if (!isDeveloper && !hasAdminPerms) {
        return await interaction.reply({
          content: "\`❌\` You don't have permission to use this command!",
          flags: MessageFlags.Ephermeral
        });
      }

      const subcommand = interaction.options.getSubcommand();
      const targetUser = interaction.options.getUser("user");
      const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

      if (!targetMember) {
        return await interaction.reply({
          content: "\`❌\` User not found in this server!",
          flags: MessageFlags.Ephermeral
        });
      }

      const guildOwnerRole = interaction.guild.roles.cache.get(config.GuildOwnerRoleId);
      if (!guildOwnerRole) {
        return await interaction.reply({
          content: "\`❌\` Guild Owner role not found!",
          flags: MessageFlags.Ephermeral
        });
      }

      if (subcommand === "add") {
        // Check if user already has the role
        if (targetMember.roles.cache.has(config.GuildOwnerRoleId)) {
          return await interaction.reply({
            content: `\`⚠️\` ${targetUser.tag} already has the Guild Owner role!`,
            flags: MessageFlags.Ephermeral
          });
        }        // Add the role
        // Mark this as an authorized change
        const changeKey = `${targetUser.id}_${config.GuildOwnerRoleId}_add`;
        global.authorizedRoleChanges = global.authorizedRoleChanges || new Set();
        global.authorizedRoleChanges.add(changeKey);
        
        await targetMember.roles.add(guildOwnerRole, `Guild Owner role added by ${interaction.user.tag} via bot command`);

        const successEmbed = new EmbedBuilder()
          .setTitle("\`✅\` Guild Owner Role Added")
          .setDescription(`Successfully added Guild Owner role to ${targetUser.tag}`)
          .addFields(
            { name: "User", value: `<@${targetUser.id}>`, inline: true },
            { name: "Added by", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Role", value: `<@&${config.GuildOwnerRoleId}>`, inline: true }
          )
          .setColor(0x00ff00)
          .setTimestamp();

        await interaction.reply({ embeds: [successEmbed], flags: MessageFlags.Ephermeral });

        // Log the action
        logger.info(`Guild Owner role added to ${targetUser.tag} by ${interaction.user.tag}`);

      } else if (subcommand === "remove") {
        // Check if user has the role
        if (!targetMember.roles.cache.has(config.GuildOwnerRoleId)) {
          return await interaction.reply({
            content: `\`⚠️\` ${targetUser.tag} doesn't have the Guild Owner role!`,
            flags: MessageFlags.Ephermeral
          });
        }

        // Check if user owns a guild - warn about suspension
        const ownedGuild = await Guild.findOne({ owner: targetUser.id });
        if (ownedGuild && !ownedGuild.suspended) {
          const warningEmbed = new EmbedBuilder()
            .setTitle("\`⚠️\`Warning: Guild Suspension")
            .setDescription(`Removing Guild Owner role from ${targetUser.tag} will suspend their guild: **${ownedGuild.name}**`)
            .addFields(
              { name: "Guild", value: ownedGuild.name, inline: true },
              { name: "Owner", value: `<@${targetUser.id}>`, inline: true },
              { name: "Consequence", value: "Guild will be suspended and deleted in 3 days if role isn't restored", inline: false }
            )
            .setColor(0xff9900)
            .setTimestamp();

          await interaction.reply({ embeds: [warningEmbed], flags: MessageFlags.Ephermeral });
        }        // Remove the role
        // Mark this as an authorized change
        const changeKey = `${targetUser.id}_${config.GuildOwnerRoleId}_remove`;
        global.authorizedRoleChanges = global.authorizedRoleChanges || new Set();
        global.authorizedRoleChanges.add(changeKey);
        
        await targetMember.roles.remove(guildOwnerRole, `Guild Owner role removed by ${interaction.user.tag} via bot command`);

        const successEmbed = new EmbedBuilder()
          .setTitle("\`✅\` Guild Owner Role Removed")
          .setDescription(`Successfully removed Guild Owner role from ${targetUser.tag}`)
          .addFields(
            { name: "User", value: `<@${targetUser.id}>`, inline: true },
            { name: "Removed by", value: `<@${interaction.user.id}>`, inline: true },
            { name: "Role", value: `<@&${config.GuildOwnerRoleId}>`, inline: true }
          )
          .setColor(0xff0000)
          .setTimestamp();

        if (!ownedGuild) {
          await interaction.followUp({ embeds: [successEmbed], flags: MessageFlags.Ephermeral });
        } else {
          await interaction.followUp({ embeds: [successEmbed], flags: MessageFlags.Ephermeral });
        }

        // Log the action
        logger.info(`Guild Owner role removed from ${targetUser.tag} by ${interaction.user.tag}`);
      }

    } catch (error) {
      logger.error("Error in guild-owner command:", error);
      await interaction.reply({
        content: "\`❌\` An error occurred while managing the Guild Owner role!",
        flags: MessageFlags.Ephermeral
      }).catch(() => {});
    }
  },
};