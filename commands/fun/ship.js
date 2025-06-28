const { SlashCommandBuilder } = require('@discordjs/builders');
const { AttachmentBuilder, CommandInteraction, Message } = require('discord.js');
const { createCanvas, loadImage } = require('canvas');
const logger = require('../../utils/logger.js');

// Temporary memory to store ship percentages
const shipMemory = new Map();

// Function to get a consistent percentage for the same pair
function getOrCreatePercentage(user1Id, user2Id) {
    // Sort IDs to ensure the same pair always has the same key
    const ids = [user1Id, user2Id].sort();
    const key = `${ids[0]}-${ids[1]}`;
    
    if (!shipMemory.has(key)) {
        shipMemory.set(key, Math.floor(Math.random() * 101)); // 0-100%
    }
    
    return shipMemory.get(key);
}

// Function to get heart emoji and status based on percentage
function getHeartAndStatus(percentage) {
    if (percentage <= 25) {
        const messages = [
            "A relationship is highly unlikely.",
            "The stars are not aligned for this pair.",
            "This ship might sink before leaving the harbor.",
            "Maybe just stay friends... very distant friends."
        ];
        return { 
            heart: '💔', 
            status: messages[Math.floor(Math.random() * messages.length)],
            heartImage: 'broken-heart.png' 
        };
    }
    if (percentage <= 50) {
        const messages = [
            "A relationship needs some work, but has potential.",
            "There's a spark, but it needs nurturing.",
            "With effort, this could become something special.",
            "Not terrible, not great - just like most relationships."
        ];
        return { 
            heart: '❤️‍🩹', 
            status: messages[Math.floor(Math.random() * messages.length)],
            heartImage: 'bandaged-heart.png'
        };
    }
    if (percentage <= 75) {
        const messages = [
            "A relationship has good chances of success!",
            "The chemistry between you two is undeniable!",
            "This ship is sailing smoothly!",
            "You two complement each other nicely!"
        ];
        return { 
            heart: '❤️', 
            status: messages[Math.floor(Math.random() * messages.length)],
            heartImage: 'normal-heart.png'
        };
    }
    
    const messages = [
        "A perfect match made in heaven!",
        "Soulmates detected! When's the wedding?",
        "The universe created you two for each other!",
        "This love story could rival the greatest romances in history!"
    ];
    return { 
        heart: '💖', 
        status: messages[Math.floor(Math.random() * messages.length)],
        heartImage: 'winged-heart.png'
    };
}

module.exports = {
    name: 'ship',
    description: 'Calculate the love percentage between two users!',
    // Define the slash command
    data: new SlashCommandBuilder()
        .setName('ship')
        .setDescription('Calculate the love percentage between two users!')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('The user to ship with (or leave empty for random)')
                .setRequired(false)
        ),
        
    // Message command execution
    async execute(message, args) {
        await handleShip(message, args);
    },
    
    // Slash command execution
    async interactionExecute(interaction) {
        await handleShipInteraction(interaction);
    }
};

