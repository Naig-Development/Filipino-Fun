const Guild = require("../schema/guild.js");
const { sendLogMessage } = require("./guildUtils.js");
const config = require("../config.js");
const logger = require("./logger.js");

// XP Constants
const XP_CONFIG = {
  MESSAGE_XP: 10, // XP per message
  MESSAGE_COOLDOWN: 5000, // 5 seconds
  VOICE_XP_MIN: 5, // Minimum VC XP
  VOICE_XP_MAX: 15, // Maximum VC XP
  VOICE_INTERVAL: 20000, // 20 seconds
  BOOST_MULTIPLIER: 1.5, // XP multiplier for boosters/donors
  BASE_XP_TO_LEVEL: 1000, // Base XP needed for level 2
  XP_SCALING: 1.2 // XP requirement scaling per level
};

// Calculate XP needed for next level
function calculateXPForLevel(level) {
  return Math.floor(XP_CONFIG.BASE_XP_TO_LEVEL * Math.pow(XP_CONFIG.XP_SCALING, level - 1));
}

// Calculate level from total XP
function calculateLevelFromXP(totalXP) {
  let level = 1;
  let xpNeeded = 0;
  
  while (xpNeeded <= totalXP) {
    xpNeeded += calculateXPForLevel(level);
    if (xpNeeded <= totalXP) level++;
  }
  
  return level;
}

// Check if user is in any guild
async function getUserGuild(userId) {
  return await Guild.findOne({ members: userId });
}

// Check if user has boost privileges
function hasBoostPrivileges(member) {
  // Check for server booster role or donor role from config
  return member.roles.cache.has(config.ServerBoosterRoleId) || 
         member.roles.cache.has(config.DonorRoleId);
}

// Award message XP to guild
async function awardMessageXP(client, message) {
  try {
    const { author, member, guild: discordGuild } = message;
    
    // Skip bots
    if (author.bot) return;
    
    // Additional safety checks
    if (!author?.id || !discordGuild?.id) {
      logger.warn("Missing author or guild in awardMessageXP");
      return;
    }
    
    // Find user's guild
    const guild = await getUserGuild(author.id);
    if (!guild || guild.suspended) return;
    
    // Initialize or fix lastMessageXP Map if it's null/undefined
    if (!guild.lastMessageXP || typeof guild.lastMessageXP.get !== 'function') {
      guild.lastMessageXP = new Map();
    }
    
    // Check cooldown
    const lastMessageTime = guild.lastMessageXP.get(author.id);
    const now = new Date();
    
    if (lastMessageTime && (now - lastMessageTime) < XP_CONFIG.MESSAGE_COOLDOWN) {
      return; // Still on cooldown
    }
    
    // Calculate XP amount
    let xpAmount = XP_CONFIG.MESSAGE_XP;
    
    // Apply boost multiplier if user has privileges and member exists
    if (member && hasBoostPrivileges(member)) {
      xpAmount = Math.floor(xpAmount * XP_CONFIG.BOOST_MULTIPLIER);
    }
    
    // Ensure XP values exist and are numbers
    guild.totalXP = guild.totalXP || 0;
    guild.weeklyXP = guild.weeklyXP || 0;
    guild.monthlyXP = guild.monthlyXP || 0;
    guild.level = guild.level || 1;
    
    // Update guild XP
    const oldLevel = guild.level;
    guild.totalXP += xpAmount;
    guild.weeklyXP += xpAmount;
    guild.monthlyXP += xpAmount;
    guild.lastMessageXP.set(author.id, now);
    
    // Calculate new level
    const newLevel = calculateLevelFromXP(guild.totalXP);
    const xpForCurrentLevel = calculateXPForLevel(newLevel);
    const xpForNextLevel = calculateXPForLevel(newLevel + 1);
    
    guild.level = newLevel;
    guild.xpToNextLevel = xpForNextLevel - (guild.totalXP - xpForCurrentLevel);
    
    await guild.save();
    
    // Check for level up
    if (newLevel > oldLevel) {
      await handleLevelUp(client, guild, oldLevel, newLevel, author);
    }
    
  } catch (error) {
    logger.error('Error awarding message XP:', error);
    // Log additional context for debugging
    logger.debug(`Message details: Author ID: ${message.author?.id}, Guild ID: ${message.guild?.id}`);
  }
}

