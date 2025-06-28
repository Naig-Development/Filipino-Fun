const { SlashCommandBuilder } = require('discord.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const logger = require('../../utils/logger.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Play Rock Paper Scissors against the bot or another user!')
        .addUserOption(option => 
            option.setName('opponent')
                .setDescription('Play against another user (optional)')
                .setRequired(false)),
    
    // For classic command handling
    name: 'rps',
    description: 'Play Rock Paper Scissors against the bot or another user!',
    aliases: ['rockpaperscissors'],
    usage: 'rps [user]',
    category: 'fun',
    
    async execute(interaction, args, client) {
        // Determine if this is a slash command or message command
        const isSlash = interaction.commandId ? true : false;
        const user = isSlash ? interaction.user : interaction.author;
        
        // Check if playing against another user
        let opponent = null;
        if (isSlash) {
            opponent = interaction.options.getUser('opponent');
        } else if (interaction.mentions && interaction.mentions.users.size > 0) {
            opponent = interaction.mentions.users.first();
        }
        
        // Can't play against self
        if (opponent && user.id === opponent.id) {
            const response = 'You cannot play against yourself!';
            if (isSlash) {
                return interaction.reply({ content: response, flags: MessageFlags.Ephemeral });
            } else {
                return interaction.reply(response);
            }
        }
        
        // Can't play against bots
        if (opponent && opponent.bot) {
            const response = 'You cannot play against bots!';
            if (isSlash) {
                return interaction.reply({ content: response, flags: MessageFlags.Ephemeral });
            } else {
                return interaction.reply(response);
            }
        }
        
        if (opponent) {
            // PvP mode
            await startPvPGame(interaction, user, opponent, isSlash);
        } else {
            // PvE mode
            await startPvEGame(interaction, user, isSlash);
        }
    }
};

async function startPvEGame(interaction, user, isSlash) {
    const embed = new EmbedBuilder()
        .setTitle('🎮 Rock Paper Scissors')
        .setDescription('Make your choice!')
        .setColor('#3498DB')
        .setFooter({ text: `${user.username}'s game` });
        
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('rps_rock')
            .setEmoji('🪨')
            .setLabel('Rock')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('rps_paper')
            .setEmoji('📄')
            .setLabel('Paper')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('rps_scissors')
            .setEmoji('✂️')
            .setLabel('Scissors')
            .setStyle(ButtonStyle.Primary)
    );
    
    // Send the message
    let reply;
    if (isSlash) {
        reply = await interaction.reply({ 
            embeds: [embed], 
            components: [row],
            fetchReply: true 
        });
    } else {
        reply = await interaction.channel.send({ 
            embeds: [embed], 
            components: [row] 
        });
    }
    
    // Set up collector for button interactions
    const filter = i => i.user.id === user.id && i.customId.startsWith('rps_');
    const collector = reply.createMessageComponentCollector({ 
        filter, 
        time: 30000, 
        max: 1 
    });
    
    collector.on('collect', async i => {
        // Get player's choice
        const playerChoice = i.customId.replace('rps_', '');
        
        // Bot makes its choice
        const choices = ['rock', 'paper', 'scissors'];
        const botChoice = choices[Math.floor(Math.random() * choices.length)];
        
        // Determine the winner
        const result = determineWinner(playerChoice, botChoice);
        
        // Create result embed
        const resultEmbed = new EmbedBuilder()
            .setTitle('🎮 Rock Paper Scissors - Result')
            .setDescription(`You chose ${getEmoji(playerChoice)} **${playerChoice}**\nBot chose ${getEmoji(botChoice)} **${botChoice}**`)
            .setColor(result.color)
            .addFields({ name: 'Result', value: result.message })
            .setFooter({ text: `${user.username}'s game` })
            .setTimestamp();
        
        // Disable buttons
        const disabledRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('rps_rock_disabled')
                .setEmoji('🪨')
                .setLabel('Rock')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('rps_paper_disabled')
                .setEmoji('📄')
                .setLabel('Paper')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true),
            new ButtonBuilder()
                .setCustomId('rps_scissors_disabled')
                .setEmoji('✂️')
                .setLabel('Scissors')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(true)
        );
        
        // Update the message with the result
        await i.update({ 
            embeds: [resultEmbed], 
            components: [disabledRow] 
        });
    });
    
    collector.on('end', collected => {
        if (collected.size === 0) {
            // Timed out - no choice made
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('🎮 Rock Paper Scissors - Timed Out')
                .setDescription('You didn\'t make a choice in time!')
                .setColor('#FF5733')
                .setFooter({ text: `${user.username}'s game` })
                .setTimestamp();
            
            // Disable buttons
            const disabledRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('rps_rock_disabled')
                    .setEmoji('🪨')
                    .setLabel('Rock')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('rps_paper_disabled')
                    .setEmoji('📄')
                    .setLabel('Paper')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true),
                new ButtonBuilder()
                    .setCustomId('rps_scissors_disabled')
                    .setEmoji('✂️')
                    .setLabel('Scissors')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(true)
            );
            
            reply.edit({ 
                embeds: [timeoutEmbed], 
                components: [disabledRow] 
            }).catch(logger.error);
        }
    });
}

