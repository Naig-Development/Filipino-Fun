const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  MessageFlags,
} = require("discord.js");
const Guild = require("../schema/guild.js");
const { GuildOwnerRoleId } = require("../config.js");
const client = require("../index.js");
const logger = require("./logger.js");
const config = require("../config.js");

// Import live board updates
const { updateGuildBoard } = require("./liveGuildBoard.js");

const userActions = new Map();

async function sendCreateGuildEmbed(client) {
  // Use default channel ID for create guild
  const CREATE_CHANNEL_ID = "1375179709381611631";

  try {
    const channel = await client.channels
      .fetch(CREATE_CHANNEL_ID)
      .catch((err) => {
        logger.error(
          `Failed to fetch create channel ${CREATE_CHANNEL_ID}:`,
          err.message
        );
        return null;
      });

    if (!channel) {
      logger.error("Create channel not found:", CREATE_CHANNEL_ID);
      return;
    }
    const createEmbed = new EmbedBuilder()
      .setTitle("<:guildCreate:1379184381079326930> Create Your Guild")
      .setDescription(
        "<a:arrow:1317558543788015678>  Ready to build your own Guild?\n\n" +
          "> **Requirements:**\n" +
          `- Must have <@&${config.GuildOwnerRoleId}> role required\n` +
          "- One Guild per owner\n\n"
      )
      .setImage(config.embedLine)
      .setColor("#e4d8c4");
    const createButton = new ButtonBuilder()
      .setCustomId("create_guild")
      .setLabel("Create Guild")
      .setEmoji("1379184381079326930")
      .setStyle(ButtonStyle.Success);

    const createRow = new ActionRowBuilder().addComponents(createButton);

    const messages = await channel.messages.fetch({ limit: 10 });
    const botMessage = messages.find(
      (msg) =>
        msg.author.id === client.user.id &&
        msg.embeds.length > 0 &&
        (msg.embeds[0].title ===
          "<:guildCreate:1379184381079326930> Create Your Guild" ||
          msg.embeds[0].title === "Guilds <a:yellowstar:1332780557557567571>")
    );

    if (botMessage) {
      await botMessage.edit({ embeds: [createEmbed], components: [createRow] });
      logger.info("Updated existing create guild embed");
    } else {
      await channel.send({ embeds: [createEmbed], components: [createRow] });
      logger.success("Sent new create guild embed");
    }
  } catch (error) {
    logger.error("Error in sendCreateGuildEmbed:", error.message);
  }
}

