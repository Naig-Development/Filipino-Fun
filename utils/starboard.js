const { EmbedBuilder } = require('discord.js');
const logger = require('./logger.js');
const config = require('../config.js');

// Cache to store starboard messages
const starboardMessages = new Map();

/**
 * Create a starboard embed for a message
 */
function createStarboardEmbed(message, emojiCount) {
    const embed = new EmbedBuilder()
        .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
        .setDescription(message.content || "")
        .setColor(config.embedColors.gold || '#FFD700')
        .setTimestamp(message.createdAt)
        .setFooter({ text: `${emojiCount} custom emoji reactions • Message ID: ${message.id}` });

    // Add message link if possible
    embed.addFields({ name: 'Jump to Message', value: `[Click Here](${message.url})` });

    // Add attachments if any
    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        // Check if it's an image
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            embed.setImage(attachment.url);
        } else {
            embed.addFields({ name: 'Attachment', value: attachment.url });
        }
    }

    return embed;
}

/**
 * Check if a message is already on the starboard
 */
async function getStarboardMessage(client, messageId) {
    // Check cache first
    if (starboardMessages.has(messageId)) {
        return starboardMessages.get(messageId);
    }

    // Not in cache, try to find it in the starboard channel
    try {
        const starboardChannel = await client.channels.fetch(config.starboardChannelId);
        const messages = await starboardChannel.messages.fetch({ limit: 100 });
        
        for (const msg of messages.values()) {
            // Check for embeds that contain the message ID in the footer
            if (msg.embeds.length > 0 && 
                msg.embeds[0].footer && 
                msg.embeds[0].footer.text.includes(messageId)) {
                
                // Store in cache and return
                starboardMessages.set(messageId, msg);
                return msg;
            }
        }
        return null;
    } catch (error) {
        logger.error('Error finding starboard message:', error);
        return null;
    }
}

/**
 * Add or update a message on the starboard
 */
async function updateStarboard(message, emojiCount) {
    if (!config.starboardChannelId) return;
    
    try {
        const client = message.client;
        const starboardChannel = await client.channels.fetch(config.starboardChannelId);
        
        if (!starboardChannel) {
            logger.error('Starboard channel not found');
            return;
        }

        // Check if message is already on starboard
        const existingMessage = await getStarboardMessage(client, message.id);
        const embed = createStarboardEmbed(message, emojiCount);
        
        if (existingMessage) {
            // Update existing starboard entry
            await existingMessage.edit({ embeds: [embed] });
        } else if (emojiCount >= config.starThreshold) {
            // Create new starboard entry
            const starboardMsg = await starboardChannel.send({ 
                content: `**${emojiCount}** custom emoji reactions in <#${message.channel.id}>`,
                embeds: [embed]
            });
            starboardMessages.set(message.id, starboardMsg);
        }
    } catch (error) {
        logger.error('Error updating starboard:', error);
    }
}

/**
 * Remove a message from the starboard if reactions fall below threshold
 */
async function removeFromStarboard(message) {
    try {
        const existingMessage = await getStarboardMessage(message.client, message.id);
        if (existingMessage) {
            await existingMessage.delete();
            starboardMessages.delete(message.id);
        }
    } catch (error) {
        logger.error('Error removing from starboard:', error);
    }
}

module.exports = {
    updateStarboard,
    removeFromStarboard,
    getStarboardMessage
};
