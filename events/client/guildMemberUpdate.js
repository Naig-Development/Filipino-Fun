const config = require("../../config.js");
const logger = require("../../utils/logger.js");
const Guild = require("../../schema/guild.js");
const { EmbedBuilder } = require("discord.js");
const {
  sendManageGuildEmbed,
  sendCreateGuildEmbed,
  checkSuspensions,
  sendLogMessage,
  convertEmojiToUrl,
  userActions,
  checkUserPermissions, // Add the new function
  // Guild Invitation Utils
  getPendingInvitations,
  cancelInvitation,
  cancelAllGuildInvitations,
  getInvitationStats,
  cleanupOldInvitations,
  notifyOwner,
} = require("../../utils/guildUtils.js");

// Import live board updates
const { updateGuildBoard } = require("../../utils/liveGuildBoard.js");

// Global variable to track authorized role changes
global.authorizedRoleChanges = global.authorizedRoleChanges || new Set();

module.exports = {
  name: "guildMemberUpdate",
  async execute(oldMember, newMember) {
    try {
      const guildOwnerRoleId = config.GuildOwnerRoleId;
      const guildAdminRoleId = "1381355306218688633";
      // Get the audit log to check who made the role change
      const auditLogs = await newMember.guild
        .fetchAuditLogs({
          type: 25, // MEMBER_ROLE_UPDATE
          limit: 1,
        })
        .catch(() => null);

      // Check if the bot made this change
      const isBotChange =
        auditLogs?.entries.first()?.executor?.id === newMember.client.user.id;

      // Don't skip bot changes completely, we need to handle suspension logic for authorized changes
      //logger.info(`Role change detected for ${newMember.user.tag}. Bot change: ${isBotChange}`);

      // ============ GUILD OWNER ROLE PROTECTION ============
      // Check for unauthorized Guild Owner role additions
      if (
        !oldMember.roles.cache.has(guildOwnerRoleId) &&
        newMember.roles.cache.has(guildOwnerRoleId)
      ) {
        // Check if this was an authorized change
        const changeKey = `${newMember.id}_${guildOwnerRoleId}_add`;
        if (!global.authorizedRoleChanges.has(changeKey) && !isBotChange) {
          // Unauthorized addition - remove the role
          await newMember.roles.remove(
            guildOwnerRoleId,
            "Unauthorized Guild Owner role addition - removed by bot protection"
          );

          logger.warn(
            `Unauthorized Guild Owner role addition detected and removed from ${newMember.user.tag}`
          );

          // Try to notify user about protection
          try {
            const warningEmbed = new EmbedBuilder()
              .setTitle("`🛡️` Role Protection")
              .setDescription("The Guild Owner role was automatically removed")
              .addFields(
                {
                  name: "Reason",
                  value: "This role can only be assigned through bot commands",
                  inline: false,
                },
                {
                  name: "How to get it",
                  value: "Ask an administrator to use `/guild-owner add @user`",
                  inline: false,
                }
              )
              .setColor(0xff4444)
              .setTimestamp();

            await newMember.send({ embeds: [warningEmbed] }).catch(() => {});
          } catch (error) {
            logger.error("Failed to notify user about role protection:", error);
          }
          return; // Exit early to prevent guild suspension logic
        } else if (global.authorizedRoleChanges.has(changeKey)) {
          // Remove from authorized changes set for bot changes
          global.authorizedRoleChanges.delete(changeKey);
          logger.info(
            `Authorized Guild Owner role addition for ${newMember.user.tag}`
          );
        }
      } // Check for unauthorized Guild Owner role removals
      if (
        oldMember.roles.cache.has(guildOwnerRoleId) &&
        !newMember.roles.cache.has(guildOwnerRoleId)
      ) {
        // Check if this was an authorized change
        const changeKey = `${newMember.id}_${guildOwnerRoleId}_remove`;
        if (!global.authorizedRoleChanges.has(changeKey) && !isBotChange) {
          // Check if user actually owns a guild
          const ownedGuild = await Guild.findOne({ owner: newMember.id });
          if (ownedGuild && !ownedGuild.suspended) {
            // Unauthorized removal - restore the role
            await newMember.roles.add(
              guildOwnerRoleId,
              "Unauthorized Guild Owner role removal - restored by bot protection"
            );

            logger.warn(
              `Unauthorized Guild Owner role removal detected and restored for ${newMember.user.tag}`
            );

            // Try to notify user about protection
            try {
              const warningEmbed = new EmbedBuilder()
                .setTitle("`🛡️` Role Protection")
                .setDescription(
                  "The Guild Owner role was automatically restored"
                )
                .addFields(
                  {
                    name: "Reason",
                    value: "This role can only be removed through bot commands",
                    inline: false,
                  },
                  {
                    name: "Your Guild",
                    value: `**${ownedGuild.name}** requires you to have this role`,
                    inline: false,
                  },
                  {
                    name: "How to remove it",
                    value:
                      "Ask an administrator to use `/guild-owner remove @user`",
                    inline: false,
                  }
                )
                .setColor(0x44ff44)
                .setTimestamp();

              await newMember.send({ embeds: [warningEmbed] }).catch(() => {});
            } catch (error) {
              logger.error(
                "Failed to notify user about role protection:",
                error
              );
            }
            return; // Exit early to prevent guild suspension logic
          }
        } else if (global.authorizedRoleChanges.has(changeKey)) {
          // Remove from authorized changes set and handle suspension logic
          global.authorizedRoleChanges.delete(changeKey);
          logger.info(
            `Authorized Guild Owner role removal for ${newMember.user.tag}`
          );

          // Handle authorized Guild Owner role removal (suspension logic)
          const guild = await Guild.findOne({ owner: newMember.id });
          if (guild && !guild.suspended) {
            await Guild.findOneAndUpdate(
              { name: guild.name },
              { suspended: true, suspensionDate: new Date() }
            );
            logger.warn(
              `Guild ${guild.name} suspended for ${
                newMember.user.tag
              } at ${new Date()}`
            );
            const suspensionEmbed = new EmbedBuilder()
              .setColor(0xff4444)
              .setTitle("`⚠️` Guild Suspended")
              .setDescription(
                `Your guild **\`${guild.name}\`** has been suspended`
              )
              .addFields(
                {
                  name: "Reason",
                  value: "Guild Owner role removed",
                  inline: false,
                },
                {
                  name: "`⏰` Time Limit",
                  value:
                    "Your guild will be deleted in **`3 days`** unless you regain the required role",
                  inline: false,
                },
                {
                  name: "`📋` What to do",
                  value:
                    "Create a General Ticket and Contact and Staff to Regain your Guild Owner Role.",
                  inline: false,
                }
              )
              .setFooter({
                text: "Guild Management System",
                iconURL: newMember.guild.iconURL(),
              })
              .setTimestamp();

            await newMember
              .send({ embeds: [suspensionEmbed] })
              .catch(logger.error);

            // Update live guild board to reflect suspension
            try {
              await updateGuildBoard(newMember.client, false);
              logger.info(`Updated guild board after suspending ${guild.name}`);
            } catch (error) {
              logger.error(
                "Failed to update guild board after guild suspension:",
                error
              );
            }
          }
        }
      }
      // ============ GUILD ADMIN ROLE PROTECTION ============
      // Check for unauthorized Guild Admin role additions
      if (
        !oldMember.roles.cache.has(guildAdminRoleId) &&
        newMember.roles.cache.has(guildAdminRoleId)
      ) {
        const changeKey = `${newMember.id}_${guildAdminRoleId}_add`;
        if (!global.authorizedRoleChanges.has(changeKey) && !isBotChange) {
          // Unauthorized addition - remove the role
          await newMember.roles.remove(
            guildAdminRoleId,
            "Unauthorized Guild Admin role addition - removed by bot protection"
          );

          logger.warn(
            `Unauthorized Guild Admin role addition detected and removed from ${newMember.user.tag}`
          );

          // Try to notify user
          try {
            const warningEmbed = new EmbedBuilder()
              .setTitle("`🛡️` Role Protection")
              .setDescription("The Guild Admin role was automatically removed")
              .addFields(
                {
                  name: "Reason",
                  value: "This role can only be assigned through bot commands",
                  inline: false,
                },
                {
                  name: "How to get it",
                  value: "Ask an administrator to use `/guild-admin add @user`",
                  inline: false,
                }
              )
              .setColor(0xff4444)
              .setTimestamp();

            await newMember.send({ embeds: [warningEmbed] }).catch(() => {});
          } catch (error) {
            logger.error("Failed to notify user about role protection:", error);
          }
          return;
        } else if (global.authorizedRoleChanges.has(changeKey)) {
          global.authorizedRoleChanges.delete(changeKey);
        }
      }

      // Check for unauthorized Guild Admin role removals
      if (
        oldMember.roles.cache.has(guildAdminRoleId) &&
        !newMember.roles.cache.has(guildAdminRoleId)
      ) {
        const changeKey = `${newMember.id}_${guildAdminRoleId}_remove`;
        if (!global.authorizedRoleChanges.has(changeKey) && !isBotChange) {
          // Check if user is actually a guild admin in any guild
          const guild = await Guild.findOne({ admins: newMember.id });
          if (guild) {
            // Unauthorized removal - restore the role
            await newMember.roles.add(
              guildAdminRoleId,
              "Unauthorized Guild Admin role removal - restored by bot protection"
            );

            logger.warn(
              `Unauthorized Guild Admin role removal detected and restored for ${newMember.user.tag}`
            );

            // Try to notify user about protection
            try {
              const warningEmbed = new EmbedBuilder()
                .setTitle("`🛡️` Role Protection")
                .setDescription(
                  "The Guild Admin role was automatically restored"
                )
                .addFields(
                  {
                    name: "Reason",
                    value: "This role can only be removed through bot commands",
                    inline: false,
                  },
                  {
                    name: "Your Guild",
                    value: `**${guild.name}** requires you to have this role as an admin`,
                    inline: false,
                  },
                  {
                    name: "How to remove it",
                    value:
                      "Ask an administrator to use `/guild-admin remove @user`",
                    inline: false,
                  }
                )
                .setColor(0x44ff44)
                .setTimestamp();

              await newMember.send({ embeds: [warningEmbed] }).catch(() => {});
            } catch (error) {
              logger.error(
                "Failed to notify user about role protection:",
                error
              );
            }
            return;
          }
        } else if (global.authorizedRoleChanges.has(changeKey)) {
          // Remove from authorized changes set
          global.authorizedRoleChanges.delete(changeKey);
        }
      }

      // Handle authorized Guild Owner role removal (suspension logic)
      if (
        oldMember.roles.cache.has(config.GuildOwnerRoleId) &&
        !newMember.roles.cache.has(config.GuildOwnerRoleId)
      ) {
        const guild = await Guild.findOne({ owner: newMember.id });
        if (guild && !guild.suspended) {
          await Guild.findOneAndUpdate(
            { name: guild.name },
            { suspended: true, suspensionDate: new Date() }
          );
          logger.warn(
            `Guild ${guild.name} suspended for ${
              newMember.user.tag
            } at ${new Date()}`
          );

          const suspensionEmbed = new EmbedBuilder()
            .setColor(0xff4444)
            .setTitle("`⚠️`Guild Suspended")
            .setDescription(
              `Your guild **\`${guild.name}\`** has been suspended`
            )
            .addFields(
              {
                name: "Reason",
                value: "Guild Owner role removed",
                inline: false,
              },
              {
                name: "`⏰` Time Limit",
                value:
                  "Your guild will be deleted in **`3 days`** unless you regain the required role",
                inline: false,
              },
              {
                name: "`📋` What to do",
                value:
                  "Create a General Ticket and Contact and Staff to Regain your Guild Owner Role.",
                inline: false,
              }
            )
            .setFooter({
              text: "Guild Management System",
              iconURL: newMember.guild.iconURL(),
            })
            .setTimestamp();

          await newMember
            .send({ embeds: [suspensionEmbed] })
            .catch(logger.error);
        }
      } else if (
        !oldMember.roles.cache.has(config.GuildOwnerRoleId) &&
        newMember.roles.cache.has(config.GuildOwnerRoleId)
      ) {
        const guild = await Guild.findOne({ owner: newMember.id });
        if (guild && guild.suspended) {
          await Guild.findOneAndUpdate(
            { name: guild.name },
            { suspended: false, suspensionDate: null }
          );
          logger.info(
            `Guild ${guild.name} reactivated for ${
              newMember.user.tag
            } at ${new Date()}`
          );

          const reactivationEmbed = new EmbedBuilder()
            .setColor(0x00ff44)
            .setTitle("`✅` Guild Reactivated")
            .setDescription(
              `Your guild **\`${guild.name}\`** has been successfully reactivated!`
            )
            .addFields(
              {
                name: "Status",
                value: "Guild Owner role restored",
                inline: false,
              },
              {
                name: "<a:confeti:1379545512507740352> Welcome Back",
                value: "Your guild is now fully operational again",
                inline: false,
              }
            )
            .setFooter({
              text: "Guild Management System",
              iconURL: newMember.guild.iconURL(),
            })
            .setTimestamp();
          await newMember
            .send({ embeds: [reactivationEmbed] })
            .catch(logger.error);

          // Update live guild board to reflect reactivation
          try {
            await updateGuildBoard(newMember.client, false);
            logger.info(`Updated guild board after reactivating ${guild.name}`);
          } catch (error) {
            logger.error(
              "Failed to update guild board after guild reactivation:",
              error
            );
          }

          // Log the reactivation
          await sendLogMessage(
            guild,
            `**Guild Reactivated**: Guild **${guild.name}** was reactivated for <@${newMember.id}> (Guild Owner role restored).`
          );
        }
      }
    } catch (error) {
      logger.error("Unexpected error in guildMemberUpdate handler:", error);
    }

    try {
      const monitoredTags = ["FILO", "filo"]; // Customize with your server's tag(s)
      const roleId = "1387506075720224931"; // The role to assign when a tag matches
      // Force-fetch member to get freshest data
      const member = await newMember.guild.members.fetch(newMember.id, {
        force: true,
      });

      // Access display name (nickname or username)
      const displayName =
        member.nickname || member.user.globalName || member.user.username;

      // Check if any tag matches
      const matchedTag = monitoredTags.find((tag) =>
        displayName?.includes(tag)
      );

      const role = member.guild.roles.cache.get(roleId);
      if (!role) return logger.error("Role not found");

      if (matchedTag && !member.roles.cache.has(role.id)) {
        await member.roles.add(role);
        logger.info(`Tag matched! Assigned role to ${displayName}`);
      } else if (!matchedTag && member.roles.cache.has(role.id)) {
        await member.roles.remove(role);
        logger.info(`Tag removed. Role taken from ${displayName}`);
      }
    } catch (err) {
      logger.error("Error checking tag and assigning role:", err);
    }
  },
};
