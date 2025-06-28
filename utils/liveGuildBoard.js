const { EmbedBuilder } = require("discord.js");
const Guild = require("../schema/guild.js");
const GuildBoard = require("../schema/guildBoard.js");
const config = require("../config.js");
const logger = require("./logger.js");

// Configuration
const GUILD_BOARD_CONFIG = {
  channelId: "1375186240462389428", // Channel where the board will be posted
  maxGuildsPerEmbed: 15, // Maximum guilds per embed to avoid hitting character limits
  updateInterval: 5 * 60 * 1000, // Update every 5 minutes
  embedColor: "#e4d8c4",
  maxRetries: 3
};

let updateInterval = null;

// Get stored guild board message ID from database
async function getStoredMessageId() {
  try {
    const guildBoard = await GuildBoard.findOne({ channelId: GUILD_BOARD_CONFIG.channelId });
    return guildBoard ? guildBoard.messageId : null;
  } catch (error) {
    logger.error("Error getting stored message ID:", error);
    return null;
  }
}

// Save guild board message ID to database
async function saveMessageId(messageId) {
  try {
    await GuildBoard.findOneAndUpdate(
      { channelId: GUILD_BOARD_CONFIG.channelId },
      { 
        messageId: messageId,
        lastUpdated: new Date()
      },
      { 
        upsert: true, // Create if doesn't exist
        new: true 
      }
    );
    logger.info(`Saved guild board message ID to database: ${messageId}`);
  } catch (error) {
    logger.error("Error saving message ID:", error);
  }
}

// Remove stored message ID from database
async function removeStoredMessageId() {
  try {
    await GuildBoard.deleteOne({ channelId: GUILD_BOARD_CONFIG.channelId });
    logger.info("Removed stored guild board message ID from database");
  } catch (error) {
    logger.error("Error removing stored message ID:", error);
  }
}

// Create guild info string
function formatGuildInfo(guild, index) {
  const memberCount = guild.members?.length || 0;
  const maxMembers = guild.maxMembers || 50;
  const level = guild.level || 1;
  const totalXP = guild.totalXP || 0;
  
  // Status indicators
  const statusEmoji = guild.suspended ? "🔴" : "🟢";
  const levelEmoji = level >= 10 ? "⭐" : level >= 5 ? "💎" : "🏆";
  return [
    `\`${statusEmoji}\` **${index}. ${guild.name}**`,
    `<:guildOwner:1379167072101077063> **Owner:** <@${guild.owner}>`,
    `<:filipinoGuilds:1379211588464152608> **Role:** ${guild.roleId ? `<@&${guild.roleId}>` : "None"}`,
    `<:guildMember:1379167172118708379> **Members:** \`${memberCount}/${maxMembers}\``,
    `\`${levelEmoji}\` **Level:** \`${level}\` (\`${totalXP.toLocaleString()} XP\`)`,
    guild.description ? `\`📝\` \`${guild.description.substring(0, 80)}${guild.description.length > 80 ? "..." : ""}\`` : "",
  ].filter(line => line !== "").join("\n");
}

// Find existing guild board message in channel
async function findExistingGuildBoard(channel) {
  try {
    // Fetch recent messages to find existing guild board
    const messages = await channel.messages.fetch({ limit: 50 });
    
    // Look for a message with the guild board title
    const existingMessage = messages.find(msg => 
      msg.author.id === channel.client.user.id &&
      msg.embeds.length > 0 &&
      msg.embeds[0].title &&
      msg.embeds[0].title.includes("Filipino Guilds Directory")
    );
    
    if (existingMessage) {
      logger.info(`Found existing guild board message: ${existingMessage.id}`);
      return existingMessage;
    }
    
    return null;
  } catch (error) {
    logger.error("Error finding existing guild board:", error);
    return null;
  }
}