async function sendManageGuildEmbed(client, guildName = null, userId = null) {
  const MANAGE_CHANNEL_ID = "1375179645460152390";

  if (!client || !client.channels) {
    logger.error("Client not available");
    return;
  }

  try {
    const channel = await client.channels
      .fetch(MANAGE_CHANNEL_ID)
      .catch((err) => {
        logger.error(
          `Failed to fetch channel ${MANAGE_CHANNEL_ID}:`,
          err.message
        );
        return null;
      });

    if (!channel || !channel.isTextBased()) {
      logger.error("Channel not found or not text-based:", MANAGE_CHANNEL_ID);
      return;
    }

    // Try to get guild data for color, but don't fail if not found
    let guildColor = "#e4d8c4"; // Default color
    if (userId) {
      try {
        const guildData = await Guild.findOne({ owner: userId });
        if (guildData && guildData.embedColor) {
          guildColor = guildData.embedColor;
        }
      } catch (error) {
        logger.error("Error fetching guild data for color:", error.message);
        // Continue with default color
      }
    }    const manageMembers = new EmbedBuilder()
      .setDescription(
        `# <:guildMember:1379167172118708379> Manage Guild Members\n > Manage your **guild members** with ease. Simply click the button that matches the action you want to take — **invite, kick members, or leave the guild**\n\n` +
          `**<:bearQuestion:1379202123681632482>** **How it works:**\n` +
          `> <:invite:1379165172643532982> **Invite** - Add new members to your guild\n` +
          `> <:kick:1379165269720694955> **Kick** - Remove members from your guild (Owner/Admin only)\n` +
          `> <:guildLeave:1383366719824724008> **Leave** - Exit the guild voluntarily (Members/Admins only)\n\n` +
          `-# <:guildOwner:1379167072101077063> You must be a <@&${config.GuildOwnerRoleId}> to invite/kick. Click \`🚪\` Leave if you wish to exit this guild. Admins will lose their admin role. Guild owners cannot leave.`
      )
      .setColor(guildColor)
      .setImage(config.embedLine);// Create a single universal manage embed
    const manageEmbed = new EmbedBuilder()
      .setDescription(
        `# <:guildMange:1379167222085320756> Guild Management Panel\n\n` +
          `### > Welcome to your **Guild management panel**! Use the buttons below to customize and manage your Guild.\n\n` +
          `**<:bearQuestion:1379202123681632482>** **How it works:**\n` +
          `> <:rename:1379165767618007114> **Rename** - Change your guild name\n` +
          `> <:editDescript:1381306330484314163> **Edit Description** - Update your guild description\n` +
          `> <:changeColor:1379166187526684866> **Change Color** - Update guild embed color\n` +
          `> <:changeIcon:1379169655071182868> **Change Icon** - Update guild icon (DM required)\n` +          `> <:changeBanner:1379166077778399392> **Change Banner** - Update guild banner (DM required)\n` +
          `> <:toggleWelcome:1379166874092179587> **Toggle Welcome** - Enable/disable welcome messages\n` +
          `> <:addAssistant:1381305561181720697> **Assign Admin** - Assign an admin to help manage your guild (Owner only)\n` +
          `> <:addAssistant:1381305561181720697> **Transfer** - Hand over ownership to another member (Owner only)\n` +
          `> <:disband:1379165323235692554> **Disband** - Permanently delete your guild (Owner only)\n\n` +
          `-# <:guildOwner:1379167072101077063> You must have a <@&${config.GuildOwnerRoleId}> or <@&${config.GuildAdminRoleId}> role to manage your Guild. Some actions are owner-only.`
      )
      .setColor(guildColor)
      .setImage(config.embedLine);

    // Create all buttons - always enabled
    const inviteButton = new ButtonBuilder()
      .setCustomId(`manage_invite`)
      .setLabel("Invite")
      .setEmoji("1379165172643532982")
      .setStyle(ButtonStyle.Success)
      .setDisabled(false);    const kickButton = new ButtonBuilder()
      .setCustomId(`manage_kick`)
      .setLabel("Kick")
      .setEmoji("1379165269720694955")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false);

    const leaveButton = new ButtonBuilder()
      .setCustomId(`manage_leave`)
      .setLabel("Leave")
      .setEmoji("1383366719824724008")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(false);

    const renameButton = new ButtonBuilder()
      .setCustomId(`manage_rename`)
      .setLabel("Rename")
      .setEmoji("1379165767618007114")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false);

    const editDescriptionButton = new ButtonBuilder()
      .setCustomId(`manage_edit-description`)
      .setLabel("Edit Description")
      .setEmoji("1381306330484314163")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false);

    const changeColorButton = new ButtonBuilder()
      .setCustomId(`manage_change-color`)
      .setLabel("Change Color")
      .setEmoji("1379166187526684866")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false);

    const changeIconButton = new ButtonBuilder()
      .setCustomId(`manage_change-icon`)
      .setLabel("Change Icon")
      .setEmoji("1379169655071182868")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false);

    const changeBannerButton = new ButtonBuilder()
      .setCustomId(`manage_change-banner`)
      .setLabel("Change Banner")
      .setEmoji("1379166077778399392")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false);

    const toggleWelcomeButton = new ButtonBuilder()
      .setCustomId(`manage_toggle-welcome`)
      .setLabel("Toggle Welcome")
      .setEmoji("1379166874092179587")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(false);    const assignAdminButton = new ButtonBuilder()
      .setCustomId(`manage_assign-admin`)
      .setLabel("Assign Admin")
      .setEmoji("1381305561181720697")
      .setStyle(ButtonStyle.Success)
      .setDisabled(false);

    const transferOwnershipButton = new ButtonBuilder()
      .setCustomId(`manage_transfer-ownership`)
      .setLabel("Transfer")
      .setEmoji("1381305561181720697")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(false);

    const disbandButton = new ButtonBuilder()
      .setCustomId(`manage_disband`)
      .setLabel("Disband")
      .setEmoji("1379165323235692554")
      .setStyle(ButtonStyle.Danger)
      .setDisabled(false);// Create action rows
    const row1 = new ActionRowBuilder().addComponents(inviteButton, kickButton, leaveButton);
    const row2 = new ActionRowBuilder().addComponents(
      renameButton,
      editDescriptionButton,
      changeColorButton,
      changeIconButton,
      changeBannerButton
    );    const row3 = new ActionRowBuilder().addComponents(
      toggleWelcomeButton,
      assignAdminButton,
      transferOwnershipButton,
      disbandButton
    );

    // Check if embed already exists and update it, or send a new one
    const messages = await channel.messages
      .fetch({ limit: 10 })
      .catch(() => new Map());

    const botMessage = messages.find(
      (msg) =>
        msg.author.id === client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].description &&
        msg.embeds[0].description.includes("Guild Management Panel")
    );

    {
      await channel.send({
        embeds: [manageMembers],
        components: [row1],
      });
      await channel.send({
        embeds: [manageEmbed],
        components: [row2, row3],
      });
      logger.info("Sent new manage guild embed");
    }
  } catch (error) {
    logger.error("Error in sendManageGuildEmbed:", error.message);
  }
}