async function startPvPGame(interaction, challenger, opponent, isSlash) {
    const embed = new EmbedBuilder()
        .setTitle('🎮 Rock Paper Scissors Challenge')
        .setDescription(`${challenger} has challenged ${opponent} to a game of Rock Paper Scissors!\n\n${opponent}, do you accept?`)
        .setColor('#3498DB')
        .setFooter({ text: 'Game will timeout in 30 seconds' })
        .setTimestamp();
    
    // Accept/Decline buttons
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('rps_accept')
            .setLabel('Accept Challenge')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('rps_decline')
            .setLabel('Decline')
            .setStyle(ButtonStyle.Danger)
    );
    
    // Send challenge message
    let reply;
    if (isSlash) {
        reply = await interaction.reply({ 
            content: `${opponent}, you've been challenged!`,
            embeds: [embed], 
            components: [row],
            fetchReply: true 
        });
    } else {
        reply = await interaction.channel.send({ 
            content: `${opponent}, you've been challenged!`,
            embeds: [embed], 
            components: [row] 
        });
    }
    
    // Wait for opponent to accept or decline
    const filter = i => i.user.id === opponent.id && i.customId.startsWith('rps_');
    const collector = reply.createMessageComponentCollector({ 
        filter, 
        time: 30000, 
        max: 1 
    });
    
    let gameState = {
        accepted: false,
        challengerChoice: null,
        opponentChoice: null,
        challengerSelected: false,
        opponentSelected: false,
        result: null,
        message: reply
    };
    
    collector.on('collect', async i => {
        if (i.customId === 'rps_accept') {
            gameState.accepted = true;
            
            // Start the actual game
            await beginPvPRound(gameState, challenger, opponent);
        } else if (i.customId === 'rps_decline') {
            // Opponent declined
            const declineEmbed = new EmbedBuilder()
                .setTitle('🎮 Rock Paper Scissors - Declined')
                .setDescription(`${opponent} declined the challenge.`)
                .setColor('#FF5733')
                .setTimestamp();
            
            await i.update({ 
                content: `${challenger}, your challenge was declined.`,
                embeds: [declineEmbed], 
                components: [] 
            });
        }
    });
    
    collector.on('end', collected => {
        if (collected.size === 0 && !gameState.accepted) {
            // Timed out - no response
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('🎮 Rock Paper Scissors - Timeout')
                .setDescription(`${opponent} didn't respond to the challenge.`)
                .setColor('#FF5733')
                .setTimestamp();
            
            reply.edit({ 
                content: `${challenger}, your challenge timed out.`,
                embeds: [timeoutEmbed], 
                components: [] 
            }).catch(logger.error);
        }
    });
}

