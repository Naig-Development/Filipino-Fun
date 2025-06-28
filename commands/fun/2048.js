const { SlashCommandBuilder } = require('discord.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const logger = require('../../utils/logger.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('2048')
        .setDescription('Play the 2048 game!'),
    
    // For classic command handling
    name: '2048',
    description: 'Play the 2048 game!',
    aliases: ['twenty48'],
    usage: '2048',
    category: 'fun',
    
    // Unified execute function for both slash and classic commands
    async execute(interaction, args, client) {
        // Determine if this is a slash command or message command
        const isSlash = interaction.commandId ? true : false;
        const user = isSlash ? interaction.user : interaction.author;
        
        // Initialize game state
        const gameState = {
            board: Array(4).fill().map(() => Array(4).fill(0)),
            score: 0,
            gameOver: false,
            won: false,
            highestTile: 0,
            gameMessage: null,
            collector: null,
        };
        
        // Initialize the board with two random tiles
        addRandomTile(gameState);
        addRandomTile(gameState);
        
        // Start the game
        await startGame(interaction, user, gameState, isSlash);
    },
};

async function startGame(interaction, user, gameState, isSlash) {
    // Create initial embed
    const embed = createGameEmbed(gameState, user);
    
    // Create control buttons
    const buttonRows = createButtons();
    
    // Send the initial message
    let reply;
    if (isSlash) {
        reply = await interaction.reply({
            embeds: [embed],
            components: buttonRows,
            fetchReply: true,
        });
    } else {
        reply = await interaction.channel.send({
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
        // Only allow the user who started the game to interact
        if (btnInteraction.user.id !== user.id) {
            await btnInteraction.reply({
                content: 'This is not your game!',
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
        
        // Handle button press
        await handleButtonPress(btnInteraction, gameState, user);
    });
    
    collector.on('end', () => {
        // Game timed out
        if (!gameState.gameOver) {
            gameState.gameOver = true;
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('🎮 2048 Game - Timed Out')
                .setDescription(`Game ended due to inactivity.\nFinal Score: ${gameState.score}`)
                .setColor('#FF5733')
                .setFooter({ text: `${user.username}'s 2048 Game` });
                
            // Disable buttons
            const disabledButtons = createDisabledButtons();
            
            gameState.gameMessage.edit({
                embeds: [timeoutEmbed],
                components: disabledButtons
            }).catch(logger.error);
        }
    });
}

async function handleButtonPress(interaction, gameState, user) {
    // Handle different button actions
    switch (interaction.customId) {
        case '2048_up':
            moveUp(gameState);
            break;
        case '2048_down':
            moveDown(gameState);
            break;
        case '2048_left':
            moveLeft(gameState);
            break;
        case '2048_right':
            moveRight(gameState);
            break;
        case '2048_stop':
            gameState.gameOver = true;
            await endGame(interaction, gameState, user, true);
            return;
    }
    
    // Check if the game state changed
    if (!gameState.gameOver && hasChanged(gameState)) {
        // Add a new random tile
        addRandomTile(gameState);
        
        // Check for win or game over
        updateGameState(gameState);
    }
    
    // Update message
    const updatedEmbed = createGameEmbed(gameState, user);
    
    if (gameState.gameOver) {
        // Game over
        await endGame(interaction, gameState, user);
    } else {
        await interaction.update({
            embeds: [updatedEmbed],
            components: createButtons(),
        }).catch(logger.error);
    }
}

async function endGame(interaction, gameState, user, stopped = false) {
    // Stop collector
    if (gameState.collector) {
        gameState.collector.stop();
    }
    
    // Create game over embed
    const gameOverEmbed = new EmbedBuilder()
        .setTitle(`🎮 2048 - ${stopped ? 'Game Stopped' : gameState.won ? 'You Won!' : 'Game Over'}`)
        .setDescription(
            `${stopped ? 'Game stopped.' : gameState.won ? 'You reached 2048!' : 'No more moves available.'}\n` +
            `Final Score: ${gameState.score}\n` +
            `Highest Tile: ${gameState.highestTile}`
        )
        .setColor(stopped ? '#3498DB' : gameState.won ? '#2ECC71' : '#FF5733')
        .setFooter({ text: `${user.username}'s 2048 Game` });
    
    // Create board view
    let boardString = '';
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
            const value = gameState.board[y][x];
            boardString += getTileEmoji(value) + ' ';
        }
        boardString += '\n';
    }
    
    gameOverEmbed.addFields({ name: 'Final Board', value: boardString });
    
    // Disable buttons
    const disabledButtons = createDisabledButtons();
    
    // Update message with game over state
    await interaction.update({
        embeds: [gameOverEmbed],
        components: disabledButtons,
    }).catch(logger.error);
}

function createGameEmbed(gameState, user) {
    // Build board representation
    let boardString = '';
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
            const value = gameState.board[y][x];
            boardString += getTileEmoji(value) + ' ';
        }
        boardString += '\n';
    }
    
    // Calculate highest tile
    gameState.highestTile = getHighestTile(gameState.board);
    
    return new EmbedBuilder()
        .setTitle('🎮 2048 Game')
        .setDescription(boardString)
        .addFields(
            { name: 'Score', value: `${gameState.score}`, inline: true },
            { name: 'Highest Tile', value: `${gameState.highestTile}`, inline: true }
        )
        .setColor('#3498DB')
        .setFooter({ text: `${user.username}'s 2048 Game • Use the buttons to move tiles` });
}