async function checkSuspensions() {
  const now = new Date();
  let suspensionChanges = false; // Track if we need to update the board
  
  try {
    const guildsList = await Guild.find();
    logger.info(`Checking suspensions for ${guildsList.length} guilds`);
    
    for (const guild of guildsList) {
      try {
        // Get the Discord server and member
        const discordGuild = client.guilds.cache.get(config.ServerId);
        if (!discordGuild) {
          logger.error(`Discord guild not found: ${config.ServerId}`);
          continue;
        }

        const member = await discordGuild.members.fetch(guild.owner).catch(() => null);
        
        // Check if member exists and has the required role
        const hasOwnerRole = member && member.roles.cache.has(GuildOwnerRoleId);
        
        if (!member || !hasOwnerRole) {
          // ============ SUSPENSION LOGIC ============
          if (!guild.suspended) {
            // Suspend the guild
            await Guild.findOneAndUpdate(
              { name: guild.name },
              { 
                suspended: true, 
                suspensionDate: now,
                suspensionReason: !member ? "Member left server" : "Lost Guild Owner role"
              }
            );
            
            suspensionChanges = true;
            logger.critical(`Guild ${guild.name} suspended at ${now} - Reason: ${!member ? "Member left server" : "Lost Guild Owner role"}`);
            
            // Enhanced suspension notification
            const suspensionEmbed = new EmbedBuilder()
              .setColor(0xFF4444)
              .setTitle("`⚠️` Guild Suspended")
              .setDescription(`Your guild **\`${guild.name}\`** has been suspended`)
              .addFields(
                { 
                  name: "📋 Reason", 
                  value: !member ? "You left the server" : "Guild Owner role removed", 
                  inline: false 
                },
                { 
                  name: "`⏰` Time Limit", 
                  value: "Your guild will be **permanently deleted** in **`3 days`** unless you regain the required role", 
                  inline: false 
                },
                { 
                  name: "`📋` What to do", 
                  value: !member 
                    ? "Rejoin the server and contact staff to restore your guild" 
                    : "Create a General Ticket and contact staff to regain your Guild Owner Role", 
                  inline: false 
                },
                {
                  name: "`📊` Guild Info",
                  value: `**Members:** ${guild.members?.length || 0}\n**Level:** ${guild.level || 1}\n**Total XP:** ${(guild.totalXP || 0).toLocaleString()}`,
                  inline: true
                }
              )
              .setFooter({ 
                text: `Guild Management System • Suspension ID: ${guild._id.toString().slice(-6)}`, 
                iconURL: discordGuild.iconURL() 
              })
              .setTimestamp();

            // Try to send DM to member if they exist
            if (member) {
              await member.send({ embeds: [suspensionEmbed] }).catch((error) => {
                logger.error(`Failed to send suspension DM to ${guild.owner}:`, error.message);
              });
            }

            // Log to guild logs if available
            await sendLogMessage(
              guild,
              `**Guild Suspended**: Guild **${guild.name}** was suspended (${!member ? "Member left server" : "Guild Owner role removed"}). Will be deleted in 3 days unless resolved.`
            );

          } else if (guild.suspensionDate) {
            // ============ DELETION LOGIC ============
            const suspensionDuration = now - new Date(guild.suspensionDate);
            const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
            
            if (suspensionDuration >= threeDaysMs) {
              // Delete the guild
              const guildInfo = {
                name: guild.name,
                owner: guild.owner,
                members: guild.members?.length || 0,
                level: guild.level || 1,
                totalXP: guild.totalXP || 0
              };

              // Delete guild role if it exists
              if (guild.roleId) {
                const role = discordGuild.roles.cache.get(guild.roleId);
                if (role) {
                  await role.delete("Guild deleted due to 3-day suspension").catch((error) => {
                    logger.error(`Failed to delete role ${guild.roleId}:`, error.message);
                  });
                }
              }

              // Remove guild members from the guild in database
              if (guild.members && guild.members.length > 0) {
                logger.info(`Removing ${guild.members.length} members from deleted guild ${guild.name}`);
              }

              // Delete the guild from database
              await Guild.deleteOne({ name: guild.name });
              suspensionChanges = true;
              
              logger.critical(`Guild ${guild.name} deleted due to 3-day suspension. Members: ${guildInfo.members}, Level: ${guildInfo.level}`);

              // Enhanced deletion notification
              const deletionEmbed = new EmbedBuilder()
                .setColor(0x000000)
                .setTitle("`🗑️` Guild Permanently Deleted")
                .setDescription(`Your guild **\`${guildInfo.name}\`** has been permanently deleted`)
                .addFields(
                  { 
                    name: "📋 Reason", 
                    value: "3-day suspension period expired", 
                    inline: false 
                  },
                  { 
                    name: "`📊` Final Stats", 
                    value: `**Members:** ${guildInfo.members}\n**Level:** ${guildInfo.level}\n**Total XP:** ${guildInfo.totalXP.toLocaleString()}`, 
                    inline: true 
                  },
                  {
                    name: "`💡` Future Creation",
                    value: "You can create a new guild anytime if you have the Guild Owner role",
                    inline: false
                  }
                )
                .setFooter({ 
                  text: "Guild Management System • Deletion is permanent", 
                  iconURL: discordGuild.iconURL() 
                })
                .setTimestamp();

              // Try to send deletion notification
              if (member) {
                await member.send({ embeds: [deletionEmbed] }).catch((error) => {
                  logger.error(`Failed to send deletion DM to ${guild.owner}:`, error.message);
                });
              }

              // Log deletion to server logs since guild is deleted
              await sendLogMessage(
                { logsChannelId: config.LogsChannelId },
                `**Guild Deleted**: Guild **${guildInfo.name}** was permanently deleted after 3-day suspension. Owner: <@${guildInfo.owner}>, Members: ${guildInfo.members}, Level: ${guildInfo.level}`
              );
            }
          }
        } else if (guild.suspended && hasOwnerRole) {
          // ============ REACTIVATION LOGIC ============
          await Guild.findOneAndUpdate(
            { name: guild.name },
            { 
              suspended: false, 
              suspensionDate: null,
              suspensionReason: null
            }
          );
          
          suspensionChanges = true;
          logger.info(`Guild ${guild.name} reactivated at ${now}`);

          // Enhanced reactivation notification
          const reactivationEmbed = new EmbedBuilder()
            .setColor(0x00FF44)
            .setTitle("`✅` Guild Reactivated")
            .setDescription(`Your guild **\`${guild.name}\`** has been successfully reactivated!`)
            .addFields(
              { 
                name: "📋 Status", 
                value: "Guild Owner role restored", 
                inline: false 
              },
              { 
                name: "<a:confeti:1379545512507740352> Welcome Back", 
                value: "Your guild is now fully operational again", 
                inline: false 
              },
              {
                name: "`📊` Guild Stats",
                value: `**Members:** ${guild.members?.length || 0}\n**Level:** ${guild.level || 1}\n**Total XP:** ${(guild.totalXP || 0).toLocaleString()}`,
                inline: true
              }
            )
            .setFooter({ 
              text: "Guild Management System", 
              iconURL: discordGuild.iconURL() 
            })
            .setTimestamp();

          await member.send({ embeds: [reactivationEmbed] }).catch((error) => {
            logger.error(`Failed to send reactivation DM to ${guild.owner}:`, error.message);
          });

          // Log reactivation
          await sendLogMessage(
            guild,
            `**Guild Reactivated**: Guild **${guild.name}** was reactivated for <@${guild.owner}> (Guild Owner role restored).`
          );
        }
      } catch (error) {
        logger.error(`Error processing suspension for guild ${guild.name}:`, error.message);
      }
    }

    // Update guild board if there were any suspension changes
    if (suspensionChanges) {
      try {
        await updateGuildBoard(client, false);
        logger.info("Updated guild board after suspension changes");
      } catch (error) {
        logger.error("Failed to update guild board after suspension changes:", error);
      }
    }

  } catch (error) {
    logger.error("Critical error in checkSuspensions:", error);
  }
}

