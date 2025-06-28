const { PermissionsBitField, MessageFlags } = require("discord.js");
const Guild = require("../../schema/guild.js");
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

module.exports = {
  name: "manage-guild",
  description: "Send the manage guild embed to the default manage channel",
  prefix: true,
  async execute(message, args, client) {
    // Check for Administrator permissions
    if (
      !message.member.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      return message.reply({
        content: "You need Administrator permissions to use this command!",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Send manage guild embed to default channel
    await sendManageGuildEmbed(client);

    await message.reply({
      content: `Manage guild embed sent to the default manage channel!`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
