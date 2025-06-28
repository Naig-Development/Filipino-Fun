const {
  EmbedBuilder,
  MessageFlags,
  TextInputStyle,
  ModalBuilder,
  TextInputBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  UserSelectMenuBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const config = require("../../config.js");
const logger = require("../../utils/logger.js");
const Guild = require("../../schema/guild.js");
const GuildInvitation = require("../../schema/guildInvite.js");
const {
  sendManageGuildEmbed,
  sendCreateGuildEmbed,
  checkSuspensions,
  sendLogMessage,
  convertEmojiToUrl,
  userActions,
  checkUserPermissions, // Add the new function
  checkAdminPermissions, // Add the admin check function
  checkOwnerOnlyPermissions, // Add the owner-only check function
  // Guild Invitation Utils
  getPendingInvitations,
  cancelInvitation,
  cancelAllGuildInvitations,
  getInvitationStats,
  cleanupOldInvitations,
  notifyOwner,
} = require("../../utils/guildUtils.js");
const { checkOneGuildPerUser } = require("../../utils/xpUtils.js");
const { updateGuildBoard } = require("../../utils/liveGuildBoard.js");

module.exports = {
  name: "interactionCreate",
  async execute(interaction, client) {
    try {
      if (interaction.isCommand()) {
        const command = client.slashCommands.get(interaction.commandName);

        if (!command) {
          return interaction.reply({
            content: "This command is not recognized.",
            flags: MessageFlags.Ephemeral,
          });
        }

        try {
          await command.execute(interaction, client);
        } catch (error) {
          logger.error(
            `Error executing command ${interaction.commandName}:`,
            error
          );

          await interaction.reply({
            content:
              "An unexpected error occurred while executing this command. Please try again later.",
            flags: MessageFlags.Ephemeral,
          });

          // Notify developer about the error
          const developerId = config.developerId;
          if (developerId) {
            try {
              const developer = await interaction.client.users.fetch(
                developerId
              );
              if (developer) {
                const developerEmbed = new EmbedBuilder()
                  .setTitle("Command Error")
                  .setColor(0xff0000)
                  .setDescription(
                    `Error Details:\n\`\`\`js\n${error.stack}\n\`\`\``
                  )
                  .addFields(
                    { name: "User", value: interaction.user.tag },
                    { name: "Command Name", value: interaction.commandName }
                  )
                  .setTimestamp();

                await developer.send({ embeds: [developerEmbed] });
              }
            } catch (fetchError) {
              logger.error(
                "Failed to fetch developer for error notification:",
                fetchError
              );
            }
          }
        }
      }

      if (interaction.isButton()) {
        const { customId, user, member, guild: discordGuild } = interaction;

        // Log button interactions
        let guildNameForLog = null;
        if (customId.startsWith("manage_")) {
          const guild = await Guild.findOne({ owner: user.id });
          if (guild) {
            guildNameForLog = guild.name;
            const action = customId.split("_")[1];
            await sendLogMessage(
              client,
              guild,
              `**Button Interaction**: <@${user.id}> interacted with the "${action}" button for guild **${guildNameForLog}**.`
            );
          }
        } else if (customId === "create_guild") {
          await sendLogMessage(
            client,
            { logsChannelId: "1378686966190702702" },
            `**Button Interaction**: <@${user.id}> interacted with the "create_guild" button.`
          );
        }

        if (customId === "create_guild") {
          // Check if user has the Guild Owner role
          if (!member.roles.cache.has(config.GuildOwnerRoleId)) {
            await interaction.reply({
              content: `\`❌\` Only users with the <@&${config.GuildOwnerRoleId}> role can create a Guild!`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          // Check if the user already owns a guild
          const existingGuild = await Guild.findOne({ owner: user.id });
          if (existingGuild) {
            await interaction.reply({
              content: `❌ You already own a Guild (**${existingGuild.name}**) and can only own one Guild at a time!`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          } // Create a modal for guild creation
          const modal = new ModalBuilder()
            .setCustomId("create_guild_modal")
            .setTitle("Create Your Guild");

          const guildNameInput = new TextInputBuilder()
            .setCustomId("guild_name")
            .setLabel("Guild Name")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("Guild Name (max 100 characters)")
            .setRequired(true)
            .setMaxLength(100);

          const guildDescriptionInput = new TextInputBuilder()
            .setCustomId("guild_description")
            .setLabel("Guild Description")
            .setStyle(TextInputStyle.Paragraph)
            .setPlaceholder("Describe your Guild... (max 1000 characters)")
            .setRequired(false)
            .setMaxLength(500);

          const guildColorInput = new TextInputBuilder()
            .setCustomId("guild_color")
            .setLabel("Guild Color (Hex Code)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("e.g., #e4d8c4 (leave empty for default)")
            .setRequired(false)
            .setMaxLength(7);

          const guildIconInput = new TextInputBuilder()
            .setCustomId("guild_icon")
            .setLabel("Guild Icon (Emoji or URL)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("e.g., 👑 or image URL (leave empty for default)")
            .setRequired(false)
            .setMaxLength(200);

          const guildBannerInput = new TextInputBuilder()
            .setCustomId("guild_banner")
            .setLabel("Guild Banner (Image URL)")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder("e.g., https://i.imgur.com/banner.png (optional)")
            .setRequired(false)
            .setMaxLength(500);

          const row1 = new ActionRowBuilder().addComponents(guildNameInput);
          const row2 = new ActionRowBuilder().addComponents(
            guildDescriptionInput
          );
          const row3 = new ActionRowBuilder().addComponents(guildColorInput);
          const row4 = new ActionRowBuilder().addComponents(guildIconInput);
          const row5 = new ActionRowBuilder().addComponents(guildBannerInput);

          modal.addComponents(row1, row2, row3, row4, row5);
          await interaction.showModal(modal);
        }
        if (customId === "select_guild") {
          const guild = await Guild.findOne({ owner: user.id });
          if (!guild) {
            await interaction.reply({
              content: "You do not own a guild!",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await interaction.reply({
            content: `Selected guild **${guild.name}** for management.`,
            flags: MessageFlags.Ephemeral,
          });
        } // Handle manage guild actions
        if (customId.startsWith("manage_")) {
          const action = customId.split("_")[1];

          // Special handling for leave button - no permission check required, only guild membership
          if (action === "leave") {
            // Check if user is in any guild (either as member or admin) - NO PERMISSION CHECK REQUIRED
            const userGuild = await Guild.findOne({
              $or: [{ members: user.id }, { admins: user.id }],
            });

            if (!userGuild) {
              await interaction.reply({
                content: "`❌` You are not a member of any guild!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Check if user is the owner (owners cannot leave)
            if (userGuild.owner === user.id) {
              await interaction.reply({
                content:
                  "`❌` Guild owners cannot leave their guild! You must disband the guild or transfer ownership first.",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Check if user is actually a member of this guild
            if (!userGuild.members.includes(user.id)) {
              await interaction.reply({
                content: "`❌` You are not a member of this guild!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Create confirmation buttons
            const confirmButton = new ButtonBuilder()
              .setCustomId(`confirm_leave_${userGuild.name}`)
              .setLabel("✅ Confirm Leave")
              .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
              .setCustomId("cancel_leave")
              .setLabel("❌ Cancel")
              .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(
              confirmButton,
              cancelButton
            );

            const isAdmin = userGuild.admins.includes(user.id);
            const warningText = isAdmin
              ? "`⚠️` As an admin, you will lose your admin privileges when you leave."
              : "";

            await interaction.reply({
              content: `<:guildLeave:1383366719824724008> **Are you sure you want to leave "${
                userGuild.name
              }"?**\n\n${warningText}\n\nThis action will:\n• Remove you from the guild\n• Remove your guild role\n${
                isAdmin ? "• Remove your admin privileges\n" : ""
              }• You can only rejoin if invited again`,
              components: [row],
              flags: MessageFlags.Ephemeral,
            });
            return; // Exit early for leave action
          }

          // Check if user has Guild Owner or Guild Admin role for all other actions
          const hasGuildOwnerRole = member.roles.cache.has(
            config.GuildOwnerRoleId
          );
          const hasGuildAdminRole = member.roles.cache.has(
            config.GuildAdminRoleId
          );

          if (!hasGuildOwnerRole && !hasGuildAdminRole) {
            await interaction.reply({
              content: `\`❌\` Only users with the <@&${config.GuildOwnerRoleId}> or <@&${config.GuildAdminRoleId}> role can manage guilds!`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          } // Only owner can disband - even admins cannot disband
          if (action === "disband") {
            // Check owner permissions for disband action
            const permissionCheck = await checkOwnerOnlyPermissions(
              interaction
            );
            if (!permissionCheck.hasPermission) {
              return; // Error message already sent by checkOwnerOnlyPermissions
            }
            var guild = permissionCheck.guild;
          } else if (action === "assign-admin") {
            // Only owner can assign admin
            const permissionCheck = await checkOwnerOnlyPermissions(
              interaction
            );
            if (!permissionCheck.hasPermission) {
              return; // Error message already sent by checkOwnerOnlyPermissions
            }
            var guild = permissionCheck.guild;
          } else if (action === "transfer-ownership") {
            // Only owner can transfer ownership
            const permissionCheck = await checkOwnerOnlyPermissions(
              interaction
            );
            if (!permissionCheck.hasPermission) {
              return; // Error message already sent by checkOwnerOnlyPermissions
            }
            var guild = permissionCheck.guild;
          } else {
            // For all other actions, allow both owner and admin
            const permissionCheck = await checkAdminPermissions(interaction);
            if (!permissionCheck.hasPermission) {
              return; // Error message already sent by checkAdminPermissions
            }
            var guild = permissionCheck.guild;
            var isOwner = permissionCheck.isOwner;
            var isAdmin = permissionCheck.isAdmin;
          }

          // Check if guild is suspended (only allow disband)
          if (guild.suspended && action !== "disband") {
            await interaction.reply({
              content:
                "`⚠️` Your Guild is currently suspended. Only the Disband action is available.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          if (action === "invite") {
            // Check if guild has space
            if (guild.members.length >= guild.maxMembers) {
              await interaction.reply({
                content: `\`❌\` **${guild.name}** has reached its maximum member limit (${guild.maxMembers})!`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Create user select menu for inviting members
            const { UserSelectMenuBuilder } = require("discord.js");
            const selectMenu = new UserSelectMenuBuilder()
              .setCustomId(`invite_users_${guild.name}`)
              .setPlaceholder("Select users to invite to your Guild")
              .setMinValues(1)
              .setMaxValues(
                Math.min(5, guild.maxMembers - guild.members.length)
              );

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.reply({
              content: `\`📩\` **Invite Members to "${guild.name}"**\n\nSelect users to invite (${guild.members.length}/${guild.maxMembers} members):`,
              components: [row],
              flags: MessageFlags.Ephemeral,
            });
          } else if (action === "kick") {
            // Get member options excluding the owner
            const memberOptions = [];
            for (const memberId of guild.members) {
              if (memberId !== guild.owner) {
                try {
                  const user = await client.users.fetch(memberId);
                  memberOptions.push({
                    label: user.username,
                    value: memberId,
                    description: `${user.tag} - Click to kick this member`,
                  });
                } catch (error) {
                  memberOptions.push({
                    label: `User ${memberId}`,
                    value: memberId,
                    description: "Click to kick this member",
                  });
                }
              }
            }

            if (memberOptions.length === 0) {
              await interaction.reply({
                content: "`❌` No members to kick (excluding yourself).",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            const { StringSelectMenuBuilder } = require("discord.js");
            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId(`kick_users_${guild.name}`)
              .setPlaceholder("Select members to kick from your Guild")
              .addOptions(memberOptions.slice(0, 25)) // Discord limit
              .setMinValues(1)
              .setMaxValues(Math.min(5, memberOptions.length));

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.reply({
              content: `\`❌\` **Kick Members from "${guild.name}"**\n\nSelect members to remove:`,
              components: [row],
              flags: MessageFlags.Ephemeral,
            });
          } else if (action === "disband") {
            const confirmButton = new ButtonBuilder()
              .setCustomId(`confirm_disband_${guild.name}`)
              .setLabel("✅ Confirm")
              .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
              .setCustomId("cancel_disband")
              .setLabel("❌ Cancel")
              .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(
              confirmButton,
              cancelButton
            );

            await interaction.reply({
              content: `\`⚠️\` **Are you sure you want to disband "${guild.name}"?**\n\nThis action cannot be undone and will:\n• Delete the Guild permanently\n• Remove the Guild role\n• Remove all members`,
              components: [row],
              flags: MessageFlags.Ephemeral,
            });
          } else if (action === "edit-description") {
            const guildName = guild.name;

            // Create a modal for editing the guild description
            const modal = new ModalBuilder()
              .setCustomId(`edit_description_modal_${guildName}`)
              .setTitle("📝 Edit Guild Description");

            const guildDescriptionInput = new TextInputBuilder()
              .setCustomId("guild_description")
              .setLabel("Guild Description")
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder(
                "Enter your guild description (max 500 characters)"
              )
              .setRequired(false)
              .setMaxLength(500)
              .setValue(guild.description || "");

            const row1 = new ActionRowBuilder().addComponents(
              guildDescriptionInput
            );
            modal.addComponents(row1);
            await interaction.showModal(modal);
          } else if (action === "rename") {
            const guildName = guild.name;

            // Create a modal for renaming the guild
            const modal = new ModalBuilder()
              .setCustomId(`rename_guild_modal_${guildName}`)
              .setTitle("✏️ Rename Your Guild");

            const newGuildNameInput = new TextInputBuilder()
              .setCustomId("new_guild_name")
              .setLabel("New Guild Name")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Enter the new Guild name (max 100 characters)")
              .setRequired(true)
              .setMaxLength(100)
              .setValue(guild.name || ""); // Pre-fill with current name

            const row1 = new ActionRowBuilder().addComponents(
              newGuildNameInput
            );
            modal.addComponents(row1);
            await interaction.showModal(modal);
          } else if (action === "change-color") {
            const guildName = guild.name;

            // Create a modal for changing the guild color
            const modal = new ModalBuilder()
              .setCustomId(`change_color_modal_${guildName}`)
              .setTitle("🎨 Change Your Guild Color");

            const guildColorInput = new TextInputBuilder()
              .setCustomId("guild_color")
              .setLabel("Guild Color (Hex Code)")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Enter the Guild color hex code (e.g., #e4d8c4)")
              .setRequired(true)
              .setMaxLength(7)
              .setValue(guild.embedColor || "#e4d8c4"); // Pre-fill with current color

            const row1 = new ActionRowBuilder().addComponents(guildColorInput);
            modal.addComponents(row1);
            await interaction.showModal(modal);
          } else if (action === "change-icon") {
            // Check if user already has an ongoing action
            if (userActions.has(user.id)) {
              const currentAction = userActions.get(user.id);
              await interaction.reply({
                content: `\`❌\` You already have an ongoing **${currentAction.action}** change for **${currentAction.guildName}**!\n\nPlease finish that first before starting a new action.`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            try {
              const timeout = setTimeout(async () => {
                await user
                  .send(
                    `⏰ Time's up! No icon change was made for **${guild.name}**.`
                  )
                  .catch(() => {});
                userActions.delete(user.id);
              }, 5 * 60 * 1000);

              userActions.set(user.id, {
                action: "icon",
                guildName: guild.name,
                timeout,
              });

              await user.send(
                `\`🖼️\` **Change Icon for \`${guild.name}\`**\n\n` +
                  `Please send an image or emoji to set as your Guild icon.\n\n` +
                  `**Accepted formats:** PNG, JPG, JPEG, WEBP\n` +
                  `**Or type:** "remove" to clear the current icon\n\n` +
                  `\`⏰\` You have 5 minutes to complete this action.`
              );
              await interaction.reply({
                content: `\`📬\` I've sent you a DM with instructions to change the icon for **${guild.name}**.`,
                flags: MessageFlags.Ephemeral,
              });
            } catch (error) {
              await interaction.reply({
                content: `\`❌\` I couldn't DM you. Please ensure your DMs are open and try again.`,
                flags: MessageFlags.Ephemeral,
              });
            }
          } else if (action === "change-banner") {
            // Check if user already has an ongoing action
            if (userActions.has(user.id)) {
              const currentAction = userActions.get(user.id);
              await interaction.reply({
                content: `\`❌\` You already have an ongoing **${currentAction.action}** change for **${currentAction.guildName}**!\n\nPlease finish that first before starting a new action.`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            try {
              const timeout = setTimeout(async () => {
                await user
                  .send(
                    `\`⏰\` Time's up! No banner change was made for **${guild.name}**.`
                  )
                  .catch(() => {});
                userActions.delete(user.id);
              }, 5 * 60 * 1000);

              userActions.set(user.id, {
                action: "banner",
                guildName: guild.name,
                timeout,
              });

              await user.send(
                `\`🖼️\` **Change Banner for \`${guild.name}\`**\n\n` +
                  `Please send an image to set as your Guild banner.\n\n` +
                  `**Accepted formats:** PNG, JPG, JPEG, WEBP, GIF\n` +
                  `**Or type:** "remove" to clear the current banner\n\n` +
                  `\`⏰\` You have 5 minutes to complete this action.`
              );
              await interaction.reply({
                content: `\`📬\` I've sent you a DM with instructions to change the banner for **${guild.name}**.`,
                flags: MessageFlags.Ephemeral,
              });
            } catch (error) {
              await interaction.reply({
                content: `\`❌\` I couldn't DM you. Please ensure your DMs are open and try again.`,
                flags: MessageFlags.Ephemeral,
              });
            }
          } else if (action === "toggle-welcome") {
            const enableButton = new ButtonBuilder()
              .setCustomId(`enable_welcome_${guild.name}`)
              .setLabel("✅ Enable Welcome")
              .setStyle(ButtonStyle.Success);

            const disableButton = new ButtonBuilder()
              .setCustomId(`disable_welcome_${guild.name}`)
              .setLabel("❌ Disable Welcome")
              .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(
              enableButton,
              disableButton
            );

            await interaction.reply({
              content: `<:toggleWelcome:1379166874092179587> **Welcome Messages for "${
                guild.name
              }"**\n\nCurrently: ${
                guild.welcome ? "`✅` Enabled" : "`❌` Disabled"
              }\n\nWhat would you like to do?`,
              components: [row],
              flags: MessageFlags.Ephemeral,
            });
          } else if (action === "assign-admin") {
            // Check if guild already has an admin
            if (guild.admins && guild.admins.length > 0) {
              const currentAdmin = await client.users
                .fetch(guild.admins[0])
                .catch(() => null);
              const adminDisplay = currentAdmin
                ? `<@${guild.admins[0]}>`
                : "Unknown User";

              // Create remove admin button
              const removeAdminButton = new ButtonBuilder()
                .setCustomId(`remove_admin_${guild.name}`)
                .setLabel("❌ Remove Admin")
                .setStyle(ButtonStyle.Danger);

              const cancelButton = new ButtonBuilder()
                .setCustomId("cancel_admin_action")
                .setLabel("🔙 Cancel")
                .setStyle(ButtonStyle.Secondary);

              const row = new ActionRowBuilder().addComponents(
                removeAdminButton,
                cancelButton
              );

              await interaction.reply({
                content: `\`⚠️\` **Your guild already has an admin assigned!**\n\nCurrent Admin: ${adminDisplay}\n\nYou can remove the current admin if needed:`,
                components: [row],
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Create user select menu for assigning admin
            const selectMenu = new UserSelectMenuBuilder()
              .setCustomId(`assign_admin_${guild.name}`)
              .setPlaceholder("Select a guild member to assign as admin")
              .setMinValues(1)
              .setMaxValues(1);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.reply({
              content: `\`👤\` **Assign Admin for "${guild.name}"**\n\nSelect a guild member to make them an admin. Admins can invite and kick members but cannot disband the guild.`,
              components: [row],
              flags: MessageFlags.Ephemeral,
            });
          } else if (action === "transfer-ownership") {
            // Get member options excluding the current owner
            const memberOptions = [];
            for (const memberId of guild.members) {
              if (memberId !== guild.owner) {
                try {
                  const user = await client.users.fetch(memberId);
                  memberOptions.push({
                    label: user.username,
                    value: memberId,
                    description: `${user.tag} - Transfer ownership to this member`,
                  });
                } catch (error) {
                  memberOptions.push({
                    label: `User ${memberId}`,
                    value: memberId,
                    description: "Transfer ownership to this member",
                  });
                }
              }
            }

            if (memberOptions.length === 0) {
              await interaction.reply({
                content:
                  "`❌` No members available to transfer ownership to. You need at least one other member in your guild.",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            const { StringSelectMenuBuilder } = require("discord.js");
            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId(`transfer_ownership_${guild.name}`)
              .setPlaceholder(
                "⚠️ Select new owner (THIS ACTION CANNOT BE UNDONE)"
              )
              .addOptions(memberOptions.slice(0, 25)) // Discord limit
              .setMinValues(1)
              .setMaxValues(1);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            await interaction.reply({
              content: `<:addAssistant:1381305561181720697> **Transfer Ownership of "${guild.name}"**\n\n⚠️ **WARNING: This action cannot be undone!**\n\nYou will:\n• Lose all Guild Owner privileges\n• Become a regular member\n• The selected member will become the new owner\n\nSelect the new owner carefully:`,
              components: [row],
              flags: MessageFlags.Ephemeral,
            });
          }
        } // Handle confirmation buttons
        if (customId.startsWith("confirm_disband_")) {
          const guildName = customId.split("_").slice(2).join("_");
          const guild = await Guild.findOne({
            name: guildName,
            owner: user.id,
          });

          if (!guild) {
            await interaction.reply({
              content: "`❌` Guild not found or you are not the owner!",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          if (guild.roleId) {
            const role = discordGuild.roles.cache.get(guild.roleId);
            if (role) await role.delete().catch(logger.error);
          }

          await Guild.deleteOne({ name: guildName });

          // Create disabled button to show action was completed
          const disbandedButton = new ButtonBuilder()
            .setCustomId("guild_disbanded")
            .setLabel("✅ Guild Disbanded")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true);

          const row = new ActionRowBuilder().addComponents(disbandedButton);
          await interaction.update({
            content: `<:disband:1379165323235692554> **Guild "${guildName}" has been disbanded!**\n\nThe Guild and its role have been permanently deleted.`,
            components: [row],
          });

          // Update guild board after disbanding
          try {
            await updateGuildBoard(client, false);
          } catch (error) {
            logger.error(
              "Failed to update guild board after guild disbanding:",
              error
            );
          }
        }
        if (customId === "cancel_disband") {
          // Create disabled button to show action was completed
          const cancelledButton = new ButtonBuilder()
            .setCustomId("disband_cancelled")
            .setLabel("❌ Cancelled")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);

          const row = new ActionRowBuilder().addComponents(cancelledButton);

          await interaction.update({
            content: "`✅` Disband cancelled.",
            components: [row],
          });
        }

        // Handle leave confirmation buttons
        if (customId.startsWith("confirm_leave_")) {
          const guildName = customId.split("_").slice(2).join("_");

          try {
            // Find the guild and verify user is a member
            const guild = await Guild.findOne({ name: guildName });

            if (!guild) {
              await interaction.reply({
                content: "`❌` Guild not found!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Check if user is the owner (owners cannot leave)
            if (guild.owner === user.id) {
              await interaction.reply({
                content: "`❌` Guild owners cannot leave their guild!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Check if user is actually a member
            if (!guild.members.includes(user.id)) {
              await interaction.reply({
                content: "`❌` You are not a member of this guild!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            const isAdmin = guild.admins.includes(user.id);

            // Remove user from guild (both members and admins arrays)
            await Guild.findOneAndUpdate(
              { name: guildName },
              {
                $pull: {
                  members: user.id,
                  admins: user.id,
                },
              }
            );

            // Remove guild role if exists
            if (guild.roleId) {
              try {
                const member = await discordGuild.members.fetch(user.id);
                await member.roles.remove(guild.roleId);
              } catch (error) {
                logger.error("Failed to remove guild role on leave:", error);
              }
            }

            // Remove Guild Admin role if user was an admin
            if (isAdmin) {
              try {
                const member = await discordGuild.members.fetch(user.id);
                if (member.roles.cache.has(config.GuildAdminRoleId)) {
                  // Mark this as an authorized change
                  const changeKey = `${user.id}_${config.GuildAdminRoleId}_remove`;
                  global.authorizedRoleChanges =
                    global.authorizedRoleChanges || new Set();
                  global.authorizedRoleChanges.add(changeKey);

                  await member.roles.remove(config.GuildAdminRoleId);
                }
              } catch (error) {
                logger.error(
                  "Failed to remove Guild Admin role on leave:",
                  error
                );
              }
            }

            // Create disabled button to show action was completed
            const leftButton = new ButtonBuilder()
              .setCustomId("guild_left")
              .setLabel("🚪 Left Guild")
              .setStyle(ButtonStyle.Danger)
              .setDisabled(true);

            const row = new ActionRowBuilder().addComponents(leftButton);

            await interaction.update({
              content: `<:guildLeave:1383366719824724008> **You have successfully left "${guildName}"!**\n\n${
                isAdmin ? "Your admin privileges have been removed.\n" : ""
              }You can only rejoin if invited again.`,
              components: [row],
            });

            // Log member leave
            await sendLogMessage(
              client,
              guild,
              `**Member Left**: <@${
                user.id
              }> voluntarily left the guild **${guildName}**${
                isAdmin ? " (was admin)" : ""
              }.`
            );

            // Notify guild owner about the leave
            try {
              const owner = await client.users.fetch(guild.owner);
              const leaveEmbed = new EmbedBuilder()
                .setTitle("`🚪` Member Left Guild")
                .setDescription(`<@${user.id}> has left **${guildName}**`)
                .addFields(
                  {
                    name: "Member Info",
                    value: `**User:** <@${user.id}>\n**Was Admin:** ${
                      isAdmin ? "Yes" : "No"
                    }`,
                    inline: true,
                  },
                  {
                    name: "Guild Status",
                    value: `**Remaining Members:** ${
                      guild.members.length - 1
                    }/${guild.maxMembers}`,
                    inline: true,
                  }
                )
                .setColor(0xff9900)
                .setTimestamp();

              await owner.send({ embeds: [leaveEmbed] });
            } catch (error) {
              logger.error("Failed to notify owner about member leave:", error);
            }
          } catch (error) {
            logger.error("Error handling guild leave:", error);
            await interaction.reply({
              content:
                "`❌` An error occurred while leaving the guild. Please try again later.",
              flags: MessageFlags.Ephemeral,
            });
          }
        }

        if (customId === "cancel_leave") {
          // Create disabled button to show action was cancelled
          const cancelledButton = new ButtonBuilder()
            .setCustomId("leave_cancelled")
            .setLabel("❌ Cancelled")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);

          const row = new ActionRowBuilder().addComponents(cancelledButton);

          await interaction.update({
            content: "`✅` Leave cancelled.",
            components: [row],
          });
        }

        // Handle transfer ownership confirmation buttons
        if (customId.startsWith("confirm_transfer_")) {
          const parts = customId.split("_");
          const newOwnerId = parts[parts.length - 1];
          const guildName = parts.slice(2, -1).join("_");

          try {
            const guild = await Guild.findOne({
              name: guildName,
              owner: user.id,
            });

            if (!guild) {
              await interaction.reply({
                content: "`❌` Guild not found or you are not the owner!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Final validation
            if (!guild.members.includes(newOwnerId)) {
              await interaction.reply({
                content:
                  "`❌` The selected user is no longer a member of your guild!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            const newOwner = await client.users.fetch(newOwnerId);
            const currentOwner = user;

            // Update guild ownership in database
            await Guild.findOneAndUpdate(
              { name: guildName },
              {
                owner: newOwnerId,
                $pull: { admins: newOwnerId }, // Remove new owner from admins if they were admin
              }
            );

            // Handle Discord role changes
            try {
              const currentOwnerMember = await discordGuild.members.fetch(
                currentOwner.id
              );
              const newOwnerMember = await discordGuild.members.fetch(
                newOwnerId
              );

              // Mark role changes as authorized
              const removeKey = `${currentOwner.id}_${config.GuildOwnerRoleId}_remove`;
              const addKey = `${newOwnerId}_${config.GuildOwnerRoleId}_add`;
              const removeAdminKey = `${newOwnerId}_${config.GuildAdminRoleId}_remove`;

              global.authorizedRoleChanges =
                global.authorizedRoleChanges || new Set();
              global.authorizedRoleChanges.add(removeKey);
              global.authorizedRoleChanges.add(addKey);
              global.authorizedRoleChanges.add(removeAdminKey);

              // Remove Guild Owner role from current owner
              if (currentOwnerMember.roles.cache.has(config.GuildOwnerRoleId)) {
                await currentOwnerMember.roles.remove(config.GuildOwnerRoleId);
              }

              // Add Guild Owner role to new owner
              if (!newOwnerMember.roles.cache.has(config.GuildOwnerRoleId)) {
                await newOwnerMember.roles.add(config.GuildOwnerRoleId);
              }

              // Remove Guild Admin role from new owner if they had it
              if (newOwnerMember.roles.cache.has(config.GuildAdminRoleId)) {
                await newOwnerMember.roles.remove(config.GuildAdminRoleId);
              }
            } catch (roleError) {
              logger.error(
                "Error handling role changes during ownership transfer:",
                roleError
              );
            }

            // Create success button
            const transferredButton = new ButtonBuilder()
              .setCustomId("ownership_transferred")
              .setLabel("✅ Ownership Transferred")
              .setStyle(ButtonStyle.Success)
              .setDisabled(true);

            const row = new ActionRowBuilder().addComponents(transferredButton);

            await interaction.update({
              content: `<:addAssistant:1381305561181720697> **Ownership Successfully Transferred!**\n\n✅ **${newOwner.username}** is now the owner of **${guildName}**\n\nYou are now a regular member of the guild. Thank you for your leadership!`,
              components: [row],
            });

            // Log the ownership transfer
            await sendLogMessage(
              client,
              guild,
              `**Ownership Transferred**: <@${currentOwner.id}> transferred ownership of **${guildName}** to <@${newOwnerId}>.`
            );

            // Notify the new owner
            try {
              const newOwnerEmbed = new EmbedBuilder()
                .setTitle("👑 You Are Now Guild Owner!")
                .setDescription(
                  `You have been promoted to owner of **${guildName}**!`
                )
                .addFields(
                  {
                    name: "Previous Owner",
                    value: `<@${currentOwner.id}>`,
                    inline: true,
                  },
                  {
                    name: "Your New Role",
                    value: "Guild Owner",
                    inline: true,
                  },
                  {
                    name: "Guild Members",
                    value: `${guild.members.length}/${guild.maxMembers}`,
                    inline: true,
                  }
                )
                .setColor(0xffd700)
                .setTimestamp();

              await newOwner.send({ embeds: [newOwnerEmbed] });
            } catch (error) {
              logger.error("Failed to notify new owner:", error);
            }

            // Notify the previous owner
            try {
              const previousOwnerEmbed = new EmbedBuilder()
                .setTitle("👋 Ownership Transfer Complete")
                .setDescription(
                  `You have successfully transferred ownership of **${guildName}**`
                )
                .addFields(
                  {
                    name: "New Owner",
                    value: `<@${newOwnerId}>`,
                    inline: true,
                  },
                  {
                    name: "Your Status",
                    value: "Regular Member",
                    inline: true,
                  }
                )
                .setColor(0x00ff00)
                .setTimestamp();

              await currentOwner.send({ embeds: [previousOwnerEmbed] });
            } catch (error) {
              logger.error("Failed to notify previous owner:", error);
            }
          } catch (error) {
            logger.error("Error during ownership transfer:", error);
            await interaction.reply({
              content:
                "`❌` An error occurred during ownership transfer. Please try again later.",
              flags: MessageFlags.Ephemeral,
            });
          }
        }

        if (customId === "cancel_transfer") {
          // Create disabled button to show action was cancelled
          const cancelledButton = new ButtonBuilder()
            .setCustomId("transfer_cancelled")
            .setLabel("❌ Cancelled")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);

          const row = new ActionRowBuilder().addComponents(cancelledButton);

          await interaction.update({
            content: "`✅` Ownership transfer cancelled.",
            components: [row],
          });
        } // Handle remove admin button
        if (customId.startsWith("remove_admin_")) {
          const guildName = customId.split("_").slice(2).join("_");
          const guild = await Guild.findOne({
            name: guildName,
            owner: user.id,
          });

          if (!guild) {
            await interaction.reply({
              content: "`❌` Guild not found!",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          if (!guild.admins || guild.admins.length === 0) {
            await interaction.reply({
              content: "`❌` No admin to remove!",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          const removedAdminId = guild.admins[0];

          // Remove admin from guild
          await Guild.findOneAndUpdate(
            { name: guildName },
            { $pull: { admins: removedAdminId } }
          );

          // Remove Guild Admin role from Discord member
          try {
            const member = await interaction.guild.members.fetch(
              removedAdminId
            );
            if (member.roles.cache.has(config.GuildAdminRoleId)) {
              // Mark this as an authorized change
              const changeKey = `${removedAdminId}_${config.GuildAdminRoleId}_remove`;
              global.authorizedRoleChanges =
                global.authorizedRoleChanges || new Set();
              global.authorizedRoleChanges.add(changeKey);

              await member.roles.remove(config.GuildAdminRoleId);
            }
          } catch (error) {
            logger.error("Failed to remove Guild Admin role:", error);
          }

          const removedAdmin = await client.users
            .fetch(removedAdminId)
            .catch(() => null);
          const adminDisplay = removedAdmin
            ? removedAdmin.username
            : "Unknown User";

          // Create buttons for next action
          const assignNewAdminButton = new ButtonBuilder()
            .setCustomId(`assign_new_admin_${guildName}`)
            .setLabel("👤 Assign New Admin")
            .setStyle(ButtonStyle.Primary);

          const doneButton = new ButtonBuilder()
            .setCustomId(`admin_action_done`)
            .setLabel("✅ Done")
            .setStyle(ButtonStyle.Success);

          const row = new ActionRowBuilder().addComponents(
            assignNewAdminButton,
            doneButton
          );

          await interaction.update({
            content: `\`✅\` **${adminDisplay}** has been removed as admin from **${guildName}**.\n\nWould you like to assign a new admin?`,
            components: [row],
          });

          // Log the admin removal
          await sendLogMessage(
            client,
            guild,
            `**Admin Removed**: <@${removedAdminId}> was removed as admin from **${guildName}** by <@${user.id}>.`
          );

          // Notify the removed admin
          try {
            if (removedAdmin) {
              await removedAdmin.send(
                `\`👤\` **You have been removed as admin from guild "${guildName}".**\n\nYou are still a member of the guild but no longer have admin privileges.`
              );
            }
          } catch (error) {
            logger.error("Failed to notify removed admin:", error);
          }
        }

        // Handle assign new admin button (after removing current admin)
        if (customId.startsWith("assign_new_admin_")) {
          const guildName = customId.split("_").slice(3).join("_");

          // Create user select menu for assigning new admin
          const selectMenu = new UserSelectMenuBuilder()
            .setCustomId(`assign_admin_${guildName}`)
            .setPlaceholder("Select a guild member to assign as admin")
            .setMinValues(1)
            .setMaxValues(1);

          const row = new ActionRowBuilder().addComponents(selectMenu);

          await interaction.update({
            content: `\`👤\` **Assign New Admin for "${guildName}"**\n\nSelect a guild member to make them an admin. Admins can invite and kick members but cannot disband the guild.`,
            components: [row],
          });
        }

        // Handle admin action done button
        if (customId === "admin_action_done") {
          await interaction.update({
            content: `\`✅\` **Admin management completed!**`,
            components: [],
          });
        }

        // Handle cancel admin action button
        if (customId === "cancel_admin_action") {
          // Create disabled button to show action was cancelled
          const cancelledButton = new ButtonBuilder()
            .setCustomId("admin_action_cancelled")
            .setLabel("❌ Cancelled")
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);

          const row = new ActionRowBuilder().addComponents(cancelledButton);

          await interaction.update({
            content: "`✅` Admin action cancelled.",
            components: [row],
          });
        } // Handle welcome toggle buttons
        if (
          customId.startsWith("enable_welcome_") ||
          customId.startsWith("disable_welcome_")
        ) {
          const isEnable = customId.startsWith("enable_welcome_");
          const guildName = customId.split("_").slice(2).join("_");

          // Check admin permissions for welcome toggle
          const permissionCheck = await checkAdminPermissions(interaction);
          if (!permissionCheck.hasPermission) {
            return; // Error message already sent by checkAdminPermissions
          }

          const guild = permissionCheck.guild;

          // Validate guild name matches
          if (guild.name !== guildName) {
            await interaction.reply({
              content: "`❌` Guild name mismatch! Please try again.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await Guild.findOneAndUpdate(
            { name: guildName },
            { welcome: isEnable }
          ); // Create disabled buttons to show action was completed
          const enableButton = new ButtonBuilder()
            .setCustomId("welcome_enable_completed")
            .setLabel(isEnable ? "✅ Enabled" : "✅ Enable Welcome")
            .setStyle(isEnable ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(true);

          const disableButton = new ButtonBuilder()
            .setCustomId("welcome_disable_completed")
            .setLabel(isEnable ? "❌ Disable Welcome" : "❌ Disabled")
            .setStyle(isEnable ? ButtonStyle.Secondary : ButtonStyle.Danger)
            .setDisabled(true);

          const row = new ActionRowBuilder().addComponents(
            enableButton,
            disableButton
          );

          await interaction.update({
            content: `<:toggleWelcome:1379166874092179587> **Welcome messages for "${guildName}" are now ${
              isEnable ? "`✅` enabled" : "`❌` disabled"
            }!**`,
            components: [row],
          });
        }
      }

      // Handle modal submissions
      if (interaction.isModalSubmit()) {
        const { customId, user, guild: discordGuild } = interaction;
        if (customId === "create_guild_modal") {
          const guildName = interaction.fields.getTextInputValue("guild_name");
          const guildDescription =
            interaction.fields.getTextInputValue("guild_description") ||
            "A new Guild ready for adventure!";
          const guildColor =
            interaction.fields.getTextInputValue("guild_color") || "#e4d8c4";
          const guildIcon =
            interaction.fields.getTextInputValue("guild_icon") ||
            "<:filipinoGuilds:1379211588464152608>";
          const guildBanner =
            interaction.fields.getTextInputValue("guild_banner") || null;

          // Validate hex color if provided
          if (guildColor && guildColor !== "#e4d8c4") {
            const hexColorRegex = /^#([0-9A-F]{3}){1,2}$/i;
            if (!hexColorRegex.test(guildColor)) {
              await interaction.reply({
                content: `❌ Invalid hex color code! Please use a format like #e4d8c4.`,
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
          }

          // Check if guild name already exists
          const existingGuild = await Guild.findOne({ name: guildName });
          if (existingGuild) {
            await interaction.reply({
              content: `\`❌\` A Guild named **${guildName}** already exists!`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          // Process icon URL if it's an emoji
          let iconUrl = guildIcon;
          if (guildIcon && guildIcon.match(/<a?:.+?:(\d+)>/)) {
            iconUrl = convertEmojiToUrl(guildIcon);
          }

          // Process banner URL
          let bannerUrl = guildBanner;
          if (guildBanner && guildBanner.trim()) {
            bannerUrl = guildBanner.trim();
          }

          let roleId = null;
          try {
            const referenceRole = discordGuild.roles.cache.get(
              "1377980855154249788"
            );
            const position = referenceRole ? referenceRole.position : 0;

            const role = await discordGuild.roles.create({
              name: guildName,
              color: guildColor,
              position: position,
              reason: `Role for Guild ${guildName}`,
              icon: iconUrl,
            });
            roleId = role.id;
            await interaction.member.roles.add(role);
          } catch (error) {
            logger.error("Error creating role:", error);
            await interaction.reply({
              content: "`❌` Failed to create role. Guild creation aborted.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          } // Create new guild with all the information
          const newGuild = new Guild({
            name: guildName,
            description: guildDescription,
            owner: user.id,
            members: [user.id],
            roleName: guildName,
            roleId,
            embedColor: guildColor,
            icon: iconUrl,
            banner: bannerUrl,
            createdAt: new Date(),
            suspended: false,
            suspensionDate: null,
          });

          await newGuild.save();

          // Log guild creation
          await sendLogMessage(
            client,
            newGuild,
            `**Guild Created**: Guild **${guildName}** was created by <@${user.id}>.`
          );

          // Update channel permissions for the new guild role
          try {
            const targetChannel = await discordGuild.channels.fetch(
              "1375179220304531526"
            );
            if (targetChannel) {
              await targetChannel.permissionOverwrites.create(roleId, {
                ViewChannel: true,
                SendMessages: true,
                ReadMessageHistory: true,
              });
              logger.info(
                `Added permissions for guild role ${roleId} to channel ${targetChannel.name}`
              );
            }
          } catch (error) {
            logger.error("Error updating channel permissions:", error);
          }

          // Create success embed
          const successEmbed = new EmbedBuilder()
            .setTitle(
              `<a:1174shinybluediamond:1313910339292758077> Guild Created Successfully!`
            )
            .setDescription(
              `**${guildName}** has been created and you are now a Guild Owner of the <@&${roleId}>!`
            )
            .addFields(
              {
                name: "<:guildOwner:1379167072101077063> Your Role",
                value: "You now have the <@& " + roleId + "> role.",
                inline: true,
              },
              {
                name: "<:changeTag:1379166474106703882> Next Steps",
                value:
                  "Check the <#1375179645460152390> channel to customize your Guild further.",
                inline: false,
              }
            )
            .setColor(guildColor)
            .setThumbnail(iconUrl)
            .setTimestamp()
            .setFooter({
              text: "Welcome to the Guild system!",
              iconURL: client.user.displayAvatarURL(),
            });

          if (bannerUrl) {
            successEmbed.setImage(bannerUrl);
          }
          await interaction.reply({
            embeds: [successEmbed],
            flags: MessageFlags.Ephemeral,
          });

          // Update guild board with new guild
          try {
            await updateGuildBoard(client, false);
          } catch (error) {
            logger.error(
              "Failed to update guild board after guild creation:",
              error
            );
          }
        } // Handle edit description modal
        if (customId.startsWith("edit_description_modal_")) {
          const guildName = customId.split("_").slice(3).join("_");
          const description =
            interaction.fields.getTextInputValue("guild_description") ||
            "A new Guild ready for adventure!";

          // Check admin permissions for editing description
          const permissionCheck = await checkAdminPermissions(interaction);
          if (!permissionCheck.hasPermission) {
            return; // Error message already sent by checkAdminPermissions
          }

          const guild = permissionCheck.guild;

          // Validate guild name matches
          if (guild.name !== guildName) {
            await interaction.reply({
              content: "`❌` Guild name mismatch! Please try again.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await Guild.findOneAndUpdate(
            { name: guildName },
            { description: description }
          );

          await interaction.reply({
            content: `\`📝\` **${guildName}** description updated successfully!`,
            flags: MessageFlags.Ephemeral,
          });
        } // Handle rename modal
        if (customId.startsWith("rename_guild_modal_")) {
          const oldGuildName = customId.split("_").slice(3).join("_");
          const newName =
            interaction.fields.getTextInputValue("new_guild_name");

          const existingGuild = await Guild.findOne({ name: newName });
          if (existingGuild) {
            await interaction.reply({
              content: `\`❌\` A Guild named **${newName}** already exists!`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          // Check admin permissions for renaming
          const permissionCheck = await checkAdminPermissions(interaction);
          if (!permissionCheck.hasPermission) {
            return; // Error message already sent by checkAdminPermissions
          }

          const guild = permissionCheck.guild;

          // Validate guild name matches
          if (guild.name !== oldGuildName) {
            await interaction.reply({
              content: "`❌` Guild name mismatch! Please try again.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await Guild.findOneAndUpdate(
            { name: oldGuildName },
            { name: newName, roleName: newName }
          );

          // Update role name
          if (guild.roleId) {
            const role = discordGuild.roles.cache.get(guild.roleId);
            if (role) await role.setName(newName).catch(logger.error);
          }

          await interaction.reply({
            content: `\`✅\` Guild renamed from **${oldGuildName}** to **${newName}**!`,
            flags: MessageFlags.Ephemeral,
          });
        } // Handle color change modal
        if (customId.startsWith("change_color_modal_")) {
          const guildName = customId.split("_").slice(3).join("_");
          const color = interaction.fields.getTextInputValue("guild_color");

          // Validate hex color
          const hexColorRegex = /^#([0-9A-F]{3}){1,2}$/i;
          if (!hexColorRegex.test(color)) {
            await interaction.reply({
              content: `\`❌\` Invalid hex color code! Please use a format like \`#e4d8c4\`.`,
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          // Check admin permissions for color change
          const permissionCheck = await checkAdminPermissions(interaction);
          if (!permissionCheck.hasPermission) {
            return; // Error message already sent by checkAdminPermissions
          }

          const guild = permissionCheck.guild;

          // Validate guild name matches
          if (guild.name !== guildName) {
            await interaction.reply({
              content: "`❌` Guild name mismatch! Please try again.",
              flags: MessageFlags.Ephemeral,
            });
            return;
          }

          await Guild.findOneAndUpdate(
            { name: guildName },
            { embedColor: color }
          );

          // Update role color
          if (guild.roleId) {
            const role = discordGuild.roles.cache.get(guild.roleId);
            if (role) {
              try {
                await role.setColor(color);
              } catch (error) {
                logger.error("Error updating role color:", error);
              }
            }
          }

          await interaction.reply({
            content: `<:changeColor:1379166187526684866> **${guildName}** color updated to ${color}!`,
            flags: MessageFlags.Ephemeral,
          });
        }
      }

      if (interaction.isUserSelectMenu()) {
        const { customId, values, user, guild: discordGuild } = interaction;
        if (customId.startsWith("invite_users_")) {
          const guildName = customId.split("_").slice(2).join("_");

          try {
            // Check admin permissions for inviting users
            const permissionCheck = await checkAdminPermissions(interaction);
            if (!permissionCheck.hasPermission) {
              return; // Error message already sent by checkAdminPermissions
            }

            const guild = permissionCheck.guild;

            // Validate guild name matches
            if (guild.name !== guildName) {
              await interaction.reply({
                content: "`❌` Guild name mismatch! Please try again.",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Initialize tracking arrays
            const sentInvites = [];
            const alreadyMembers = [];
            const failedInvites = [];
            const guildFullErrors = [];
            const alreadyInvited = [];

            // Process each selected user
            for (const userId of values) {
              try {
                // Validate user ID format
                if (!/^\d{17,19}$/.test(userId)) {
                  failedInvites.push({ userId, reason: "Invalid user ID" });
                  continue;
                }

                // Check if user is already a member of this guild
                if (guild.members.includes(userId)) {
                  alreadyMembers.push(userId);
                  continue;
                }

                // Check one guild per user rule
                const guildCheck = await checkOneGuildPerUser(
                  userId,
                  guild.name
                );
                if (guildCheck.hasGuild) {
                  alreadyMembers.push(userId);
                  continue;
                }

                // Check if there's already a pending invitation for this user
                const existingInvite = await GuildInvitation.findOne({
                  guildId: guild._id,
                  invitedUserId: userId,
                  status: "pending",
                });

                if (existingInvite) {
                  alreadyInvited.push(userId);
                  continue;
                }

                // Check guild capacity
                if (guild.members.length >= guild.maxMembers) {
                  guildFullErrors.push(userId);
                  continue;
                }

                // Fetch the user to ensure they exist
                const invitedUser = await client.users.fetch(userId);

                // Create unique invitation ID
                const inviteId = `${
                  guild._id
                }_${userId}_${Date.now()}_${Math.random()
                  .toString(36)
                  .substr(2, 9)}`; // Save invitation to database with proper roleId
                logger.debug(
                  `Creating invitation for guild ${guild.name} with roleId: ${guild.roleId}`
                );
                const invitation = new GuildInvitation({
                  inviteId,
                  guildName: guild.name,
                  guildId: guild._id,
                  ownerId: user.id,
                  invitedUserId: userId,
                  roleId: guild.roleId, // Store the guild's role ID
                  status: "pending",
                });

                await invitation.save();
                logger.debug(
                  `Invitation saved with roleId: ${invitation.roleId}`
                );

                // Create invitation buttons with unique IDs
                const acceptButton = new ButtonBuilder()
                  .setCustomId(`accept_invite_${inviteId}`)
                  .setLabel("✅ Accept")
                  .setStyle(ButtonStyle.Success);

                const declineButton = new ButtonBuilder()
                  .setCustomId(`decline_invite_${inviteId}`)
                  .setLabel("❌ Decline")
                  .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder().addComponents(
                  acceptButton,
                  declineButton
                );

                // Create invitation embed
                const inviteEmbed = new EmbedBuilder()
                  .setTitle(
                    `<:filipinoGuilds:1379211588464152608> Guild Invitation`
                  )
                  .setDescription(
                    `> You've been invited to join **${guild.name}**!\n\n` +
                      `<:guildOwner:1379167072101077063>  **Guild Owner:** <@${user.id}>\n` +
                      `<:guildMember:1379167172118708379> **Current Members:** ${guild.members.length}/${guild.maxMembers}\n` +
                      `<:changeTag:1379166474106703882> **Guild Description:** ${
                        guild.description || "No description available"
                      }`
                  )
                  .setThumbnail(guild.icon)
                  .setColor(guild.embedColor || 0x00ae86)
                  .setTimestamp()
                  .setImage(config.embedLine)
                  .setFooter({
                    text: "This invitation will remain active until you respond",
                    iconURL: client.user.displayAvatarURL(),
                  });

                if (guild.iconUrl) {
                  inviteEmbed.setThumbnail(guild.iconUrl);
                } // Send invitation DM
                await invitedUser.send({
                  embeds: [inviteEmbed],
                  components: [row],
                });

                sentInvites.push(userId);
              } catch (error) {
                logger.error(
                  `Failed to send invitation to user ${userId}:`,
                  error
                );

                // Clean up database entry if DM failed
                await GuildInvitation.deleteOne({
                  guildId: guild._id,
                  invitedUserId: userId,
                  status: "pending",
                });

                if (error.code === 50007) {
                  // User has DMs closed - notify guild owner
                  try {
                    const guildOwner = await client.users.fetch(user.id);
                    await guildOwner.send(
                      `⚠️ **Guild Invitation Failed**\n\n` +
                        `Could not send invitation to <@${userId}> for guild **${guild.name}**.\n\n` +
                        `**Reason:** User has DMs disabled or blocked the bot.\n` +
                        `**Action:** Ask them to enable DMs and try inviting again.`
                    );
                  } catch (dmError) {
                    logger.error(
                      "Failed to notify owner about closed DMs:",
                      dmError
                    );
                  }

                  failedInvites.push({
                    userId,
                    reason: "DMs closed - owner notified",
                  });
                } else if (error.code === 10013) {
                  failedInvites.push({ userId, reason: "User not found" });
                } else {
                  failedInvites.push({ userId, reason: "Unknown error" });
                }
              }
            }

            // Build response message
            const responseMessages = [];

            if (sentInvites.length > 0) {
              responseMessages.push(
                `\`📩\` **Invitations sent to:** ${sentInvites
                  .map((id) => `<@${id}>`)
                  .join(", ")}`
              );
            }

            if (alreadyMembers.length > 0) {
              responseMessages.push(
                `\`⚠️\` **Already members or in another guild:** ${alreadyMembers
                  .map((id) => `<@${id}>`)
                  .join(", ")}`
              );
            }

            if (alreadyInvited.length > 0) {
              responseMessages.push(
                `\`📤\` **Already have pending invitations:** ${alreadyInvited
                  .map((id) => `<@${id}>`)
                  .join(", ")}`
              );
            }

            if (guildFullErrors.length > 0) {
              responseMessages.push(
                `\`🔒\` **Guild is full, cannot invite:** ${guildFullErrors
                  .map((id) => `<@${id}>`)
                  .join(", ")}`
              );
            }

            if (failedInvites.length > 0) {
              const failedList = failedInvites
                .map((f) => `<@${f.userId}> (${f.reason})`)
                .join(", ");
              responseMessages.push(`❌ **Failed to invite:** ${failedList}`);
            }

            const finalMessage =
              responseMessages.length > 0
                ? responseMessages.join("\n\n")
                : "`✅` **Invitation process completed!**";

            // Add invitation management info
            const pendingCount = await GuildInvitation.countDocuments({
              guildId: guild._id,
              status: "pending",
            });

            if (pendingCount > 0) {
              responseMessages.push(
                `\`📊\` **Total pending invitations for your guild:** ${pendingCount}`
              );
            }

            await interaction.reply({
              content: responseMessages.join("\n\n") || finalMessage,
              flags: MessageFlags.Ephemeral,
            });
          } catch (error) {
            logger.error("Error in guild invitation process:", error);
            await interaction.reply({
              content:
                "`❌` An error occurred while processing invitations. Please try again later.",
              flags: MessageFlags.Ephemeral,
            });
          }
        } else if (customId.startsWith("assign_admin_")) {
          const guildName = customId.split("_").slice(2).join("_");

          try {
            const guild = await Guild.findOne({
              name: guildName,
              owner: user.id,
            });

            if (!guild) {
              await interaction.reply({
                content:
                  "`❌` Guild not found or you don't have permission to assign admin!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Check if guild already has an admin
            if (guild.admins && guild.admins.length > 0) {
              await interaction.reply({
                content: "`❌` Your guild already has an admin assigned!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            const userId = values[0];

            // Check if the selected user is a member of the guild
            if (!guild.members.includes(userId)) {
              await interaction.reply({
                content:
                  "`❌` The selected user is not a member of your guild!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Check if trying to assign the owner as admin
            if (userId === guild.owner) {
              await interaction.reply({
                content:
                  "`❌` You cannot assign yourself as admin since you're the owner!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            } // Assign the admin
            await Guild.findOneAndUpdate(
              { name: guildName },
              { $push: { admins: userId } }
            );

            // Add Guild Admin role to Discord member
            try {
              const member = await interaction.guild.members.fetch(userId);
              if (!member.roles.cache.has(config.GuildAdminRoleId)) {
                // Mark this as an authorized change
                const changeKey = `${userId}_${config.GuildAdminRoleId}_add`;
                global.authorizedRoleChanges =
                  global.authorizedRoleChanges || new Set();
                global.authorizedRoleChanges.add(changeKey);

                await member.roles.add(config.GuildAdminRoleId);
              }
            } catch (error) {
              logger.error("Failed to add Guild Admin role:", error);
            }

            const newAdmin = await client.users.fetch(userId);

            await interaction.reply({
              content: `\`✅\` **${newAdmin.username}** has been assigned as an admin for **${guildName}**!\n\nThey can now invite and kick members.`,
              flags: MessageFlags.Ephemeral,
            });

            // Log the admin assignment
            await sendLogMessage(
              client,
              guild,
              `**Admin Assigned**: <@${userId}> was assigned as an admin for **${guildName}** by <@${user.id}>.`
            );

            // Notify the new admin
            try {
              await newAdmin.send(
                `\`👤\` **You've been assigned as an admin for guild "${guildName}"!**\n\nYou can now:\n• Invite new members\n• Kick existing members\n\nUse the guild management channel to access these features.`
              );
            } catch (error) {
              logger.error("Failed to notify new admin:", error);
            }
          } catch (error) {
            logger.error("Error in assign admin process:", error);
            await interaction.reply({
              content:
                "`❌` An error occurred while assigning admin. Please try again later.",
              flags: MessageFlags.Ephemeral,
            });
          }
        }
      } // Handle invitation button interactions
      if (
        interaction.isButton() &&
        (interaction.customId.startsWith("accept_invite_") ||
          interaction.customId.startsWith("decline_invite_"))
      ) {
        const { customId, user } = interaction;
        if (
          customId.startsWith("accept_invite_") ||
          customId.startsWith("decline_invite_")
        ) {
          const isAccept = customId.startsWith("accept_invite_");
          const inviteId = customId.split("_").slice(2).join("_");

          try {
            // Find the invitation in database
            const invitation = await GuildInvitation.findOne({
              inviteId,
              status: "pending",
            }).populate("guildId");

            if (!invitation) {
              await interaction.reply({
                content:
                  "`❌` This invitation is no longer valid or has already been responded to!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Debug log the invitation data
            logger.info(
              `🔍 Found invitation with roleId: ${invitation.roleId}`
            );
            logger.info(
              `🔍 Guild data from invitation: ${JSON.stringify(
                invitation.guildId?.roleId
              )}`
            );

            // Verify the user is the intended recipient
            if (invitation.invitedUserId !== user.id) {
              await interaction.reply({
                content: "`❌` This invitation is not for you!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Get the guild from the populated field
            const guild = invitation.guildId;

            if (!guild) {
              await interaction.reply({
                content: "`❌` Guild not found or no longer exists!",
                flags: MessageFlags.Ephemeral,
              });

              // Clean up invalid invitation
              await GuildInvitation.deleteOne({ _id: invitation._id });
              return;
            }

            if (isAccept) {
              // Check if user is already a member
              if (guild.members.includes(user.id)) {
                await interaction.reply({
                  content: "`⚠️` You are already a member of this guild!",
                  flags: MessageFlags.Ephemeral,
                });

                // Update invitation status and delete
                invitation.status = "accepted";
                invitation.respondedAt = new Date();
                await invitation.save();
                await GuildInvitation.deleteOne({ _id: invitation._id });
                return;
              }

              // Check one guild per user rule
              const guildCheck = await checkOneGuildPerUser(
                user.id,
                guild.name
              );
              if (guildCheck.hasGuild) {
                await interaction.reply({
                  content: `\`❌\` You are already a member of another guild: **${guildCheck.guildName}**\nYou can only be in one guild at a time!`,
                  flags: MessageFlags.Ephemeral,
                });

                // Update invitation status to declined and delete
                invitation.status = "declined";
                invitation.respondedAt = new Date();
                await invitation.save();
                await GuildInvitation.deleteOne({ _id: invitation._id });

                // Notify owner about rejection
                await notifyOwner(
                  invitation.ownerId,
                  user.id,
                  guild.name,
                  "couldn't accept your guild invite because they're already in another guild"
                );
                return;
              }

              // Check guild capacity (re-check in case it changed)
              const updatedGuild = await Guild.findById(guild._id);
              if (updatedGuild.members.length >= updatedGuild.maxMembers) {
                await interaction.reply({
                  content: "`❌` This guild is now full!",
                  flags: MessageFlags.Ephemeral,
                });

                await notifyOwner(
                  invitation.ownerId,
                  user.id,
                  guild.name,
                  "tried to accept your guild invite, but the guild is now full"
                );
                return;
              }

              // Add user to guild
              updatedGuild.members.push(user.id);
              await updatedGuild.save();

              // Update invitation status to accepted and delete
              invitation.status = "accepted";
              invitation.respondedAt = new Date();
              await invitation.save();
              await GuildInvitation.deleteOne({ _id: invitation._id }); // Add guild role to user - FIXED DM CONTEXT VERSION
              logger.info(
                `🔍 Starting role assignment for ${user.tag} joining guild ${guild.name}`
              );

              // Get roleId from invitation or fallback to guild data
              const roleIdToAssign = invitation.roleId || guild.roleId;
              logger.info(
                `🔍 RoleId to assign: ${roleIdToAssign} (from: ${
                  invitation.roleId ? "invitation" : "guild"
                })`
              );

              if (roleIdToAssign) {
                try {
                  // Fetch the actual Discord guild since interaction.guild is null in DM context
                  const discordGuild = await client.guilds.fetch(
                    config.guildId
                  ); // Your server ID
                  logger.info(`🔍 Fetched Discord guild: ${discordGuild.name}`);

                  const member = await discordGuild.members.fetch(user.id);
                  const role = discordGuild.roles.cache.get(roleIdToAssign);

                  if (!role) {
                    logger.error(
                      `❌ Role ${roleIdToAssign} not found in Discord guild ${discordGuild.name}`
                    );
                  } else {
                    // Mark as authorized change
                    const changeKey = `${user.id}_${roleIdToAssign}_add`;
                    global.authorizedRoleChanges =
                      global.authorizedRoleChanges || new Set();
                    global.authorizedRoleChanges.add(changeKey);

                    await member.roles.add(
                      roleIdToAssign,
                      `Guild invitation acceptance for ${guild.name}`
                    );
                    logger.info(
                      `✅ SUCCESS: ${guild.name} role was added to ${user.tag}`
                    );
                  }
                } catch (error) {
                  logger.error(
                    `❌ Failed to add guild role to ${user.tag}:`,
                    error
                  );
                }
              } else {
                logger.error(
                  `❌ Missing roleId for ${user.tag} - invitation.roleId: ${invitation.roleId}, guild.roleId: ${guild.roleId}`
                );
              }

              // Send welcome message if enabled
              if (guild.welcome && guild.welcomeChannelId) {
                try {
                  const welcomeChannel = await client.channels.fetch(
                    guild.welcomeChannelId
                  );
                  if (welcomeChannel && welcomeChannel.isTextBased()) {
                    const welcomeEmbed = new EmbedBuilder()
                      .setTitle(
                        `<a:1174shinybluediamond:1313910339292758077> Welcome to ${guild.name}!`
                      )
                      .setDescription(`<@${user.id}> has joined the Guild!`)
                      .setColor(guild.embedColor || 0x00ae86)
                      .setTimestamp();

                    await welcomeChannel.send({
                      content: `<@${user.id}>`,
                      embeds: [welcomeEmbed],
                    });
                  }
                } catch (error) {
                  logger.error("Failed to send welcome message:", error);
                }
              }

              // Log member join
              await sendLogMessage(
                client,
                guild,
                `**Member Joined**: <@${user.id}> accepted an invitation to **${guild.name}** from <@${invitation.ownerId}>.`
              );

              // Disable the buttons in the original message
              await interaction.update({
                components: [
                  {
                    type: 1,
                    components: [
                      {
                        type: 2,
                        style: 3,
                        label: "✅ Invitation Accepted",
                        custom_id: "accepted",
                        disabled: true,
                      },
                    ],
                  },
                ],
              });

              // Send success message
              await interaction.followUp({
                content: `\`✅\` You have successfully joined **${guild.name}**!`,
                flags: MessageFlags.Ephemeral,
              });

              // REMOVED THE DUPLICATE ROLE ASSIGNMENT - This was the bug!
              // The line "await user.roles.add(guild.roleId).catch(logger.error);" was incorrect
              // because 'user' is a Discord User object, not a GuildMember object
              // Role assignment should only happen once, in the try-catch block above

              // Notify guild owner about acceptance
              await notifyOwner(
                invitation.ownerId,
                user.id,
                guild.name,
                "**accepted** your guild invite"
              );
            } else {
              // User declined the invitation

              // Update invitation status to declined and delete
              invitation.status = "declined";
              invitation.respondedAt = new Date();
              await invitation.save();
              await GuildInvitation.deleteOne({ _id: invitation._id });

              await interaction.update({
                components: [
                  {
                    type: 1,
                    components: [
                      {
                        type: 2,
                        style: 4,
                        label: "❌ Invitation Declined",
                        custom_id: "declined",
                        disabled: true,
                      },
                    ],
                  },
                ],
              });

              await interaction.followUp({
                content: `\`❌\` You have declined the invitation to join **${guild.name}**.`,
                flags: MessageFlags.Ephemeral,
              });

              // Notify guild owner about decline
              await notifyOwner(
                invitation.ownerId,
                user.id,
                guild.name,
                "**declined** your guild invite"
              );
            }
          } catch (error) {
            logger.error("Error handling invitation response:", error);
            await interaction.reply({
              content:
                "`❌` An error occurred while processing your response. Please try again later.",
              flags: MessageFlags.Ephemeral,
            });
          }
        }
      }

      if (interaction.isStringSelectMenu()) {
        const { customId, values, user, guild: discordGuild } = interaction;
        if (customId.startsWith("kick_users_")) {
          const guildName = customId.split("_").slice(2).join("_");

          try {
            // Check admin permissions for kick action
            const permissionCheck = await checkAdminPermissions(interaction);
            if (!permissionCheck.hasPermission) {
              return; // Error message already sent by checkAdminPermissions
            }

            const guild = permissionCheck.guild;
            const isOwner = permissionCheck.isOwner;
            const isAdmin = permissionCheck.isAdmin;

            // Validate guild name matches
            if (guild.name !== guildName) {
              await interaction.reply({
                content: "`❌` Guild name mismatch! Please try again.",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }
            const kickedMembers = [];
            const failedKicks = [];

            // Process each selected user to kick
            for (const userId of values) {
              try {
                // Cannot kick the owner
                if (userId === guild.owner) {
                  failedKicks.push({
                    userId,
                    reason: "Cannot kick guild owner",
                  });
                  continue;
                }

                // Admin cannot kick another admin (only owner can)
                if (!isOwner && guild.admins.includes(userId)) {
                  failedKicks.push({
                    userId,
                    reason: "Only owner can kick admin",
                  });
                  continue;
                }

                // Check if user is actually a member
                if (!guild.members.includes(userId)) {
                  failedKicks.push({ userId, reason: "Not a guild member" });
                  continue;
                }

                // Remove user from guild
                await Guild.findOneAndUpdate(
                  { name: guildName },
                  { $pull: { members: userId, admins: userId } } // Remove from both members and admins if applicable
                );

                // Remove guild role if exists
                if (guild.roleId && interaction.guild) {
                  try {
                    const member = await interaction.guild.members.fetch(
                      userId
                    );
                    await member.roles.remove(guild.roleId);
                  } catch (error) {
                    logger.error("Failed to remove guild role:", error);
                  }
                }

                kickedMembers.push(userId);

                // Notify the kicked user
                try {
                  const kickedUser = await client.users.fetch(userId);
                  await kickedUser.send(
                    `\`❌\` **You have been removed from guild "${guildName}"** by ${
                      isOwner ? "the guild owner" : "an admin"
                    }.`
                  );
                } catch (error) {
                  logger.error("Failed to notify kicked user:", error);
                }
              } catch (error) {
                logger.error(`Failed to kick user ${userId}:`, error);
                failedKicks.push({ userId, reason: "System error" });
              }
            }

            // Build response message
            const responseMessages = [];

            if (kickedMembers.length > 0) {
              responseMessages.push(
                `\`✅\` **Successfully removed:** ${kickedMembers
                  .map((id) => `<@${id}>`)
                  .join(", ")}`
              );

              // Log the kicks
              await sendLogMessage(
                client,
                guild,
                `**Members Kicked**: ${kickedMembers
                  .map((id) => `<@${id}>`)
                  .join(", ")} were removed from **${guildName}** by <@${
                  user.id
                }>.`
              );
            }

            if (failedKicks.length > 0) {
              const failedList = failedKicks
                .map((f) => `<@${f.userId}> (${f.reason})`)
                .join(", ");
              responseMessages.push(
                `\`❌\` **Failed to remove:** ${failedList}`
              );
            }

            const finalMessage =
              responseMessages.length > 0
                ? responseMessages.join("\n\n")
                : "`✅` **Kick process completed!**";

            await interaction.reply({
              content: finalMessage,
              flags: MessageFlags.Ephemeral,
            });
          } catch (error) {
            logger.error("Error in guild kick process:", error);
            await interaction.reply({
              content:
                "`❌` An error occurred while processing kicks. Please try again later.",
              flags: MessageFlags.Ephemeral,
            });
          }
        } else if (customId.startsWith("transfer_ownership_")) {
          const guildName = customId.split("_").slice(2).join("_");

          try {
            const guild = await Guild.findOne({
              name: guildName,
              owner: user.id,
            });

            if (!guild) {
              await interaction.reply({
                content: "`❌` Guild not found or you are not the owner!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            const newOwnerId = values[0];

            // Check if the selected user is still a member of the guild
            if (!guild.members.includes(newOwnerId)) {
              await interaction.reply({
                content:
                  "`❌` The selected user is no longer a member of your guild!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Check if trying to transfer to the current owner
            if (newOwnerId === guild.owner) {
              await interaction.reply({
                content: "`❌` You cannot transfer ownership to yourself!",
                flags: MessageFlags.Ephemeral,
              });
              return;
            }

            // Create final confirmation buttons
            const confirmButton = new ButtonBuilder()
              .setCustomId(`confirm_transfer_${guildName}_${newOwnerId}`)
              .setLabel("✅ Confirm Transfer")
              .setStyle(ButtonStyle.Danger);

            const cancelButton = new ButtonBuilder()
              .setCustomId("cancel_transfer")
              .setLabel("❌ Cancel")
              .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(
              confirmButton,
              cancelButton
            );

            const newOwner = await client.users.fetch(newOwnerId);

            await interaction.reply({
              content: `<:addAssistant:1381305561181720697> **Final Confirmation: Transfer Ownership**\n\n⚠️ **Are you absolutely sure you want to transfer ownership of "${guildName}" to ${newOwner.username}?**\n\n**This action is PERMANENT and cannot be undone!**\n\nAfter confirmation:\n• **${newOwner.username}** will become the Guild Owner\n• **You** will lose all Guild Owner privileges\n• **You** will become a regular member\n• **${newOwner.username}** will have full control of the guild`,
              components: [row],
              flags: MessageFlags.Ephemeral,
            });
          } catch (error) {
            logger.error("Error in transfer ownership process:", error);
            await interaction.reply({
              content:
                "`❌` An error occurred while processing ownership transfer. Please try again later.",
              flags: MessageFlags.Ephemeral,
            });
          }
        }
      }
    } catch (error) {
      logger.error("Unexpected error in interactionCreate handler:", error);
    }
  },
};
