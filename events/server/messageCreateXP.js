const { awardMessageXP } = require("../../utils/xpUtils.js");
const logger = require("../../utils/logger.js");

module.exports = {
  name: "messageCreate",
  async execute(message, client) {
    try {
      // Skip if message is from a bot
      if (message.author?.bot) return;
      
      // Skip if message is in DMs
      if (!message.guild) return;
      
      // Additional safety checks before awarding XP
      if (!message.guild?.id || !message.author?.id) {
        logger.warn("Missing guild or author ID in messageCreate XP handler");
        return;
      }
      
      // Skip if message content is too short or empty
      if (!message.content || message.content.trim().length < 3) {
        return;
      }
      
      // Award XP for guild members
      await awardMessageXP(client, message);
      
    } catch (error) {
      logger.error("Error in messageCreate XP handler:", error);
      
      // Log additional debug information
      logger.debug(`Message details: Author ID: ${message.author?.id}, Guild ID: ${message.guild?.id}, Channel ID: ${message.channel?.id}`);
    }
  },
};