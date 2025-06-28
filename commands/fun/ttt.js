const { SlashCommandBuilder } = require('discord.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');
const logger = require('../../utils/logger.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('tictactoe')
        .setDescription('Play Tic Tac Toe with someone!')
        .addUserOption(option => 
            option.setName('opponent')
                .setDescription('The user you want to play against')
                .setRequired(true)),
    
    // For classic command handling
    name: 'tictactoe',
    description: 'Play Tic Tac Toe with someone!',
    aliases: ['ttt'],
    usage: 'tictactoe @user',
    category: 'fun',
    
    // Unified execute function for both slash and classic commands
    async execute(interaction, args, client) {
        // Determine if this is a slash command or message command
        const isSlash = interaction.commandId ? true : false;
        const user = isSlash ? interaction.user : interaction.author;
        
        // Get opponent
        let opponent;
        if (isSlash) {
            opponent = interaction.options.getUser('opponent');
        } else {
            // For classic commands, the opponent should be the first mentioned user
            opponent = interaction.mentions.users.first();
            
            if (!opponent) {
                return interaction.reply('Please mention a user to play with!');
            }
        }
        
        // Can't play against self
        if (user.id === opponent.id) {
            const response = 'You cannot play against yourself!';
            if (isSlash) {
                return interaction.reply({ content: response, flags: MessageFlags.Ephemeral });
            } else {
                return interaction.reply(response);
            }
        }
        
        // Can't play against bots
        if (opponent.bot) {
            const response = 'You cannot play against bots!';
            if (isSlash) {
                return interaction.reply({ content: response, flags: MessageFlags.Ephemeral });
            } else {
                return interaction.reply(response);
            }
        }
        
        // Initialize game state
        const gameState = {
            board: Array(9).fill(null),
            currentPlayer: user.id, // X goes first
            players: {
                X: user.id,
                O: opponent.id,
            },
            gameOver: false,
            winner: null,
            gameMessage: null,
            collector: null,
        };
        
        // Start the game
        await startGame(interaction, user, opponent, gameState, isSlash);
    },
};

