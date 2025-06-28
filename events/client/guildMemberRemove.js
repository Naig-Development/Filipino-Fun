const config = require("../../config.js");
const logger = require("../../utils/logger.js");
const VanityUrl = require("../../schema/vanityUrl.js");

module.exports = {
  name: "guildMemberRemove",
  async execute(member, client) {
    if (!member.guild) return;

    const guildSettings = config.guilds?.[member.guild.id] || {};
    if (!guildSettings.vanityTracking?.enabled) return;

    try {
      const userId = member.id;
      const guildId = member.guild.id;

      const updateResult = await VanityUrl.updateMany(
        {
          guildId: guildId,
          "activeUsers.userId": userId,
        },
        {
          $pull: {
            activeUsers: { userId: userId },
          },
        }
      );
      if (updateResult.modifiedCount > 0) {
        logger.info(
          `Removed user ${member.user.tag} (${userId}) from ${updateResult.modifiedCount} tracked terms due to server leave in guild ${guildId}`
        );
        if (guildSettings.vanityTracking?.logChannelId) {
        }
      }
    } catch (error) {
      logger.error(
        `Error removing user from vanity tracking: ${error.message}`
      );
    }
  },
};