async function sendLogMessage(guild, logMessage) {
  if (!guild.logsChannelId) return;
  const logChannel = await client.channels
    .fetch(guild.logsChannelId)
    .catch(() => null);
  if (logChannel) {
    const logEmbed = new EmbedBuilder()
      .setDescription(logMessage)
      .setColor("#e4d8c4")
      .setTimestamp();
    await logChannel.send({ embeds: [logEmbed] }).catch(logger.error);
  }
}

function convertEmojiToUrl(emojiString) {
  if (!emojiString || !emojiString.match(/<a?:.+?:(\d+)>/)) return null;
  const emojiId = emojiString.match(/<a?:.+?:(\d+)>/)[1];
  return `https://cdn.discordapp.com/emojis/${emojiId}.png`;
}

async function checkUserPermissions(interaction) {
  const createChannelId = "1375179709381611631";
  const { user, member } = interaction;
  const { MessageFlags } = require("discord.js");
  // Check if user has Guild Owner role
  if (!member.roles.cache.has(config.GuildOwnerRoleId)) {
    await interaction.reply({
      content: `\`❌\` You need the <@&${config.GuildOwnerRoleId}> role to use Guild management features!`,
      flags: MessageFlags.Ephemeral,
    });
    return { hasPermission: false };
  }

  // Check if user owns a guild
  const guild = await Guild.findOne({ owner: user.id });
  if (!guild) {
    await interaction.reply({
      content: `\`❌\` You don't own a Guild! Create one first in the <#${createChannelId}> channel.`,
      flags: MessageFlags.Ephemeral,
    });
    return { hasPermission: false };
  }

  return { guild, hasPermission: true };
}

