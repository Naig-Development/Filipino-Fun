// Remove unused client import
const config = require("../../config");
const logger = require('../../utils/logger.js');

const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType,
} = require("discord.js");

// Game settings
const GAME_ROWS = 10;
const GAME_COLS = 10;
const GAME_DURATION = 60 * 5 * 1000; // 5 minutes
const MOVE_INTERVAL = 1000; // Move every second

// Game emojis
const EMOJIS = {
    empty: "⬛",
    snake: "🟩",
    head: "🟢",
    apple: "🍎",
    border: "⬜",
};

// Directions
const DIRECTIONS = {
    UP: { x: 0, y: -1 },
    DOWN: { x: 0, y: 1 },
    LEFT: { x: -1, y: 0 },
    RIGHT: { x: 1, y: 0 },
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName("snake")
        .setDescription("Play a game of Snake."),
    name: "snake",
    description: "Play a game of Snake.",
    prefix: true,

    async execute(interaction) {
        await startGame(interaction);
    },

    async run(message) {
        await startGame(message);
    },
};

async function startGame(interaction) {
    const isSlash = interaction.commandId ? true : false;
    const user = isSlash ? interaction.user : interaction.author;
    
    // Create game state
    const gameState = {
        board: createEmptyBoard(),
        snake: [{ x: 2, y: 2 }], // Start with a single piece
        direction: DIRECTIONS.RIGHT,
        apple: placeApple([{ x: 2, y: 2 }]), // Initial snake position
        score: 0,
        gameOver: false,
        gameMessage: null,
        collector: null,
        gameInterval: null,
    };

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
        // Fix: For regular message commands, the variable is named 'message' not 'interaction'
        reply = await interaction.channel.send({
            embeds: [embed],
            components: buttonRows,
        });
        // Make sure to get the Message object for collector setup
        gameState.gameMessage = reply;
    }

    gameState.gameMessage = reply;

    // Set up button collector
    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === user.id,
        time: GAME_DURATION,
    });

    gameState.collector = collector;

    collector.on("collect", async (i) => {
        await i.deferUpdate().catch(logger.error);
        
        switch (i.customId) {
            case "up":
                if (gameState.direction !== DIRECTIONS.DOWN) {
                    gameState.direction = DIRECTIONS.UP;
                }
                break;
            case "down":
                if (gameState.direction !== DIRECTIONS.UP) {
                    gameState.direction = DIRECTIONS.DOWN;
                }
                break;
            case "left":
                if (gameState.direction !== DIRECTIONS.RIGHT) {
                    gameState.direction = DIRECTIONS.LEFT;
                }
                break;
            case "right":
                if (gameState.direction !== DIRECTIONS.LEFT) {
                    gameState.direction = DIRECTIONS.RIGHT;
                }
                break;
            case "stop":
                endGame(gameState, user, "Game stopped manually.");
                return;
        }
    });

    collector.on("end", () => {
        if (!gameState.gameOver) {
            endGame(gameState, user, "Game timed out.");
        }
    });

    // Start game loop
    gameState.gameInterval = setInterval(() => gameLoop(gameState, user), MOVE_INTERVAL);
}

function gameLoop(gameState, user) {
    if (gameState.gameOver) return;

    // Calculate new head position
    const head = gameState.snake[0];
    const newHead = {
        x: head.x + gameState.direction.x,
        y: head.y + gameState.direction.y,
    };

    // Check for collisions
    if (
        newHead.x < 0 || newHead.x >= GAME_COLS ||
        newHead.y < 0 || newHead.y >= GAME_ROWS ||
        gameState.snake.some(segment => segment.x === newHead.x && segment.y === newHead.y)
    ) {
        endGame(gameState, user, "Game over! You crashed.");
        return;
    }

    // Check if apple is eaten
    const appleEaten = newHead.x === gameState.apple.x && newHead.y === gameState.apple.y;
    
    // Move snake
    gameState.snake.unshift(newHead);
    if (!appleEaten) {
        gameState.snake.pop();
    } else {
        gameState.score += 10;
        gameState.apple = placeApple(gameState.snake);
    }

    // Update board
    gameState.board = createEmptyBoard();
    gameState.snake.forEach((segment, index) => {
        if (segment.x >= 0 && segment.x < GAME_COLS && segment.y >= 0 && segment.y < GAME_ROWS) {
            gameState.board[segment.y][segment.x] = index === 0 ? EMOJIS.head : EMOJIS.snake;
        }
    });
    
    if (gameState.apple.x >= 0 && gameState.apple.x < GAME_COLS && gameState.apple.y >= 0 && gameState.apple.y < GAME_ROWS) {
        gameState.board[gameState.apple.y][gameState.apple.x] = EMOJIS.apple;
    }

    // Update the game message
    updateGameMessage(gameState, user);
}