function createButtons() {
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('empty1')
            .setLabel(' ')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('2048_up')
            .setEmoji('⬆️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('empty2')
            .setLabel(' ')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
    );
    
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('2048_left')
            .setEmoji('⬅️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('2048_stop')
            .setEmoji('⏹️')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('2048_right')
            .setEmoji('➡️')
            .setStyle(ButtonStyle.Primary),
    );
    
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('empty3')
            .setLabel(' ')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId('2048_down')
            .setEmoji('⬇️')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('empty4')
            .setLabel(' ')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
    );
    
    return [row1, row2, row3];
}

function createDisabledButtons() {
    const rows = createButtons();
    rows.forEach(row => {
        row.components.forEach(button => {
            button.setDisabled(true);
        });
    });
    return rows;
}

function getTileEmoji(value) {
    // Map tile values to appropriate emojis or formatted numbers
    switch (value) {
        case 0: return '⬛'; // Empty tile
        case 2: return '2️⃣';
        case 4: return '4️⃣';
        case 8: return '8️⃣';
        case 16: return '🔶'; // Orange square
        case 32: return '🟧'; // Orange square
        case 64: return '🟥'; // Red square
        case 128: return '🟨'; // Yellow square
        case 256: return '⭐'; // Star
        case 512: return '💫'; // Dizzy
        case 1024: return '🌟'; // Glowing star
        case 2048: return '🏆'; // Trophy
        default: return value > 2048 ? '<:guildOwner:1379167072101077063> ' : '⬛'; // Crown for very high values
    }
}

// Game mechanics functions
function moveLeft(gameState) {
    const boardSnapshot = JSON.stringify(gameState.board);
    
    for (let y = 0; y < 4; y++) {
        let row = gameState.board[y].filter(cell => cell !== 0);
        for (let i = 0; i < row.length - 1; i++) {
            if (row[i] === row[i+1]) {
                row[i] *= 2;
                row[i+1] = 0;
                gameState.score += row[i];
            }
        }
        row = row.filter(cell => cell !== 0);
        while (row.length < 4) {
            row.push(0);
        }
        gameState.board[y] = row;
    }
    
    gameState.lastBoardSnapshot = boardSnapshot;
}