// Check if user has admin or owner permissions for a guild
async function checkAdminPermissions(interaction) {
  const createChannelId = "1375179709381611631";
  const { user, member } = interaction;
  const { MessageFlags } = require("discord.js");

  // Check if user has Guild Owner role OR Guild Admin role
  const hasGuildOwnerRole = member.roles.cache.has(config.GuildOwnerRoleId);
  const hasGuildAdminRole = member.roles.cache.has(config.GuildAdminRoleId);

  if (!hasGuildOwnerRole && !hasGuildAdminRole) {
    await interaction.reply({
      content: `\`❌\` You need the <@&${config.GuildOwnerRoleId}> or <@&${config.GuildAdminRoleId}> role to use Guild management features!`,
      flags: MessageFlags.Ephemeral,
    });
    return { hasPermission: false };
  }

  // Check if user owns a guild or is an admin
  const guild = await Guild.findOne({
    $or: [{ owner: user.id }, { admins: user.id }],
  });

  if (!guild) {
    await interaction.reply({
      content: `\`❌\` You don't own a Guild or have admin permissions! Create one first in the <#${createChannelId}> channel.`,
      flags: MessageFlags.Ephemeral,
    });
    return { hasPermission: false };
  }

  const isOwner = guild.owner === user.id;
  const isAdmin = guild.admins.includes(user.id);
  return { guild, hasPermission: true, isOwner, isAdmin };
}

// Check if user has owner-only permissions (for disband and assign admin)
async function checkOwnerOnlyPermissions(interaction) {
  const { user, member } = interaction;
  const { MessageFlags } = require("discord.js");

  // Check if user has Guild Owner role
  if (!member.roles.cache.has(config.GuildOwnerRoleId)) {
    await interaction.reply({
      content: `\`❌\` You are not the guild owner. You cannot perform this action.`,
      flags: MessageFlags.Ephemeral,
    });
    return { hasPermission: false };
  }

  // Check if user owns a guild
  const guild = await Guild.findOne({ owner: user.id });
  if (!guild) {
    await interaction.reply({
      content: `\`❌\` You are not the guild owner. You cannot perform this action.`,
      flags: MessageFlags.Ephemeral,
    });
    return { hasPermission: false };
  }

  return { guild, hasPermission: true, isOwner: true };
}

