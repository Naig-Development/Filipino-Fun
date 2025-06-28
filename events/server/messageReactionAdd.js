const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const axios = require("axios"); // Replace node-fetch with axios
const config = require("../../config.js");
const logger = require("../../utils/logger.js");
const fs = require("fs");
const path = require("path");

module.exports = {
  name: "messageReactionAdd",
  once: false,
  async execute(reaction, user) {
    // logger.info(
    //   `[REACTION ADD] By ${user.tag} - ${
    //     reaction.emoji.name || reaction.emoji.id
    //   }`
    // );

    // Ignore bot reactions
    if (user.bot) return;

    // If the reaction is partial, fetch it
    if (reaction.partial) {
      try {
        await reaction.fetch();
        //logger.info("[REACTION] Fetched partial reaction");
      } catch (error) {
        logger.error("Error fetching reaction:", error);
        return;
      }
    }

    // Ensure message is not partial
    let message = reaction.message;
    if (message.partial) {
      try {
        message = await message.fetch();
        //logger.info("[MESSAGE] Fetched partial message");
      } catch (error) {
        logger.error("Error fetching message:", error);
        return;
      }
    }

    if (message.channel.isThread()) {
      //logger.info("[STARBOARD] Ignoring reaction from thread channel");
      return;
    }

    // Don't process reactions on messages in the starboard channel itself
    if (message.channel.id === config.starboardChannelId) {
      //logger.info("[STARBOARD] Ignoring reaction in starboard channel");
      return;
    }

    // Check if the reaction emoji matches the configured emoji
    const validEmoji = config.starboardEmojis;
    if (reaction.emoji.name !== validEmoji) {
      // logger.info(
      //   `[STARBOARD] Ignoring reaction with emoji ${reaction.emoji.name}, only ${validEmoji} is allowed`
      // );
      return;
    }

    // REMOVED: Check for media attachments - now all messages can be starboarded

    try {
      // Count reactions based on configuration (excluding bots)
      let totalEmojiCount = await countReactions(message);

      logger.info(
        `[STARBOARD] Message ${message.id} has ${totalEmojiCount} qualifying reactions (threshold: ${config.starThreshold})`
      );

      // Check for existing starboard post
      const existingMsg = await findStarboardMessage(
        message.client,
        message.id
      );

      // Only create a new entry if the count EXACTLY matches the threshold
      if (!existingMsg && totalEmojiCount === config.starThreshold) {
        // Create new entry exactly at threshold
        await createStarboardPost(message, totalEmojiCount);
        // logger.info(
        //   `[STARBOARD] Creating entry at exact threshold (${totalEmojiCount})`
        // );
      }
      // Update existing entry if count is at or above threshold
      else if (existingMsg && totalEmojiCount >= config.starThreshold) {
        // Update existing entry
        await updateStarboardPost(message, existingMsg, totalEmojiCount);
        // logger.info(
        //   `[STARBOARD] Updating entry with new count (${totalEmojiCount})`
        // );
      }
    } catch (error) {
      logger.error("Error processing reaction:", error);
    }
  },
};

// Keep these functions for attachment handling, but don't use them to filter messages
function hasMediaAttachment(message) {
  if (message.attachments.size === 0) return false;

  for (const attachment of message.attachments.values()) {
    if (
      attachment.contentType &&
      (attachment.contentType.startsWith("image/") ||
        attachment.contentType.startsWith("video/"))
    ) {
      return true;
    }
  }

  return false;
}

function isVideoAttachment(attachment) {
  return attachment.contentType && attachment.contentType.startsWith("video/");
}

// Count eligible reactions based on config (excluding bot reactions)
async function countReactions(message) {
  let totalEmojiCount = 0;

  // Only count the specific emoji defined in the config
  const validEmoji = config.starboardEmojis;

  const reaction = message.reactions.cache.find(
    (r) => r.emoji.name === validEmoji
  );

  if (reaction) {
    try {
      // Fetch all users who reacted
      await reaction.users.fetch();
      // Count only non-bot users
      const nonBotCount = reaction.users.cache.filter((user) => !user.bot).size;
      totalEmojiCount += nonBotCount;
      // logger.info(
      //   `[COUNTING] Emoji: ${reaction.emoji.name} non-bot count: ${nonBotCount}/${reaction.count}`
      // );
    } catch (error) {
      logger.error(`Error fetching users for reaction:`, error);
    }
  }

  return totalEmojiCount;
}