function moveRight(gameState) {
    const boardSnapshot = JSON.stringify(gameState.board);
    
    for (let y = 0; y < 4; y++) {
        let row = gameState.board[y].filter(cell => cell !== 0);
        for (let i = row.length - 1; i > 0; i--) {
            if (row[i] === row[i-1]) {
                row[i] *= 2;
                row[i-1] = 0;
                gameState.score += row[i];
            }
        }
        row = row.filter(cell => cell !== 0);
        while (row.length < 4) {
            row.unshift(0);
        }
        gameState.board[y] = row;
    }
    
    gameState.lastBoardSnapshot = boardSnapshot;
}

function moveUp(gameState) {
    const boardSnapshot = JSON.stringify(gameState.board);
    
    // Transpose
    for (let y = 0; y < 4; y++) {
        for (let x = y + 1; x < 4; x++) {
            [gameState.board[y][x], gameState.board[x][y]] = [gameState.board[x][y], gameState.board[y][x]];
        }
    }
    
    // Move left
    moveLeft(gameState);
    
    // Transpose back
    for (let y = 0; y < 4; y++) {
        for (let x = y + 1; x < 4; x++) {
            [gameState.board[y][x], gameState.board[x][y]] = [gameState.board[x][y], gameState.board[y][x]];
        }
    }
    
    gameState.lastBoardSnapshot = boardSnapshot;
}

function moveDown(gameState) {
    const boardSnapshot = JSON.stringify(gameState.board);
    
    // Transpose
    for (let y = 0; y < 4; y++) {
        for (let x = y + 1; x < 4; x++) {
            [gameState.board[y][x], gameState.board[x][y]] = [gameState.board[x][y], gameState.board[y][x]];
        }
    }
    
    // Move right
    moveRight(gameState);
    
    // Transpose back
    for (let y = 0; y < 4; y++) {
        for (let x = y + 1; x < 4; x++) {
            [gameState.board[y][x], gameState.board[x][y]] = [gameState.board[x][y], gameState.board[y][x]];
        }
    }
    
    gameState.lastBoardSnapshot = boardSnapshot;
}

function addRandomTile(gameState) {
    // Find empty cells
    const emptyCells = [];
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
            if (gameState.board[y][x] === 0) {
                emptyCells.push({ x, y });
            }
        }
    }
    
    if (emptyCells.length === 0) {
        return;
    }
    
    // Choose a random empty cell
    const { x, y } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    
    // 10% chance of 4, 90% chance of 2
    gameState.board[y][x] = Math.random() < 0.9 ? 2 : 4;
}

function hasChanged(gameState) {
    return gameState.lastBoardSnapshot !== JSON.stringify(gameState.board);
}

function updateGameState(gameState) {
    // Check if player has won
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
            if (gameState.board[y][x] >= 2048 && !gameState.won) {
                gameState.won = true;
                gameState.gameOver = true;
                return;
            }
        }
    }
    
    // Check if there are any empty cells
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
            if (gameState.board[y][x] === 0) {
                return; // Not game over yet
            }
        }
    }
    
    // Check if there are any possible moves
    for (let y = 0; y < 3; y++) {
        for (let x = 0; x < 3; x++) {
            if (gameState.board[y][x] === gameState.board[y+1][x] ||
                gameState.board[y][x] === gameState.board[y][x+1]) {
                return; // Not game over yet
            }
        }
    }
    
    // Check the bottom row and rightmost column
    for (let i = 0; i < 3; i++) {
        if (gameState.board[3][i] === gameState.board[3][i+1] ||
            gameState.board[i][3] === gameState.board[i+1][3]) {
            return; // Not game over yet
        }
    }
    
    // If we get here, it's game over
    gameState.gameOver = true;
}

function getHighestTile(board) {
    let highest = 0;
    for (let y = 0; y < 4; y++) {
        for (let x = 0; x < 4; x++) {
            if (board[y][x] > highest) {
                highest = board[y][x];
            }
        }
    }
    return highest;
}