// Award voice channel XP to guild
async function awardVoiceXP(client, voiceState) {
  try {
    const { member, guild: discordGuild } = voiceState;
    
    // Skip bots
    if (member.user.bot) return;
    
    // Find user's guild
    const guild = await getUserGuild(member.id);
    if (!guild || guild.suspended) return;
    
    // Check if user is in an active voice state (not muted/deafened)
    if (member.voice.selfMute || member.voice.selfDeaf) return;
    
    // Calculate XP amount (random between min and max)
    let xpAmount = Math.floor(Math.random() * (XP_CONFIG.VOICE_XP_MAX - XP_CONFIG.VOICE_XP_MIN + 1)) + XP_CONFIG.VOICE_XP_MIN;
    
    // Apply boost multiplier if user has privileges
    if (hasBoostPrivileges(member)) {
      xpAmount = Math.floor(xpAmount * XP_CONFIG.BOOST_MULTIPLIER);
    }
    
    // Bonus XP for multiple members in VC
    const vcMembers = guild.voiceChannelMembers.length;
    if (vcMembers > 1) {
      xpAmount = Math.floor(xpAmount * (1 + (vcMembers - 1) * 0.1)); // 10% bonus per additional member
    }
    
    // Update guild XP
    const oldLevel = guild.level;
    guild.totalXP += xpAmount;
    guild.weeklyXP += xpAmount;
    guild.monthlyXP += xpAmount;
    
    // Calculate new level
    const newLevel = calculateLevelFromXP(guild.totalXP);
    const xpForCurrentLevel = calculateXPForLevel(newLevel);
    const xpForNextLevel = calculateXPForLevel(newLevel + 1);
    
    guild.level = newLevel;
    guild.xpToNextLevel = xpForNextLevel - (guild.totalXP - xpForCurrentLevel);
    
    await guild.save();
    
    // Check for level up
    if (newLevel > oldLevel) {
      await handleLevelUp(client, guild, oldLevel, newLevel, member.user);
    }
    
  } catch (error) {
    logger.error('Error awarding voice XP:', error);
  }
}

// Handle guild level up
async function handleLevelUp(client, guild, oldLevel, newLevel, user) {
  try {
    const LevelUpChannelId = "962117575335088151"
    // Log level up
    await sendLogMessage(client, guild, 
      `<a:confeti:1379545512507740352> **LEVEL UP!** Guild **${guild.name}** reached level **${newLevel}**! ` +
      `Thanks to <@${user.id}> for contributing XP!`
    );
    
    // Send level up message to welcome channel
    if (LevelUpChannelId) {
      const LevelUpChannel = await client.channels.fetch(LevelUpChannelId).catch(() => null);
      if (LevelUpChannel) {
        const { EmbedBuilder } = require("discord.js");
        const levelUpEmbed = new EmbedBuilder()
          .setDescription(`<a:confeti:1379545512507740352> ${guild.name} - **LEVEL UP!**\n\nYour Guild has reached **Level ${newLevel}**!`)
          .addFields(
            { name: "<a:blue_arrow:1313912306672861335> Previous Level", value: oldLevel.toString(), inline: true },
            { name: "<a:blue_arrow:1313912306672861335> New Level", value: newLevel.toString(), inline: true },
            { name: "<a:blue_arrow:1313912306672861335> Total XP", value: guild.totalXP.toLocaleString(), inline: true }
          )
          .setColor(guild.embedColor || "#e4d8c4")
          .setTimestamp();
        
        await LevelUpChannel.send({ embeds: [levelUpEmbed] });
      }
    }
    
  } catch (error) {
    logger.error('Error handling level up:', error);
  }
}

// Update voice channel member tracking
async function updateVoiceChannelTracking(userId, joined = true) {
  try {
    const guild = await getUserGuild(userId);
    if (!guild) return;
    
    if (joined) {
      if (!guild.voiceChannelMembers.includes(userId)) {
        guild.voiceChannelMembers.push(userId);
      }
    } else {
      guild.voiceChannelMembers = guild.voiceChannelMembers.filter(id => id !== userId);
    }
    
    await guild.save();
  } catch (error) {
    logger.error('Error updating voice channel tracking:', error);
  }
}

// Check and enforce one guild per user rule
async function checkOneGuildPerUser(userId, targetGuildName) {
  const existingGuild = await getUserGuild(userId);
  
  if (existingGuild && existingGuild.name !== targetGuildName) {
    return {
      hasGuild: true,
      guildName: existingGuild.name,
      message: `\`❌\` <@${userId}> is already a member of **${existingGuild.name}**! Users can only be in one Guild at a time.`
    };
  }
  
  return { hasGuild: false };
}

// Reset weekly/monthly XP (call this from a scheduled task)
async function resetPeriodicXP(period = 'weekly') {
  try {
    const updateData = period === 'weekly' 
      ? { weeklyXP: 0, lastXPReset: new Date() }
      : { monthlyXP: 0, lastXPReset: new Date() };
    
    await Guild.updateMany({}, updateData);
    logger.info(`Reset ${period} XP for all guilds`);
  } catch (error) {
    logger.error(`Error resetting ${period} XP:`, error);
  }
}

module.exports = {
  XP_CONFIG,
  calculateXPForLevel,
  calculateLevelFromXP,
  getUserGuild,
  hasBoostPrivileges,
  awardMessageXP,
  awardVoiceXP,
  handleLevelUp,
  updateVoiceChannelTracking,
  checkOneGuildPerUser,
  resetPeriodicXP
};