// Create guild board embed
async function createGuildBoardEmbed(guilds) {
  try {
    logger.info(`Creating embed with ${guilds.length} guilds`);
    
    const guildList = guilds
      .map((guild, index) => formatGuildInfo(guild, index + 1))
      .join("\n\n"); // Added extra newline for spacing between guilds

    logger.info(`Guild list length: ${guildList.length} characters`);

    // Ensure description doesn't exceed Discord's limit (4096 characters)
    const description = guildList.length > 4000 
      ? guildList.substring(0, 3900) + "\n\n...*More guilds available*" 
      : guildList || "🚫 **No guilds found!**\n\nCreate your guild in <#1375179709381611631> to get started!";

    const embed = new EmbedBuilder()
      .setTitle(`<:filipinoGuilds:1379211588464152608> **Filipino Guilds Directory**`)
      .setDescription(description)
      .setColor(GUILD_BOARD_CONFIG.embedColor)
      .setFooter({
        text: `📊 Total Guilds: ${guilds.length} | 🔄 Last Updated`,
        iconURL: "https://cdn.discordapp.com/emojis/1379211588464152608.webp"
      })
      .setTimestamp();

    // Add guild statistics
    if (guilds.length > 0) {
      const totalMembers = guilds.reduce((sum, guild) => sum + (guild.members?.length || 0), 0);
      const avgLevel = guilds.reduce((sum, guild) => sum + (guild.level || 1), 0) / guilds.length;
      const activeGuilds = guilds.filter(guild => !guild.suspended).length;
      
      embed.addFields({
        name: "\`📈\` **Statistics**",
        value: [
          `<:guildMember:1379167172118708379> **Total Members:** \`${totalMembers}\``,
          `\`📊\` **Average Level:** \`${avgLevel.toFixed(1)}\``,
          `\`🔰\` **Active Guilds:** \`${activeGuilds}/${guilds.length}\``
        ].join("\n"),
        inline: false
      });
    }

    logger.info(`Embed created successfully`);
    return embed;
  } catch (error) {
    logger.error("Error creating guild board embed:", error);
    
    // Return a fallback embed
    return new EmbedBuilder()
      .setTitle("🚫 **Guild Board Error**")
      .setDescription("There was an error loading the guild directory. Please try again later.")
      .setColor("#ff0000")
      .setTimestamp();
  }
}

// Update guild board
async function updateGuildBoard(client, forceNew = false) {
  try {
    logger.info(`Attempting to update guild board - Channel ID: ${GUILD_BOARD_CONFIG.channelId}`);
    
    const channel = await client.channels.fetch(GUILD_BOARD_CONFIG.channelId);
    if (!channel) {
      logger.error("Guild board channel not found");
      return;
    }

    logger.info(`Channel found: ${channel.name}`);

    // Fetch all guilds, sorted by level and member count
    const guilds = await Guild.find({})
      .sort({ level: -1, totalXP: -1 })
      .lean();

    logger.info(`Found ${guilds.length} guilds in database`);

    // Create the embed
    const embed = await createGuildBoardEmbed(guilds);

    // Get stored message ID from database
    const storedMessageId = await getStoredMessageId();
    
    if (forceNew || !storedMessageId) {
      // Try to find existing message in channel first
      const existingMessage = await findExistingGuildBoard(channel);
      
      if (existingMessage && !forceNew) {
        // Update existing message and save its ID
        try {
          await existingMessage.edit({ embeds: [embed] });
          await saveMessageId(existingMessage.id);
          logger.info(`Updated existing guild board message: ${existingMessage.id}`);
          return;
        } catch (error) {
          logger.warn("Failed to update existing message, creating new one:", error);
        }
      }
      
      // Create new message
      try {
        const newMessage = await channel.send({ embeds: [embed] });
        await saveMessageId(newMessage.id);
        logger.info(`Created new guild board message: ${newMessage.id}`);
        return;
      } catch (error) {
        logger.error("Failed to create new guild board message:", error);
        // Log embed details for debugging
        logger.debug("Embed details:", {
          title: embed.title,
          descriptionLength: embed.description?.length || 0,
          fieldsCount: embed.fields?.length || 0
        });
        return;
      }
    }

    // Update existing message using stored ID
    try {
      const message = await channel.messages.fetch(storedMessageId);
      await message.edit({ embeds: [embed] });
      
      // Update the last updated timestamp in database
      await GuildBoard.findOneAndUpdate(
        { channelId: GUILD_BOARD_CONFIG.channelId },
        { lastUpdated: new Date() }
      );
      
      logger.info(`Updated guild board message: ${storedMessageId}`);
    } catch (error) {
      if (error.code === 10008) { // Unknown Message - message was deleted
        logger.warn("Stored message was deleted, removing from database and creating new one");
        await removeStoredMessageId();
        await updateGuildBoard(client, false); // Retry without force
      } else {
        logger.error("Failed to update guild board message:", error);
      }
    }

  } catch (error) {
    logger.error("Error updating guild board:", error);
  }
}

// Initialize guild board
async function initializeGuildBoard(client) {
  try {
    logger.info("Initializing live guild board...");
    
    // Create or update the guild board (don't force new on startup)
    await updateGuildBoard(client, false);
    
    // Set up automatic updates
    if (updateInterval) {
      clearInterval(updateInterval);
    }
    
    updateInterval = setInterval(() => {
      updateGuildBoard(client, false);
    }, GUILD_BOARD_CONFIG.updateInterval);
    
    logger.success("Live guild board initialized successfully!");
    
  } catch (error) {
    logger.error("Error initializing guild board:", error);
  }
}

// Force refresh guild board (for manual updates)
async function refreshGuildBoard(client) {
  logger.info("Forcing guild board refresh...");
  await updateGuildBoard(client, true);
}

// Stop guild board updates
function stopGuildBoard() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
    logger.info("Guild board updates stopped");
  }
}

module.exports = {
  GUILD_BOARD_CONFIG,
  initializeGuildBoard,
  updateGuildBoard,
  refreshGuildBoard,
  stopGuildBoard
};