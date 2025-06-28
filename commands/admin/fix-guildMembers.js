const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const Guild = require("../../schema/guild.js");
const config = require("../../config.js");
const logger = require("../../utils/logger.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("fix-guild-members")
    .setDescription("Fix missing guild roles for all guild members (Admin only)")
    .addBooleanOption(option =>
      option
        .setName("dry-run")
        .setDescription("Preview changes without applying them")
        .setRequired(false)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // Check if user has administrator permissions
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return await interaction.reply({
        content: "`❌` You need Administrator permissions to use this command!",
        ephemeral: true,
      });
    }

    const dryRun = interaction.options.getBoolean("dry-run") || false;
    
    await interaction.deferReply({ ephemeral: true });

    try {      // Get all guilds from database
      const guilds = await Guild.find({});
      
      logger.info(`🔍 Found ${guilds.length} guilds in database`);
      guilds.forEach(guild => {
        logger.debug(`📊 Guild: "${guild.name}" | Members: ${guild.members.length} | RoleId: ${guild.roleId || 'NONE'}`);
      });
      
      if (guilds.length === 0) {
        logger.warn("❌ No guilds found in the database!");
        return await interaction.editReply({
          content: "`❌` No guilds found in the database!",
        });
      }

      let totalProcessed = 0;
      let totalFixed = 0;
      let totalSkipped = 0;
      let totalErrors = 0;
      const results = [];

      // Process each guild
      for (const guild of guilds) {
        const guildResult = {
          name: guild.name,
          roleId: guild.roleId,
          processed: 0,
          fixed: 0,
          skipped: 0,
          errors: 0,
          errorDetails: []
        };        // Skip guilds without roleId
        if (!guild.roleId) {
          logger.warn(`❌ Guild "${guild.name}" has no roleId - skipping`);
          guildResult.errors++;
          guildResult.errorDetails.push("No role ID found");
          results.push(guildResult);
          totalErrors++;
          continue;
        }

        // Check if role exists in Discord
        const discordRole = interaction.guild.roles.cache.get(guild.roleId);
        if (!discordRole) {
          logger.error(`❌ Role ${guild.roleId} not found in Discord for guild "${guild.name}"`);
          guildResult.errors++;
          guildResult.errorDetails.push("Role not found in Discord");
          results.push(guildResult);
          totalErrors++;
          continue;
        }

        logger.info(`✅ Found Discord role: ${discordRole.name} (${guild.roleId}) for guild "${guild.name}"`);
        logger.debug(`🎭 Role details: Color: ${discordRole.hexColor}, Position: ${discordRole.position}, Mentionable: ${discordRole.mentionable}`);// Process each member in the guild
        logger.info(`🔍 Processing guild "${guild.name}" with ${guild.members.length} members, roleId: ${guild.roleId}`);
        
        for (const memberId of guild.members) {
          guildResult.processed++;
          totalProcessed++;

          try {
            logger.debug(`🔍 Processing member ${memberId} for guild "${guild.name}"`);
            
            // Fetch the Discord member
            const discordMember = await interaction.guild.members.fetch(memberId).catch(() => null);
            
            if (!discordMember) {
              logger.warn(`❌ Member ${memberId} not found in Discord for guild "${guild.name}"`);
              guildResult.errors++;
              guildResult.errorDetails.push(`Member ${memberId} not found in Discord`);
              totalErrors++;
              continue;
            }

            logger.debug(`✅ Found Discord member: ${discordMember.user.tag} (${memberId})`);
            logger.debug(`🎭 Current roles: [${discordMember.roles.cache.map(r => `${r.name}(${r.id})`).join(', ')}]`);
            logger.debug(`🔍 Checking for role: ${discordRole.name} (${guild.roleId})`);

            // Check if member already has the role
            if (discordMember.roles.cache.has(guild.roleId)) {
              logger.debug(`✅ Member ${discordMember.user.tag} already has role ${discordRole.name}`);
              guildResult.skipped++;
              totalSkipped++;
              continue;
            }

            logger.info(`🔧 Member ${discordMember.user.tag} is missing role ${discordRole.name} - ${dryRun ? 'would add' : 'adding'} role`);

            // Add the role if not in dry-run mode
            if (!dryRun) {
              // Mark this as an authorized change
              const changeKey = `${memberId}_${guild.roleId}_add`;
              global.authorizedRoleChanges = global.authorizedRoleChanges || new Set();
              global.authorizedRoleChanges.add(changeKey);
              
              logger.debug(`🔐 Marked role change as authorized: ${changeKey}`);

              await discordMember.roles.add(guild.roleId, `Guild role fix by ${interaction.user.tag}`);
              logger.info(`✅ Successfully added role ${discordRole.name} to ${discordMember.user.tag}`);
              
              // Verify the role was added
              await discordMember.fetch(); // Refresh member data
              if (discordMember.roles.cache.has(guild.roleId)) {
                logger.info(`✅ Verified: Role ${discordRole.name} successfully added to ${discordMember.user.tag}`);
              } else {
                logger.error(`❌ Role verification failed: ${discordRole.name} not found on ${discordMember.user.tag} after adding`);
              }
            } else {
              logger.info(`🔍 DRY RUN: Would add role ${discordRole.name} to ${discordMember.user.tag}`);
            }

            guildResult.fixed++;
            totalFixed++;

          } catch (error) {
            logger.error(`❌ Error fixing role for member ${memberId} in guild ${guild.name}:`, error);
            logger.error(`❌ Error details:`, {
              memberId,
              guildName: guild.name,
              roleId: guild.roleId,
              roleName: discordRole?.name,
              errorMessage: error.message,
              errorStack: error.stack
            });
            guildResult.errors++;
            guildResult.errorDetails.push(`Error with member ${memberId}: ${error.message}`);
            totalErrors++;
          }
        }

        results.push(guildResult);
      }

      // Create summary embed
      const summaryEmbed = new EmbedBuilder()
        .setTitle(`🔧 Guild Member Role Fix ${dryRun ? "(Dry Run)" : "Complete"}`)
        .setDescription(
          dryRun 
            ? "**Preview Mode**: No changes were applied. Run without `dry-run` to apply fixes."
            : "**Live Mode**: Changes have been applied to Discord roles."
        )
        .addFields(
          { 
            name: "📊 Summary", 
            value: `**Guilds Processed:** ${guilds.length}\n**Members Processed:** ${totalProcessed}\n**Roles ${dryRun ? 'Would Be ' : ''}Fixed:** ${totalFixed}\n**Already Had Role:** ${totalSkipped}\n**Errors:** ${totalErrors}`,
            inline: false 
          }
        )
        .setColor(dryRun ? 0xffaa00 : (totalErrors > 0 ? 0xff6600 : 0x00ff00))
        .setTimestamp()
        .setFooter({ 
          text: `Executed by ${interaction.user.tag}`, 
          iconURL: interaction.user.displayAvatarURL() 
        });

      // Add detailed results for each guild
      let detailsText = "";
      for (const result of results) {
        if (result.processed > 0 || result.errors > 0) {
          detailsText += `**${result.name}**\n`;
          detailsText += `└ Processed: ${result.processed} | Fixed: ${result.fixed} | Skipped: ${result.skipped} | Errors: ${result.errors}\n`;
          
          if (result.errorDetails.length > 0) {
            detailsText += `└ Issues: ${result.errorDetails.slice(0, 2).join(", ")}${result.errorDetails.length > 2 ? ` (+${result.errorDetails.length - 2} more)` : ""}\n`;
          }
          detailsText += "\n";
        }
      }

      if (detailsText.length > 0) {
        // Split details if too long
        if (detailsText.length > 1024) {
          summaryEmbed.addFields({
            name: "📋 Guild Details (Truncated)",
            value: detailsText.substring(0, 1020) + "...",
            inline: false
          });
        } else {
          summaryEmbed.addFields({
            name: "📋 Guild Details",
            value: detailsText || "No details to show",
            inline: false
          });
        }
      }

      // Add usage tip
      if (dryRun && totalFixed > 0) {
        summaryEmbed.addFields({
          name: "💡 Next Steps",
          value: "Run the command again without `dry-run: True` to apply these fixes.",
          inline: false
        });
      }

      await interaction.editReply({
        embeds: [summaryEmbed]
      });      // Log the action
      logger.info(`🎯 Guild member role fix ${dryRun ? '(dry run) ' : ''}completed by ${interaction.user.tag}`);
      logger.info(`📊 Final Summary: Processed: ${totalProcessed}, Fixed: ${totalFixed}, Skipped: ${totalSkipped}, Errors: ${totalErrors}`);
      
      if (totalErrors > 0) {
        logger.warn(`⚠️ ${totalErrors} errors occurred during processing. Check logs above for details.`);
      }
      
      if (!dryRun && totalFixed > 0) {
        logger.info(`✅ Successfully applied ${totalFixed} role fixes to Discord members`);
      }

    } catch (error) {
      logger.error("Error in fix-guild-members command:", error);
      await interaction.editReply({
        content: "`❌` An error occurred while fixing guild member roles. Please check the logs.",
      });
    }
  },
};