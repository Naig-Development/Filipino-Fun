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
  notifyOwner
} = require("../../utils/guildUtils.js");


module.exports = {
  name: "guild-delete",
  description: "Delete a guild",
  prefix: true,
  async execute(message, args, client) {
    // Check for Administrator permissions
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({
        content: "You need Administrator permissions to use this command!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const guildName = args[0];
    if (!guildName) {
      return message.reply({
        content: "Please provide a guild name to delete!",
        flags: MessageFlags.Ephemeral,
      });
    }

    const guild = await Guild.findOne({ name: guildName });
    if (!guild) {
      return message.reply({
        content: `Guild **${guildName}** does not exist!`,
        flags: MessageFlags.Ephemeral,
      });
    }

    if (guild.roleId) {
      const role = client.guilds.cache
        .get(guild.createChannelId)
        ?.roles.cache.get(guild.roleId);
      if (role) await role.delete().catch(logger.error);
    }
    
    await Guild.deleteOne({ name: guildName });
    await message.reply({
      content: `Guild **${guildName}** has been deleted!`,
      flags: MessageFlags.Ephemeral,
    });
  }
};