async function startGame(interaction, user, opponent, gameState, isSlash) {
    // Create initial embed
    const embed = createGameEmbed(gameState, user, opponent);
    
    // Create game buttons
    const buttonRows = createButtons(gameState);
    
    // Send the initial message
    let reply;
    if (isSlash) {
        reply = await interaction.reply({
            content: `${opponent}, ${user} has challenged you to a game of Tic Tac Toe!`,
            embeds: [embed],
            components: buttonRows,
            fetchReply: true,
        });
    } else {
        reply = await interaction.channel.send({
            content: `${opponent}, ${user} has challenged you to a game of Tic Tac Toe!`,
            embeds: [embed],
            components: buttonRows,
        });
    }
    
    gameState.gameMessage = reply;
    
    // Set up button collector
    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000, // 5 minutes timeout
    });
    
    gameState.collector = collector;
    
    // Handle button interactions
    collector.on('collect', async (btnInteraction) => {
        // Check if it's their turn
        if (btnInteraction.user.id !== gameState.currentPlayer) {
            // Check if user is part of the game
            if (btnInteraction.user.id === gameState.players.X || btnInteraction.user.id === gameState.players.O) {
                await btnInteraction.reply({
                    content: "It's not your turn!",
                    flags: MessageFlags.Ephemeral,
                });
            } else {
                await btnInteraction.reply({
                    content: "You're not part of this game!",
                    flags: MessageFlags.Ephemeral,
                });
            }
            return;
        }
        
        // Get the position from button ID
        const position = parseInt(btnInteraction.customId.split('_')[1]);
        
        // Check if the position is valid
        if (gameState.board[position] !== null) {
            await btnInteraction.reply({
                content: "That space is already taken!",
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        
        // Update the board
        const symbol = gameState.currentPlayer === gameState.players.X ? 'X' : 'O';
        gameState.board[position] = symbol;
        
        // Check for win conditions
        const isWin = checkWin(gameState.board, symbol);
        const isDraw = !gameState.board.includes(null) && !isWin;
        
        if (isWin) {
            gameState.gameOver = true;
            gameState.winner = gameState.currentPlayer;
        } else if (isDraw) {
            gameState.gameOver = true;
        } else {
            // Switch players
            gameState.currentPlayer = gameState.currentPlayer === gameState.players.X ? 
                gameState.players.O : gameState.players.X;
        }
        
        // Update the embed
        const updatedEmbed = createGameEmbed(gameState, user, opponent);
        
        // Update buttons
        const updatedButtons = createButtons(gameState);
        
        // Update message
        await btnInteraction.update({
            embeds: [updatedEmbed],
            components: updatedButtons,
        }).catch(logger.error);
        
        // End game if necessary
        if (gameState.gameOver) {
            collector.stop();
        }
    });
    
    collector.on('end', () => {
        if (!gameState.gameOver) {
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('⭕ Tic Tac Toe - Timed Out')
                .setDescription('Game ended due to inactivity.')
                .setColor('#FF5733');
                
            // Disable buttons
            const disabledButtons = createButtons(gameState, true);
            
            gameState.gameMessage.edit({
                content: 'Game timed out due to inactivity.',
                embeds: [timeoutEmbed],
                components: disabledButtons
            }).catch(logger.error);
        }
    });
}

function createGameEmbed(gameState, user, opponent) {
    let description;
    let color = '#3498DB';
    
    if (gameState.gameOver) {
        if (gameState.winner) {
            const winnerUser = gameState.winner === gameState.players.X ? user : opponent;
            description = `Winner: ${winnerUser} (${gameState.winner === gameState.players.X ? 'X' : 'O'})`;
            color = '#2ECC71'; // Green for win
        } else {
            description = "It's a draw!";
            color = '#F1C40F'; // Yellow for draw
        }
    } else {
        const currentPlayerUser = gameState.currentPlayer === gameState.players.X ? user : opponent;
        const currentSymbol = gameState.currentPlayer === gameState.players.X ? 'X' : 'O';
        description = `Current Turn: ${currentPlayerUser} (${currentSymbol})`;
    }
    
    return new EmbedBuilder()
        .setTitle('⭕ Tic Tac Toe')
        .setDescription(description)
        .addFields({ 
            name: 'Players', 
            value: `X: ${user}\nO: ${opponent}` 
        })
        .setColor(color)
        .setTimestamp();
}

function createButtons(gameState, disableAll = false) {
    const rows = [
        new ActionRowBuilder(),
        new ActionRowBuilder(),
        new ActionRowBuilder(),
    ];
    
    for (let i = 0; i < 9; i++) {
        const row = Math.floor(i / 3);
        const value = gameState.board[i];
        
        let style = ButtonStyle.Secondary;
        let label = ' ';
        let emoji = null;
        let disabled = false;
        
        if (value === 'X') {
            style = ButtonStyle.Danger;
            emoji = '❌';
            disabled = true;
        } else if (value === 'O') {
            style = ButtonStyle.Success;
            emoji = '⭕';
            disabled = true;
        }
        
        // Disable all buttons if game is over or if disableAll is true
        if (gameState.gameOver || disableAll) {
            disabled = true;
        }
        
        const button = new ButtonBuilder()
            .setCustomId(`ttt_${i}`)
            .setStyle(style)
            .setDisabled(disabled);
        
        if (emoji) {
            button.setEmoji(emoji);
        } else {
            button.setLabel(label);
        }
        
        rows[row].addComponents(button);
    }
    
    return rows;
}

function checkWin(board, symbol) {
    // Check rows
    for (let i = 0; i < 9; i += 3) {
        if (board[i] === symbol && board[i + 1] === symbol && board[i + 2] === symbol) {
            return true;
        }
    }
    
    // Check columns
    for (let i = 0; i < 3; i++) {
        if (board[i] === symbol && board[i + 3] === symbol && board[i + 6] === symbol) {
            return true;
        }
    }
    
    // Check diagonals
    if (board[0] === symbol && board[4] === symbol && board[8] === symbol) {
        return true;
    }
    if (board[2] === symbol && board[4] === symbol && board[6] === symbol) {
        return true;
    }
    
    return false;
}