async function beginPvPRound(gameState, challenger, opponent) {
    // Prepare embeds for both players
    const challengerEmbed = new EmbedBuilder()
        .setTitle('🎮 Rock Paper Scissors')
        .setDescription(`Game against ${opponent}\nMake your choice!`)
        .setColor('#3498DB')
        .setFooter({ text: 'Your choice will not be revealed until both players have chosen' })
        .setTimestamp();
    
    const opponentEmbed = new EmbedBuilder()
        .setTitle('🎮 Rock Paper Scissors')
        .setDescription(`Game against ${challenger}\nMake your choice!`)
        .setColor('#3498DB')
        .setFooter({ text: 'Your choice will not be revealed until both players have chosen' })
        .setTimestamp();
    
    // Create buttons for both players
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('rps_rock')
            .setEmoji('🪨')
            .setLabel('Rock')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('rps_paper')
            .setEmoji('📄')
            .setLabel('Paper')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('rps_scissors')
            .setEmoji('✂️')
            .setLabel('Scissors')
            .setStyle(ButtonStyle.Primary)
    );
    
    // Update the main message with waiting status
    const waitingEmbed = new EmbedBuilder()
        .setTitle('🎮 Rock Paper Scissors')
        .setDescription(`${challenger} vs ${opponent}\n\nBoth players need to make their choices.\nCheck your DMs!`)
        .setColor('#3498DB')
        .setTimestamp();
    
    await gameState.message.edit({
        content: null,
        embeds: [waitingEmbed],
        components: []
    }).catch(logger.error);
    
    // Send DMs to both players for their choices
    try {
        const challengerDM = await challenger.send({
            embeds: [challengerEmbed],
            components: [buttons]
        });
        
        const opponentDM = await opponent.send({
            embeds: [opponentEmbed],
            components: [buttons]
        });
        
        // Set up collectors for both players' choices
        const filter = i => i.customId.startsWith('rps_');
        
        const challengerCollector = challengerDM.createMessageComponentCollector({ 
            filter, 
            time: 60000, 
            max: 1 
        });
        
        const opponentCollector = opponentDM.createMessageComponentCollector({ 
            filter, 
            time: 60000, 
            max: 1 
        });
        
        // Handle challenger's choice
        challengerCollector.on('collect', async i => {
            gameState.challengerChoice = i.customId.replace('rps_', '');
            gameState.challengerSelected = true;
            
            // Update DM to show they've made a choice
            const choiceMadeEmbed = new EmbedBuilder()
                .setTitle('🎮 Rock Paper Scissors')
                .setDescription(`You chose ${getEmoji(gameState.challengerChoice)} **${gameState.challengerChoice}**\n\nWaiting for opponent to choose...`)
                .setColor('#3498DB')
                .setTimestamp();
            
            await i.update({
                embeds: [choiceMadeEmbed],
                components: []
            });
            
            // Check if both players have made choices
            checkBothPlayersSelected(gameState, challenger, opponent);
        });
        
        // Handle opponent's choice
        opponentCollector.on('collect', async i => {
            gameState.opponentChoice = i.customId.replace('rps_', '');
            gameState.opponentSelected = true;
            
            // Update DM to show they've made a choice
            const choiceMadeEmbed = new EmbedBuilder()
                .setTitle('🎮 Rock Paper Scissors')
                .setDescription(`You chose ${getEmoji(gameState.opponentChoice)} **${gameState.opponentChoice}**\n\nWaiting for opponent to choose...`)
                .setColor('#3498DB')
                .setTimestamp();
            
            await i.update({
                embeds: [choiceMadeEmbed],
                components: []
            });
            
            // Check if both players have made choices
            checkBothPlayersSelected(gameState, challenger, opponent);
        });
        
        // Handle timeouts
        challengerCollector.on('end', collected => {
            if (collected.size === 0 && !gameState.challengerSelected) {
                // Challenger didn't make a choice
                handlePlayerTimeout(gameState, challenger, opponent, true);
            }
        });
        
        opponentCollector.on('end', collected => {
            if (collected.size === 0 && !gameState.opponentSelected) {
                // Opponent didn't make a choice
                handlePlayerTimeout(gameState, challenger, opponent, false);
            }
        });
        
    } catch (error) {
        // Handle DM errors
        logger.error("Error sending DMs:", error);
        
        const errorEmbed = new EmbedBuilder()
            .setTitle('🎮 Rock Paper Scissors - Error')
            .setDescription("I couldn't send DMs to one or both players. Please ensure your DMs are open.")
            .setColor('#FF5733')
            .setTimestamp();
        
        await gameState.message.edit({
            embeds: [errorEmbed],
            components: []
        }).catch(logger.error);
    }
}

