const { EmbedBuilder } = require('discord.js');
const config = require('../../config.js');
const logger = require('../../utils/logger.js');

module.exports = {
    name: 'messageReactionRemove',
    once: false,
    async execute(reaction, user) {
        //logger.info(`[REACTION REMOVE] By ${user.tag} - ${reaction.emoji.name || reaction.emoji.id}`);
        
        // Ignore bot reactions
        if (user.bot) return;
        
        // If the reaction is partial, fetch it
        if (reaction.partial) {
            try {
                await reaction.fetch();
                //logger.info('[REACTION] Fetched partial reaction');
            } catch (error) {
                logger.error('Error fetching reaction:', error);
                return;
            }
        }

        // Ensure message is not partial
        let message = reaction.message;
        if (message.partial) {
            try {
                message = await message.fetch();
                //logger.info('[MESSAGE] Fetched partial message');
            } catch (error) {
                logger.error('Error fetching message:', error);
                return;
            }
        }

        // Don't process reactions on messages in the starboard channel itself
        if (message.channel.id === config.starboardChannelId) {
            //logger.info('[STARBOARD] Ignoring reaction in starboard channel');
            return;
        }
        
        // Skip if not an image message
        if (!hasImageAttachment(message)) {
            //logger.info('[STARBOARD] Message has no image attachment, ignoring');
            return;
        }

        try {
            // Count reactions based on configuration
            let totalEmojiCount = await countReactions(message);
            
            logger.info(`[STARBOARD] After removal: message ${message.id} has ${totalEmojiCount} qualifying reactions (threshold: ${config.starThreshold})`);
            
            if (totalEmojiCount >= config.starThreshold) {
                // Update the starboard entry with the new count
                await updateStarboard(message, totalEmojiCount);
            } else {
                // Remove from starboard if below threshold
                await removeFromStarboard(message);
                logger.info(`[STARBOARD] Message ${message.id} now below threshold (${totalEmojiCount}/${config.starThreshold}), removing from starboard`);
            }
        } catch (error) {
            logger.error('Error processing reaction removal:', error);
        }
    },
};

// Check if message has an image attachment
function hasImageAttachment(message) {
    if (message.attachments.size === 0) return false;
    
    for (const attachment of message.attachments.values()) {
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            return true;
        }
    }
    
    return false;
}


// Count eligible reactions based on config (excluding bot reactions)
async function countReactions(message) {
    let totalEmojiCount = 0;
    
    if (config.countAllCustomEmojis) {
        // Count all custom emoji reactions (not unicode emojis)
        const customEmojiReactions = message.reactions.cache.filter(r => r.emoji.id !== null);
        
        for (const reaction of customEmojiReactions.values()) {
            // We need to fetch users who reacted to exclude bots
            const nonBotCount = reaction.users.cache.filter(user => !user.bot).size;
            totalEmojiCount += nonBotCount;
            logger.info(`[COUNTING] Custom emoji: ${reaction.emoji.name} (${reaction.emoji.id}) non-bot count: ${nonBotCount}/${reaction.count}`);
        }
    } else if (config.starboardEmojis && config.starboardEmojis.length > 0) {
        // Count only the specified emojis
        for (const emojiId of config.starboardEmojis) {
            const reaction = message.reactions.cache.find(r => r.emoji.id === emojiId);
            if (reaction) {
                // We need to fetch users who reacted to exclude bots
                const nonBotCount = reaction.users.cache.filter(user => !user.bot).size;
                totalEmojiCount += nonBotCount;
                logger.info(`[COUNTING] Specific emoji: ${reaction.emoji.name} (${reaction.emoji.id}) non-bot count: ${nonBotCount}/${reaction.count}`);
            }
        }
    } else {
        // Fallback to all custom emojis if no specific ones are configured
        const customEmojiReactions = message.reactions.cache.filter(r => r.emoji.id !== null);
        
        for (const reaction of customEmojiReactions.values()) {
            // We need to fetch users who reacted to exclude bots
            const nonBotCount = reaction.users.cache.filter(user => !user.bot).size;
            totalEmojiCount += nonBotCount;
            logger.info(`[COUNTING] Fallback custom emoji: ${reaction.emoji.name} (${reaction.emoji.id}) non-bot count: ${nonBotCount}/${reaction.count}`);
        }
    }
    
    return totalEmojiCount;
}

// Process starboard updates
async function updateStarboard(message, emojiCount) {
    if (!config.starboardChannelId) {
        logger.info('[STARBOARD] No starboard channel configured');
        return;
    }
    
    try {
        const client = message.client;
        const starboardChannel = await client.channels.fetch(config.starboardChannelId);
        
        if (!starboardChannel) {
            logger.error('[STARBOARD] Channel not found');
            return;
        }

        // Check for existing entry
        const existingMsg = await findStarboardMessage(client, message.id);
        
        // Create embed for starboard
        const embed = createStarboardEmbed(message, emojiCount);
        
        if (existingMsg) {
            // Update existing starboard entry
            logger.info(`[STARBOARD] Updating existing entry for message ${message.id}`);
            await existingMsg.edit({ 
                content: `**${emojiCount}** custom emoji reactions in <#${message.channel.id}>`,
                embeds: [embed] 
            });
        }
    } catch (error) {
        logger.error('[STARBOARD] Error updating starboard:', error);
    }
}

// Remove a message from the starboard
async function removeFromStarboard(message) {
    try {
        const client = message.client;
        const existingMsg = await findStarboardMessage(client, message.id);
        
        if (existingMsg) {
            logger.info(`[STARBOARD] Removing message ${message.id} from starboard`);
            await existingMsg.delete();
        }
    } catch (error) {
        logger.error('[STARBOARD] Error removing from starboard:', error);
    }
}

// Find a message in the starboard channel
async function findStarboardMessage(client, messageId) {
    try {
        const starboardChannel = await client.channels.fetch(config.starboardChannelId);
        const messages = await starboardChannel.messages.fetch({ limit: 100 });
        
        return messages.find(m => 
            m.embeds.length > 0 && 
            m.embeds[0].footer && 
            m.embeds[0].footer.text.includes(messageId)
        );
    } catch (error) {
        logger.error('[STARBOARD] Error finding message:', error);
        return null;
    }
}

// Create a starboard embed for a message
function createStarboardEmbed(message, emojiCount) {
    const embed = new EmbedBuilder()
        .setAuthor({ 
            name: message.author.tag, 
            iconURL: message.author.displayAvatarURL() 
        })
        .setDescription(message.content || "")
        .setColor(config.embedColors?.gold || '#FFD700')
        .setTimestamp(message.createdAt)
        .setFooter({ text: `${emojiCount} custom emoji reactions • Message ID: ${message.id}` });

    // Add message link
    embed.addFields({ name: 'Jump to Message', value: `[Click Here](${message.url})` });

    // Add attachments if any
    if (message.attachments.size > 0) {
        const attachment = message.attachments.first();
        if (attachment.contentType && attachment.contentType.startsWith('image/')) {
            embed.setImage(attachment.url);
        } else {
            embed.addFields({ name: 'Attachment', value: attachment.url });
        }
    }

    return embed;
}