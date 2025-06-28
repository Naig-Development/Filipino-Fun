const { SlashCommandBuilder } = require('discord.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const logger = require('../../utils/logger.js');

// Word categories
const WORD_CATEGORIES = {
    animals: [
        'elephant', 'giraffe', 'penguin', 'kangaroo', 'dolphin', 
        'cheetah', 'octopus', 'rhinoceros', 'crocodile', 'squirrel'
    ],
    countries: [
        'australia', 'canada', 'japan', 'brazil', 'germany',
        'egypt', 'philippines', 'mexico', 'sweden', 'morocco'
    ],
    food: [
        'chocolate', 'hamburger', 'pineapple', 'spaghetti', 'avocado',
        'pancake', 'milkshake', 'sandwich', 'quesadilla', 'barbecue'
    ],
    technology: [
        'computer', 'smartphone', 'internet', 'satellite', 'headphones',
        'keyboard', 'bluetooth', 'microphone', 'television', 'projector'
    ]
};

// Hangman stages visuals
const HANGMAN_STAGES = [
    '```\n\n\n\n\n\n```',
    '```\n\n\n\n\n_______```',
    '```\n|\n|\n|\n|\n|_______```',
    '```\n|/\n|\n|\n|\n|_______```',
    '```\n|/----\n|\n|\n|\n|_______```',
    '```\n|/----\n|   O\n|\n|\n|_______```',
    '```\n|/----\n|   O\n|   |\n|\n|_______```',
    '```\n|/----\n|   O\n|  /|\n|\n|_______```',
    '```\n|/----\n|   O\n|  /|\\\n|\n|_______```',
    '```\n|/----\n|   O\n|  /|\\\n|  /\n|_______```',
    '```\n|/----\n|   O\n|  /|\\\n|  / \\\n|_______```'
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hangman')
        .setDescription('Play a game of Hangman!')
        .addStringOption(option =>
            option.setName('category')
                .setDescription('Choose a word category')
                .setRequired(false)
                .addChoices(
                    { name: 'Animals', value: 'animals' },
                    { name: 'Countries', value: 'countries' },
                    { name: 'Food', value: 'food' },
                    { name: 'Technology', value: 'technology' },
                    { name: 'Random', value: 'random' }
                )),
    
    // For classic command handling
    name: 'hangman',
    description: 'Play a game of Hangman!',
    aliases: ['hang'],
    usage: 'hangman [category]',
    category: 'fun',
    
    async execute(interaction, args, client) {
        // Determine if this is a slash command or message command
        const isSlash = interaction.commandId ? true : false;
        const user = isSlash ? interaction.user : interaction.author;
        
        // Get category
        let category = 'random';
        if (isSlash) {
            const selectedCategory = interaction.options.getString('category');
            if (selectedCategory) category = selectedCategory;
        } else if (args && args.length > 0) {
            const input = args[0].toLowerCase();
            if (WORD_CATEGORIES[input] || input === 'random') {
                category = input;
            }
        }
        
        // Select a random category if 'random' is chosen
        if (category === 'random') {
            const categories = Object.keys(WORD_CATEGORIES);
            category = categories[Math.floor(Math.random() * categories.length)];
        }
        
        // Select a random word from the category
        const words = WORD_CATEGORIES[category];
        const word = words[Math.floor(Math.random() * words.length)].toUpperCase();
        
        // Initialize game state
        const gameState = {
            word: word,
            guessedLetters: new Set(),
            incorrectGuesses: 0,
            maxIncorrectGuesses: 10,
            gameOver: false,
            won: false,
            message: null,
            collector: null
        };
        
        // Start the game
        await startGame(interaction, user, gameState, category, isSlash);
    }
};

async function startGame(interaction, user, gameState, category, isSlash) {
    // Create initial embed
    const embed = createGameEmbed(gameState, category, user);
    
    // Create keyboard for letter selections
    const rows = createKeyboard();
    
    // Send the initial message
    let reply;
    if (isSlash) {
        reply = await interaction.reply({
            embeds: [embed],
            components: rows,
            fetchReply: true
        });
    } else {
        reply = await interaction.channel.send({
            embeds: [embed],
            components: rows
        });
    }
    
    gameState.message = reply;
    
    // Set up collector for button interactions
    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 300000 // 5 minute limit
    });
    
    gameState.collector = collector;
    
    collector.on('collect', async i => {
        // Only the person who started the game can play
        if (i.user.id !== user.id) {
            await i.reply({
                content: 'This is not your game!',
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        // Do nothing if game is over
        if (gameState.gameOver) {
            await i.deferUpdate();
            return;
        }
        
        // Handle letter selection
        if (i.customId === 'hangman_restart') {
            // Restart the game
            await i.deferUpdate();
            collector.stop('restart');
            return;
        }
        
        const letter = i.customId.replace('hangman_', '');
        
        // Add to guessed letters
        gameState.guessedLetters.add(letter);
        
        // Check if letter is in the word
        if (!gameState.word.includes(letter)) {
            gameState.incorrectGuesses++;
        }
        
        // Check if game is won
        if (isGameWon(gameState)) {
            gameState.gameOver = true;
            gameState.won = true;
        }
        
        // Check if game is lost
        if (gameState.incorrectGuesses >= gameState.maxIncorrectGuesses) {
            gameState.gameOver = true;
        }
        
        // Update the game display
        const updatedEmbed = createGameEmbed(gameState, category, user);
        const updatedRows = createKeyboard(gameState);
        
        await i.update({
            embeds: [updatedEmbed],
            components: updatedRows
        });
        
        // If game is over, stop the collector
        if (gameState.gameOver) {
            // Add restart button if desired
            if (gameState.won || gameState.incorrectGuesses >= gameState.maxIncorrectGuesses) {
                const restartRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('hangman_restart')
                        .setLabel('Play Again')
                        .setStyle(ButtonStyle.Success)
                );
                
                // Add the restart button
                gameState.message.edit({
                    components: [...updatedRows, restartRow]
                }).catch(logger.error);
            }
        }
    });
    
    collector.on('end', async (collected, reason) => {
        if (reason === 'restart') {
            // Start a new game with the same category
            const newWord = WORD_CATEGORIES[category][
                Math.floor(Math.random() * WORD_CATEGORIES[category].length)
            ].toUpperCase();
            
            const newGameState = {
                word: newWord,
                guessedLetters: new Set(),
                incorrectGuesses: 0,
                maxIncorrectGuesses: 10,
                gameOver: false,
                won: false,
                message: null,
                collector: null
            };
            
            await startGame(interaction, user, newGameState, category, false);
        } else if (!gameState.gameOver) {
            // Game timed out
            gameState.gameOver = true;
            const timeoutEmbed = new EmbedBuilder()
                .setTitle('🎮 Hangman - Timed Out')
                .setDescription(`Game ended due to inactivity.\nThe word was: **${gameState.word}**`)
                .setColor('#FF5733')
                .addFields(
                    { name: 'Category', value: category.charAt(0).toUpperCase() + category.slice(1) }
                )
                .setFooter({ text: `${user.username}'s game` });
                
            // Update with disabled buttons
            const disabledRows = createKeyboard(gameState, true);
            
            gameState.message.edit({
                embeds: [timeoutEmbed],
                components: disabledRows
            }).catch(logger.error);
        }
    });
}

function createGameEmbed(gameState, category, user) {
    // Create the current word display
    let wordDisplay = '';
    for (const char of gameState.word) {
        if (gameState.guessedLetters.has(char) || gameState.gameOver && gameState.won) {
            wordDisplay += char + ' ';
        } else if (gameState.gameOver && !gameState.won) {
            // Show the missed letters in red (using Discord formatting)
            wordDisplay += gameState.guessedLetters.has(char) ? char + ' ' : `__${char}__ `;
        } else {
            wordDisplay += '\_ ';
        }
    }
    
    // Create the embed
    const embed = new EmbedBuilder()
        .setTitle('🎮 Hangman')
        .setColor(
            gameState.gameOver ? 
                (gameState.won ? '#2ECC71' : '#FF5733') : 
                '#3498DB'
        )
        .setDescription(
            `${HANGMAN_STAGES[gameState.incorrectGuesses]}\n\n` +
            `**Word:** ${wordDisplay.trim()}\n\n` +
            `**Incorrect Guesses:** ${gameState.incorrectGuesses}/${gameState.maxIncorrectGuesses}`
        )
        .addFields(
            { name: 'Category', value: category.charAt(0).toUpperCase() + category.slice(1) }
        )
        .setFooter({ text: `${user.username}'s game` });
    
    // Add result message if game is over
    if (gameState.gameOver) {
        if (gameState.won) {
            embed.addFields({ 
                name: 'Result', 
                value: '<a:confeti:1379545512507740352> You won! You guessed the word correctly!' 
            });
        } else {
            embed.addFields({ 
                name: 'Result', 
                value: `❌ Game over! The word was **${gameState.word}**.` 
            });
        }
    }
    
    return embed;
}

function createKeyboard(gameState = null, disableAll = false) {
    // Create a virtual keyboard layout
    const keyboard = [
        ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
        ['H', 'I', 'J', 'K', 'L', 'M', 'N'],
        ['O', 'P', 'Q', 'R', 'S', 'T', 'U'],
        ['V', 'W', 'X', 'Y', 'Z']
    ];
    
    // Create button rows
    const rows = [];
    
    keyboard.forEach((row, rowIndex) => {
        const actionRow = new ActionRowBuilder();
        
        row.forEach(key => {
            let style = ButtonStyle.Secondary;
            let disabled = disableAll;
            
            if (gameState && gameState.guessedLetters.has(key)) {
                disabled = true;
                
                // Green for correct guesses, Danger for wrong guesses
                if (gameState.word.includes(key)) {
                    style = ButtonStyle.Success;
                } else {
                    style = ButtonStyle.Danger;
                }
            }
            
            // Disable all buttons if game is over
            if (gameState && gameState.gameOver) {
                disabled = true;
            }
            
            const button = new ButtonBuilder()
                .setCustomId(`hangman_${key}`)
                .setLabel(key)
                .setStyle(style)
                .setDisabled(disabled);
                
            actionRow.addComponents(button);
        });
        
        rows.push(actionRow);
    });
    
    return rows;
}

function isGameWon(gameState) {
    // Check if all letters in the word have been guessed
    for (const letter of gameState.word) {
        if (!gameState.guessedLetters.has(letter)) {
            return false;
        }
    }
    return true;
}