// Create a new starboard post, handling video attachments specially
async function createStarboardPost(message, emojiCount) {
  if (!config.starboardChannelId) {
    logger.info("[STARBOARD] No starboard channel configured");
    return;
  }

  try {
    const client = message.client;
    const starboardChannel = await client.channels.fetch(
      config.starboardChannelId
    );

    if (!starboardChannel) {
      logger.error("[STARBOARD] Channel not found");
      return;
    }

    // Create embed for starboard
    const embed = createStarboardEmbed(message, emojiCount);
    const hahaEmoji = "⭐";

    // Get the first attachment if any
    const attachment = message.attachments.first();
    
    // Check if it's a video
    if (attachment && isVideoAttachment(attachment)) {
      logger.info(`[STARBOARD] Video detected, fetching: ${attachment.url}`);
      
      try {
        // Fetch the video file using axios instead of fetch
        const response = await axios.get(attachment.url, {
          responseType: 'arraybuffer' // Important for binary data
        });
        
        // Create a buffer from the response data
        const videoBuffer = Buffer.from(response.data);
        
        // Create a Discord attachment with the video
        const videoAttachment = new AttachmentBuilder(videoBuffer, {
          name: attachment.name || "video.mp4"
        });
        
        // Send message with video as attachment
        const starboardMsg = await starboardChannel.send({
          content: `${hahaEmoji} **${emojiCount}** | <#${message.channel.id}>`,
          embeds: [embed],
          files: [videoAttachment]
        });
        
        await starboardMsg.react(hahaEmoji);
        logger.info(`[STARBOARD] Successfully posted video to starboard`);
      } catch (error) {
        logger.error(`[STARBOARD] Error fetching/posting video: ${error.message}`);
        
        // Fallback: Post without fetching the video, just use a link
        const starboardMsg = await starboardChannel.send({
          content: `${hahaEmoji} **${emojiCount}** | <#${message.channel.id}>`,
          embeds: [embed]
        });
        
        await starboardMsg.react(hahaEmoji);
        logger.info(`[STARBOARD] Posted embed with video link as fallback`);
      }
    } else {
      // For images, text or other messages, use the normal embed approach
      const starboardMsg = await starboardChannel.send({
        content: `${hahaEmoji} **${emojiCount}** | <#${message.channel.id}>`,
        embeds: [embed]
      });
      
      await starboardMsg.react(hahaEmoji);
      logger.info(`[STARBOARD] Successfully posted message to starboard`);
    }
  } catch (error) {
    logger.error("[STARBOARD] Error creating starboard post:", error);
  }
}

// Update an existing starboard post
async function updateStarboardPost(message, existingMsg, emojiCount) {
  try {
    const embed = createStarboardEmbed(message, emojiCount);
    const hahaEmoji = "⭐";
    
    // Update the existing message
    await existingMsg.edit({
      content: `${hahaEmoji} **${emojiCount}** | <#${message.channel.id}>`,
      embeds: [embed]
    });
    
    logger.info(`[STARBOARD] Updated starboard post for message ${message.id}`);
  } catch (error) {
    logger.error("[STARBOARD] Error updating starboard post:", error);
  }
}

// Find a message in the starboard channel
async function findStarboardMessage(client, messageId) {
  try {
    const starboardChannel = await client.channels.fetch(
      config.starboardChannelId
    );
    const messages = await starboardChannel.messages.fetch({ limit: 100 });

    return messages.find(
      (m) =>
        m.embeds.length > 0 &&
        m.embeds[0].footer &&
        m.embeds[0].footer.text.includes(messageId)
    );
  } catch (error) {
    logger.error("[STARBOARD] Error finding message:", error);
    return null;
  }
}

// Create a starboard embed for a message
function createStarboardEmbed(message, emojiCount) {
  const embed = new EmbedBuilder()
    .setAuthor({
      name: message.author.tag,
      iconURL: message.author.displayAvatarURL(),
    })
    .setDescription(
      message.content +
        `\n\`🔗\` **[Click To Jump to Message!](${message.url})**` ||
        " " + `\n\`🔗\` **[Click To Jump to Message!](${message.url})**`
    )
    .setColor(config.embedColors?.gold || "#FFD700")
    .setTimestamp(message.createdAt);

  // Add image attachments to embed
  const attachment = message.attachments.first();
  if (attachment) {
    // Only embed images directly, videos will be attached separately
    if (attachment.contentType && attachment.contentType.startsWith("image/")) {
      embed.setImage(attachment.url);
    }
  }

  return embed;
}