function endGame(gameState, user, endMessage) {
    gameState.gameOver = true;
    clearInterval(gameState.gameInterval);
    
    if (gameState.collector) {
        gameState.collector.stop();
    }

    const finalEmbed = new EmbedBuilder()
        .setTitle("🐍 Snake Game")
        .setDescription(`${renderBoard(gameState.board)}\n\n**${endMessage}**\n\nFinal Score: **${gameState.score}**`)
        .setColor(config.embedColors?.main || "#00FF00")
        .setFooter({
            text: `${user.username} | Game ended`,
            iconURL: user.displayAvatarURL({ dynamic: true }),
        })
        .setTimestamp();

    if (gameState.gameMessage) {
        gameState.gameMessage.edit({
            embeds: [finalEmbed],
            components: [], // Remove all components
        }).catch(logger.error);
    }
}

function updateGameMessage(gameState, user) {
    const updatedEmbed = createGameEmbed(gameState, user);
    
    if (gameState.gameMessage) {
        gameState.gameMessage.edit({
            embeds: [updatedEmbed],
        }).catch(logger.error);
    }
}

function createGameEmbed(gameState, user) {
    return new EmbedBuilder()
        .setTitle("🐍 Snake Game")
        .setDescription(`${renderBoard(gameState.board)}\n\nScore: **${gameState.score}**\n\nUse the buttons below to control the snake!`)
        .setColor(config.embedColors?.main || "#00FF00")
        .setFooter({
            text: `${user.username} | Game in progress`,
            iconURL: user.displayAvatarURL({ dynamic: true }),
        })
        .setTimestamp();
}

function createButtons() {
    // First row: blank, up, blank
    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("blank1")
            .setLabel("\u200B")  // Zero-width space
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId("up")
            //.setLabel("Up")
            .setEmoji("⬆️")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId("blank2")
            .setLabel("\u200B")  // Zero-width space
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
    );

    // Second row: left, stop, right
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("left")
           //.setLabel("Left")
            .setEmoji("⬅️")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId("stop")
            //.setLabel("Stop")
            .setEmoji("⏹️")
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId("right")
            //.setLabel("Right")
            .setEmoji("➡️")
            .setStyle(ButtonStyle.Primary)
    );

    // Third row: blank, down, blank
    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId("blank3")
            .setLabel("\u200B")  // Zero-width space
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true),
        new ButtonBuilder()
            .setCustomId("down")
            //.setLabel("Down")
            .setEmoji("⬇️")
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId("blank4")
            .setLabel("\u200B")  // Zero-width space
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
    );

    return [row1, row2, row3];
}

function createEmptyBoard() {
    const board = [];
    for (let y = 0; y < GAME_ROWS; y++) {
        const row = [];
        for (let x = 0; x < GAME_COLS; x++) {
            row.push(EMOJIS.empty);
        }
        board.push(row);
    }
    return board;
}

function renderBoard(board) {
    return board.map(row => row.join("")).join("\n");
}

function placeApple(snakePositions) {
    while (true) {
        const apple = {
            x: Math.floor(Math.random() * GAME_COLS),
            y: Math.floor(Math.random() * GAME_ROWS),
        };
        
        // Make sure apple doesn't appear on the snake
        const onSnake = snakePositions.some(
            segment => segment.x === apple.x && segment.y === apple.y
        );
        
        if (!onSnake) {
            return apple;
        }
    }
}