function checkBothPlayersSelected(gameState, challenger, opponent) {
    if (gameState.challengerSelected && gameState.opponentSelected) {
        finishPvPGame(gameState, challenger, opponent);
    }
}

function handlePlayerTimeout(gameState, challenger, opponent, isChallengerTimedOut) {
    const timedOutPlayer = isChallengerTimedOut ? challenger : opponent;
    const winner = isChallengerTimedOut ? opponent : challenger;
    
    // Create timeout embed
    const timeoutEmbed = new EmbedBuilder()
        .setTitle('🎮 Rock Paper Scissors - Timeout')
        .setDescription(`${timedOutPlayer} didn't make a choice in time.\n${winner} wins by default!`)
        .setColor('#FF5733')
        .setTimestamp();
    
    // Update the main message
    gameState.message.edit({
        embeds: [timeoutEmbed],
        components: []
    }).catch(logger.error);
    
    // Also notify both players via DM if possible
    try {
        if (!isChallengerTimedOut && gameState.challengerChoice) {
            challenger.send(`${opponent} didn't respond in time. You win!`).catch(() => {});
        }
        if (isChallengerTimedOut && gameState.opponentChoice) {
            opponent.send(`${challenger} didn't respond in time. You win!`).catch(() => {});
        }
    } catch (e) {
        // Ignore DM errors here
    }
    
    // Game is now over
    gameState.gameOver = true;
}

async function finishPvPGame(gameState, challenger, opponent) {
    // Determine winner
    const result = determineWinner(gameState.challengerChoice, gameState.opponentChoice, challenger.username, opponent.username);
    
    // Create result embed
    const resultEmbed = new EmbedBuilder()
        .setTitle('🎮 Rock Paper Scissors - Result')
        .setDescription(
            `${challenger} chose ${getEmoji(gameState.challengerChoice)} **${gameState.challengerChoice}**\n` +
            `${opponent} chose ${getEmoji(gameState.opponentChoice)} **${gameState.opponentChoice}**`
        )
        .setColor(result.color)
        .addFields({ name: 'Result', value: result.message })
        .setTimestamp();
    
    // Update the main message
    await gameState.message.edit({
        embeds: [resultEmbed],
        components: []
    }).catch(logger.error);
    
    // Also update both players' DMs with the result
    try {
        challenger.send({
            embeds: [resultEmbed]
        }).catch(() => {});
        
        opponent.send({
            embeds: [resultEmbed]
        }).catch(() => {});
    } catch (e) {
        // Ignore DM errors
    }
}

function determineWinner(playerChoice, botChoice, playerName = 'You', botName = 'Bot') {
    if (playerChoice === botChoice) {
        return {
            message: "It's a tie!",
            color: '#F1C40F' // Yellow
        };
    }
    
    const winConditions = {
        rock: 'scissors',
        paper: 'rock',
        scissors: 'paper'
    };
    
    if (winConditions[playerChoice] === botChoice) {
        return {
            message: `${playerName} wins!`,
            color: '#2ECC71' // Green
        };
    } else {
        return {
            message: `${botName} wins!`,
            color: '#E74C3C' // Red
        };
    }
}

function getEmoji(choice) {
    switch (choice) {
        case 'rock': return '🪨';
        case 'paper': return '📄';
        case 'scissors': return '✂️';
        default: return '❓';
    }
}