async function createShipImage(user1, user2, percentage) {
    // Create higher resolution canvas for better quality
    const canvasWidth = 768; // Double the previous width
    const canvasHeight = 256; // Double the previous height
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');
    
    // Enable anti-aliasing for smoother rendering
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // Load and draw avatars with error handling
    let user1Avatar, user2Avatar, heartImage;
    try {
        // Request larger avatars for better quality
        user1Avatar = await loadImage(user1.displayAvatarURL({ extension: 'png', size: 512 }));
    } catch (err) {
        logger.error('Failed to load first user avatar:', err.message);
        user1Avatar = null;
    }

    try {
        user2Avatar = await loadImage(user2.displayAvatarURL({ extension: 'png', size: 512 }));
    } catch (err) {
        logger.error('Failed to load second user avatar:', err.message);
        user2Avatar = null;
    }
    
    // Select the appropriate heart image based on percentage
    let heartImageUrl;
    if (percentage <= 25) {
        heartImageUrl = 'https://img.icons8.com/?size=1024&id=S4mt2cXyyOmK&format=png';
    } else if (percentage <= 50) {
        heartImageUrl = 'https://img.icons8.com/?size=1024&id=5KDYkVnn6i0q&format=png';
    } else if (percentage <= 75) {
        heartImageUrl = 'https://img.icons8.com/?size=1024&id=19411&format=png';
    } else {
        heartImageUrl = 'https://img.icons8.com/?size=1024&id=31966&format=png';
    }
    
    try {
        heartImage = await loadImage(heartImageUrl);
    } catch (err) {
        logger.error('Failed to load heart image:', err.message);
        heartImage = null;
    }
    
    // Add a nice background
    ctx.fillStyle = '#070709';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    
    // Draw rounded rectangles with border (20% curve)
    const drawRoundedAvatar = (image, x, y, size) => {
        if (!image) return;
        
        const borderRadius = size * 0.2; // 20% curve
        
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x + borderRadius, y);
        ctx.lineTo(x + size - borderRadius, y);
        ctx.arcTo(x + size, y, x + size, y + borderRadius, borderRadius);
        ctx.lineTo(x + size, y + size - borderRadius);
        ctx.arcTo(x + size, y + size, x + size - borderRadius, y + size, borderRadius);
        ctx.lineTo(x + borderRadius, y + size);
        ctx.arcTo(x, y + size, x, y + size - borderRadius, borderRadius);
        ctx.lineTo(x, y + borderRadius);
        ctx.arcTo(x, y, x + borderRadius, y, borderRadius);
        ctx.closePath();
        ctx.clip();
        
        // Draw the avatar
        ctx.drawImage(image, x, y, size, size);
        
        // Restore context and draw border
        ctx.restore();
        ctx.strokeStyle = '#19191c';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(x + borderRadius, y);
        ctx.lineTo(x + size - borderRadius, y);
        ctx.arcTo(x + size, y, x + size, y + borderRadius, borderRadius);
        ctx.lineTo(x + size, y + size - borderRadius);
        ctx.arcTo(x + size, y + size, x + size - borderRadius, y + size, borderRadius);
        ctx.lineTo(x + borderRadius, y + size);
        ctx.arcTo(x, y + size, x, y + borderRadius, borderRadius);
        ctx.lineTo(x, y + borderRadius);
        ctx.arcTo(x, y, x + borderRadius, y, borderRadius);
        ctx.stroke();
    };
    
    // Draw avatars
    drawRoundedAvatar(user1Avatar, 32, 32, 192); // Left avatar
    drawRoundedAvatar(user2Avatar, canvasWidth - 224, 32, 192); // Right avatar
    
    // Draw heart with glow effect
    if (heartImage) {
        // Add shadow for glow effect
        ctx.shadowColor = percentage > 75 ? '#ff69b4' : '#ff0000';
        ctx.shadowBlur = 20;
        ctx.globalAlpha = 0.9;
        
        // Draw the heart
        ctx.drawImage(heartImage, canvasWidth/2 - 96, canvasHeight/2 - 80, 192, 160);
        
        // Reset shadow
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;
    } else {
        // Fallback heart with better styling
        ctx.fillStyle = '#FF0000';
        ctx.shadowColor = '#FF69B4';
        ctx.shadowBlur = 15;
        
        // Draw a better heart shape
        ctx.beginPath();
        const heartX = canvasWidth/2;
        const heartY = canvasHeight/2;
        const heartSize = 80;
        
        ctx.moveTo(heartX, heartY + heartSize * 0.3);
        ctx.bezierCurveTo(
            heartX, heartY, 
            heartX - heartSize, heartY, 
            heartX - heartSize, heartY - heartSize * 0.7
        );
        ctx.bezierCurveTo(
            heartX - heartSize, heartY - heartSize * 1.3,
            heartX, heartY - heartSize * 1.3,
            heartX, heartY - heartSize * 0.7
        );
        ctx.bezierCurveTo(
            heartX, heartY - heartSize * 1.3,
            heartX + heartSize, heartY - heartSize * 1.3,
            heartX + heartSize, heartY - heartSize * 0.7
        );
        ctx.bezierCurveTo(
            heartX + heartSize, heartY,
            heartX, heartY,
            heartX, heartY + heartSize * 0.3
        );
        ctx.fill();
        
        // Reset shadow
        ctx.shadowBlur = 0;
    }
    
    // Add percentage text
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText(`${percentage}%`, canvasWidth/2, canvasHeight - 40);
    ctx.fillText(`${percentage}%`, canvasWidth/2, canvasHeight - 40);
    
    // Return the image as an attachment
    return new AttachmentBuilder(canvas.toBuffer(), { name: 'ship.png' });
}