// Check if user has owner-only permissions (for disband and assign admin)
async function checkOwnerPermissions(interaction) {
  const createChannelId = "1375179709381611631";
  const { user, member } = interaction;
  const { MessageFlags } = require("discord.js");

  // Check if user has Guild Owner role
  if (!member.roles.cache.has(config.GuildOwnerRoleId)) {
    await interaction.reply({
      content: `\`❌\` You need the <@&${config.GuildOwnerRoleId}> role to use Guild management features!`,
      flags: MessageFlags.Ephemeral,
    });
    return { hasPermission: false };
  }

  // Check if user owns a guild
  const guild = await Guild.findOne({ owner: user.id });
  if (!guild) {
    await interaction.reply({
      content: `\`❌\` You don't own a Guild! Create one first in the <#${createChannelId}> channel.`,
      flags: MessageFlags.Ephemeral,
    });
    return { hasPermission: false };
  }

  return { guild, hasPermission: true, isOwner: true };
}

/**
 *
 *
 * GUILD INVITATION UTILS
 *
 */
// Get all pending invitations for a guild
async function getPendingInvitations(guildId) {
  return await GuildInvitation.find({
    guildId,
    status: "pending",
  }).populate("guildId");
}

// Cancel/revoke an invitation
async function cancelInvitation(inviteId, ownerId) {
  const invitation = await GuildInvitation.findOne({
    inviteId,
    ownerId,
    status: "pending",
  });

  if (invitation) {
    await GuildInvitation.deleteOne({ _id: invitation._id });
    return true;
  }
  return false;
}

// Cancel all pending invitations for a guild
async function cancelAllGuildInvitations(guildId, ownerId) {
  const result = await GuildInvitation.deleteMany({
    guildId,
    ownerId,
    status: "pending",
  });
  return result.deletedCount;
}

// Get invitation statistics for a guild
async function getInvitationStats(guildId) {
  const stats = await GuildInvitation.aggregate([
    { $match: { guildId: mongoose.Types.ObjectId(guildId) } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  return {
    pending: stats.find((s) => s._id === "pending")?.count || 0,
    accepted: stats.find((s) => s._id === "accepted")?.count || 0,
    declined: stats.find((s) => s._id === "declined")?.count || 0,
  };
}

// Clean up old responded invitations (optional maintenance function)
async function cleanupOldInvitations(daysOld = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const result = await GuildInvitation.deleteMany({
    status: { $in: ["accepted", "declined"] },
    respondedAt: { $lt: cutoffDate },
  });

  return result.deletedCount;
}

async function notifyOwner(ownerId, userId, guildName, action) {
  try {
    const owner = await client.users.fetch(ownerId);

    // Create notification embed for better presentation
    const notificationEmbed = new EmbedBuilder()
      .setTitle(`<:filipinoGuilds:1379211588464152608> Guild Invitation Update`)
      .setDescription(`<@${userId}> ${action} for **${guildName}**!`)
      .setColor(action.includes("accepted") ? 0x00ff00 : 0xff0000)
      .setTimestamp();

    await owner.send({
      content: `**Guild Notification**`,
      embeds: [notificationEmbed],
    });
  } catch (error) {
    logger.error(`Failed to notify guild owner ${ownerId}:`, error);

    // If DM fails, try to log it to guild's log channel if available
    try {
      const guild = await Guild.findOne({ owner: ownerId });
      if (guild && guild.logChannelId) {
        const logChannel = await client.channels.fetch(guild.logChannelId);
        if (logChannel && logChannel.isTextBased()) {
          await logChannel.send(
            `\`📩\` **Owner Notification Failed**: Couldn't DM <@${ownerId}> about <@${userId}> who ${action} for **${guildName}**`
          );
        }
      }
    } catch (logError) {
      logger.error("Failed to send fallback log message:", logError);
    }
  }
}

module.exports = {
  sendManageGuildEmbed,
  sendCreateGuildEmbed,
  checkSuspensions,
  sendLogMessage,
  convertEmojiToUrl,
  userActions,
  checkUserPermissions, // Add the new function
  checkAdminPermissions, // Add the admin check function
  checkOwnerPermissions, // Add the owner check function
  checkOwnerOnlyPermissions, // Add the owner-only check function
  // Guild Invitation Utils
  getPendingInvitations,
  cancelInvitation,
  cancelAllGuildInvitations,
  getInvitationStats,
  cleanupOldInvitations,
  notifyOwner,
};
