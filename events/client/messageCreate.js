const { EmbedBuilder, MessageFlags } = require("discord.js");
const config = require("../../config.js");
const logger = require("../../utils/logger.js");
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
  name: "messageCreate",
  async execute(message, client) {
    try {
      if (!message.guild && !message.author.bot) {
        const userId = message.author.id;
        const actionData = userActions.get(userId);

        if (!actionData) {
          await message.reply(
            'No action is currently pending. Please click "Change Icon" or "Change Banner" in the manage guild channel first.'
          );
          return;
        }

        const { action, guildName } = actionData;
        const guild = await Guild.findOne({ name: guildName });
        if (!guild) {
          await message.reply(`Guild **${guildName}** no longer exists!`);
          userActions.delete(userId);
          return;
        }

        const content = message.content.toLowerCase();
        const hasImage = message.attachments.size > 0;
        const attachment = message.attachments.first();
        const validImageTypes = ["image/png", "image/jpeg", "image/gif"];

        if (action === "icon") {
          if (content.includes("remove")) {
            await Guild.findOneAndUpdate({ name: guildName }, { icon: null });
            if (guild.roleId) {
              const discordGuild = await client.guilds.fetch(config.guildId);
              const role = await discordGuild.roles
                .fetch(guild.roleId)
                .catch(() => null);
              if (role) {
                try {
                  await role.edit({ icon: null });
                } catch (error) {
                  logger.error(
                    `Failed to remove role icon for ${guildName}:`,
                    error
                  );
                  await message.reply(
                    `Icon removed for guild **${guildName}**, but failed to update role icon (check bot permissions).`
                  );
                  userActions.delete(userId);
                  return;
                }
              }
            }
            await message.reply(
              `Icon removed for guild **${guildName}** and role!`
            );
          } else if (
            hasImage &&
            validImageTypes.includes(attachment?.contentType)
          ) {
            const imageUrl = attachment.url;
            await Guild.findOneAndUpdate(
              { name: guildName },
              { icon: imageUrl }
            );
            if (guild.roleId) {
              const discordGuild = await client.guilds.fetch(config.guildId);
              const role = await discordGuild.roles
                .fetch(guild.roleId)
                .catch(() => null);
              if (role) {
                try {
                  await role.edit({ icon: imageUrl });
                } catch (error) {
                  logger.error(
                    `Failed to update role icon for ${guildName}:`,
                    error
                  );
                  await message.reply(
                    `Icon updated for guild **${guildName}**, but failed to update role icon (check bot permissions).`
                  );
                  userActions.delete(userId);
                  return;
                }
              }
            }
            await message.reply(
              `Icon updated for guild **${guildName}** and role!`
            );
          } else if (content.match(/<a?:.+?:\d+>/)) {
            const emojiString = content.match(/<a?:.+?:\d+>/)[0];
            const emojiUrl = convertEmojiToUrl(emojiString);
            if (!emojiUrl) {
              await message.reply(
                "Invalid emoji format. Please use a valid Discord emoji."
              );
              return;
            }
            await Guild.findOneAndUpdate(
              { name: guildName },
              { icon: emojiUrl }
            );
            if (guild.roleId) {
              const role = await client.guilds.cache
                .get(guild.createChannelId)
                ?.roles.fetch(guild.roleId)
                .catch(() => null);
              if (role) {
                try {
                  await role.edit({ icon: emojiUrl });
                } catch (error) {
                  logger.error(
                    `Failed to update role icon for ${guildName}:`,
                    error
                  );
                  await message.reply(
                    `Icon updated to emoji for guild **${guildName}**, but failed to update role icon (check bot permissions or emoji access).`
                  );
                  userActions.delete(userId);
                  return;
                }
              }
            }
            await message.reply(
              `Icon updated to emoji for guild **${guildName}** and role!`
            );
          } else {
            await message.reply(
              'Please send a valid image (PNG, JPEG, or GIF), an emoji, or type "remove" to clear the icon.'
            );
            return; // Keep the action active so the user can try again
          }
        } else if (action === "banner") {
          if (content.includes("remove")) {
            await Guild.findOneAndUpdate({ name: guildName }, { banner: null });
            await message.reply(`Banner removed for guild **${guildName}**!`);
          } else if (
            hasImage &&
            validImageTypes.includes(attachment?.contentType)
          ) {
            const imageUrl = attachment.url;
            await Guild.findOneAndUpdate(
              { name: guildName },
              { banner: imageUrl }
            );
            await message.reply(`Banner updated for guild **${guildName}**!`);
          } else {
            await message.reply(
              'Please send a valid image (PNG, JPEG, or GIF) or type "remove" to clear the banner.'
            );
            return; // Keep the action active so the user can try again
          }
        }

        // Clear the user's action after successful processing
        clearTimeout(actionData.timeout);
        userActions.delete(userId); // Update the manage guild embed

        return;
      }

      // Handle DMs for guild owners (from second file)
      if (!message.guild && !message.author.bot) {
        const guild = await Guild.findOne({ owner: message.author.id });
        if (!guild) {
          await message.reply("You do not own a guild!");
          return;
        }

        const content = message.content.toLowerCase();
        const hasImage = message.attachments.size > 0;
        const attachment = message.attachments.first();
        const validImageTypes = ["image/png", "image/jpeg", "image/gif"];
        const guildName =
          content.match(/for guild (.+)/i)?.[1]?.trim() || guild.name;

        if (guildName !== guild.name) {
          await message.reply(
            `No guild found with the name "${guildName}". Please specify the correct guild name.`
          );
          return;
        }

        if (content.includes("icon")) {
          if (content.includes("remove")) {
            await Guild.findOneAndUpdate({ name: guildName }, { icon: null });
            if (guild.roleId) {
              const discordGuild = await client.guilds.fetch(config.guildId);
              const role = await discordGuild.roles
                .fetch(guild.roleId)
                .catch(() => null);
              if (role) {
                try {
                  await role.setIcon(null);
                } catch (error) {
                  logger.error(
                    `Failed to remove role icon for ${guildName}:`,
                    error
                  );
                  await message.reply(
                    `Icon removed for guild **${guildName}**, but failed to update role icon (check bot permissions).`
                  );
                  return;
                }
              }
            }
            await message.reply(
              `Icon removed for guild **${guildName}** and role!`
            );
          } else if (
            hasImage &&
            validImageTypes.includes(attachment?.contentType)
          ) {
            const imageUrl = attachment.url;
            await Guild.findOneAndUpdate(
              { name: guildName },
              { icon: imageUrl }
            );
            if (guild.roleId) {
              const role = await client.guilds.cache
                .get(guild.createChannelId)
                ?.roles.fetch(guild.roleId)
                .catch(() => null);
              if (role) {
                try {
                  await role.setIcon(imageUrl);
                } catch (error) {
                  logger.error(
                    `Failed to update role icon for ${guildName}:`,
                    error
                  );
                  await message.reply(
                    `Icon updated for guild **${guildName}**, but failed to update role icon (check bot permissions).`
                  );
                  return;
                }
              }
            }
            await message.reply(
              `Icon updated for guild **${guildName}** and role!`
            );
          } else if (content.match(/<a?:.+?:\d+>/)) {
            const emoji = content.match(/<a?:.+?:\d+>/)[0];
            await Guild.findOneAndUpdate({ name: guildName }, { icon: emoji });
            if (guild.roleId) {
              const discordGuild = await client.guilds.fetch(config.guildId);
              const role = await discordGuild.roles
                .fetch(guild.roleId)
                .catch(() => null);
              if (role) {
                try {
                  await role.setIcon(emoji);
                } catch (error) {
                  logger.error(
                    `Failed to update role icon for ${guildName}:`,
                    error
                  );
                  await message.reply(
                    `Icon updated to emoji for guild **${guildName}**, but failed to update role icon (check bot permissions or emoji access).`
                  );
                  return;
                }
              }
            }
            await message.reply(
              `Icon updated to emoji for guild **${guildName}** and role!`
            );
          } else {
            await message.reply(
              'Please attach a valid image (PNG, JPEG, or GIF), use an emoji, or type "remove" to clear the icon (e.g., "icon for guild MyGuild").'
            );
          }
        } else if (content.includes("banner")) {
          if (content.includes("remove")) {
            await Guild.findOneAndUpdate({ name: guildName }, { banner: null });
            await message.reply(`Banner removed for guild **${guildName}**!`);
          } else if (
            hasImage &&
            validImageTypes.includes(attachment?.contentType)
          ) {
            const imageUrl = attachment.url;
            await Guild.findOneAndUpdate(
              { name: guildName },
              { banner: imageUrl }
            );
            await message.reply(`Banner updated for guild **${guildName}**!`);
          } else {
            await message.reply(
              'Please attach a valid image (PNG, JPEG, or GIF) or type "remove" to clear the banner (e.g., "banner for guild MyGuild").'
            );
          }
        }
        return;
      }

      // Regular command handling
      if (message.author.bot || !message.content.startsWith(config.prefix))
        return;

      // Extract command name and arguments
      const args = message.content
        .slice(config.prefix.length)
        .trim()
        .split(/ +/);
      const commandName = args.shift().toLowerCase();      // Find the command in the collection (first check direct command name)
      let command = client.commands.get(commandName);
      
      // If not found, check aliases
      if (!command) {
        command = client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));
      }
      
      if (!command) return;

      // Check if the command is available for prefix usage
      if (command.prefix === false) {
        return message.reply("This command is not available for prefix usage.");
      }

      try {
        if (typeof command.run === "function") {
          await command.run(message, args, client);
        } else if (typeof command.execute === "function") {
          await command.execute(message, args, client);
        } else {
          throw new Error("Command has no run or execute method");
        }
      } catch (error) {
        logger.error(`Command execution error (${commandName}):`, error);

        // Create a detailed error embed
        const errorEmbed = new EmbedBuilder()
          .setTitle("Command Error")
          .setColor(config.embedColors.red)
          .addFields(
            { name: "Command", value: commandName || "Unknown" },
            { name: "User", value: message.author.tag },
            { name: "Channel", value: `#${message.channel.name}` },
            { name: "Error", value: `\`\`\`${error.message}\`\`\`` },
            {
              name: "Stack Trace",
              value: `\`\`\`${
                error.stack ? error.stack.substring(0, 1000) : "No stack trace"
              }\`\`\``,
            }
          )
          .setTimestamp();

        // Notify the user of the failure
        try {
          await message.reply({
            content: "There was an error while executing this command!",
            flags: MessageFlags.Ephemeral,
          });
        } catch (replyError) {
          logger.error("Failed to reply to the user:", replyError.message);
        }

        // Notify the developer
        if (config.developerId) {
          try {
            const developer = await client.users.fetch(config.developerId);
            await developer.send({ embeds: [errorEmbed] });
          } catch (devError) {
            logger.error("Failed to notify the developer:", devError.message);
          }
        }
      }
    } catch (globalError) {
      // Catch any unexpected errors in the event handler itself
      logger.error("Unexpected error in messageCreate event:", globalError);
    }
  },
};