// Handle message-based commands
async function handleShip(message, args) {
    // Send an initial response
    const initialResponse = await message.channel.send("💕 Calculating love compatibility...");
    
    try {
        // Get the first user (always the message author)
        const firstUser = message.author;
        
        let secondUser;
        
        // Check if there's an argument
        if (!args.length || args[0].toLowerCase() === 'random') {
            // Select a random guild member (exclude bots and the author)
            const members = await message.guild.members.fetch();
            const eligibleMembers = members.filter(
                (member) => !member.user.bot && member.id !== firstUser.id
            );
            
            if (eligibleMembers.size === 0) {
                await initialResponse.delete().catch(() => {});
                return message.reply('No eligible users found to ship with!');
            }
            
            secondUser = eligibleMembers.random().user;
        } else {
            // Get the mentioned user
            const userId = args[0].replace(/[<@!>]/g, '');
            secondUser = await message.client.users.fetch(userId).catch(() => null);
            
            if (!secondUser) {
                await initialResponse.delete().catch(() => {});
                return message.reply('Please mention a valid user or use "random".');
            }
            
            if (secondUser.id === firstUser.id) {
                await initialResponse.delete().catch(() => {});
                return message.reply(`You can't ship yourself! Try mentioning another user or use "random".`);
            }
        }
        
        // Get or create consistent percentage for the pair
        const lovePercentage = getOrCreatePercentage(firstUser.id, secondUser.id);
        const { heart, status } = getHeartAndStatus(lovePercentage);
        
        // Create the ship image
        const mergedImage = await createShipImage(firstUser, secondUser, lovePercentage);
        
        // Delete the initial response
        await initialResponse.delete().catch(() => {});
        
        // Send the final result as a reply to the original message
        const output = `**${firstUser.username}** + **${secondUser.username}** = **${lovePercentage}%** of Love ${heart}\n${status}`;
        await message.reply({
            content: output,
            files: [mergedImage],
        });
    } catch (error) {
        logger.error("Error in ship command:", error);
        await initialResponse.edit("❌ Something went wrong with the shipping calculation!").catch(() => {});
    }
}

// Handle slash commands
async function handleShipInteraction(interaction) {
    await interaction.deferReply();
    
    try {
        // Get the first user (always the interaction user)
        const firstUser = interaction.user;
        let secondUser = interaction.options.getUser('user');
        
        // If no user specified, select random
        if (!secondUser) {
            const guild = interaction.guild;
            const members = await guild.members.fetch();
            const eligibleMembers = members.filter(
                (member) => !member.user.bot && member.id !== firstUser.id
            );
            
            if (eligibleMembers.size === 0) {
                return interaction.editReply('No eligible users found to ship with!');
            }
            
            secondUser = eligibleMembers.random().user;
        } else if (secondUser.id === firstUser.id) {
            return interaction.editReply(`You can't ship yourself! Try mentioning another user or leave empty for random.`);
        }
        
        // Get or create consistent percentage for the pair
        const lovePercentage = getOrCreatePercentage(firstUser.id, secondUser.id);
        const { heart, status } = getHeartAndStatus(lovePercentage);
        
        // Create the ship image
        const mergedImage = await createShipImage(firstUser, secondUser, lovePercentage);
        
        // Send the result
        const output = `**${firstUser.username}** + **${secondUser.username}** = **${lovePercentage}%** of Love ${heart}\n${status}`;
        await interaction.editReply({
            content: output,
            files: [mergedImage],
        });
    } catch (error) {
        logger.error("Error in ship command:", error);
        await interaction.editReply("❌ Something went wrong with the shipping calculation!").catch(() => {});
    }
}
