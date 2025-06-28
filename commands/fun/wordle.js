const { SlashCommandBuilder } = require('discord.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const logger = require('../../utils/logger.js');

// List of 5-letter words for Wordle
const WORD_LIST = [
    "apple", "beach", "claim", "dance", "early", "float", "globe", "heart",
    "index", "juice", "knife", "lemon", "metal", "night", "ocean", "party",
    "quiet", "royal", "steam", "trust", "uncle", "voice", "waste", "xenon",
    "yacht", "zebra", "pager", "abide", "baker", "cable", "daily", "eager",
    "fable", "gamer", "hazel", "ideal", "jolly", "kitty", "laser", "magic",
    "noble", "orbit", "pixel", "quake", "rider", "solar", "tiger", "ulcer",
    "value", "water", "yield", "zesty", "amber", "blame", "chair", "dream"
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('wordle')
        .setDescription('Play Wordle, the popular word guessing game!'),
    
    // For classic command handling
    name: 'wordle',
    description: 'Play Wordle, the popular word guessing game!',
    aliases: ['wordguess'],
    usage: 'wordle',
    category: 'fun',
    
    async execute(interaction, args, client) {
        // Determine if this is a slash command or message command
        const isSlash = interaction.commandId ? true : false;
        const user = isSlash ? interaction.user : interaction.author;
        
        // Pick a random word from our list
        const word = WORD_LIST[Math.floor(Math.random() * WORD_LIST.length)].toUpperCase();
        
        // Game setup
        const gameState = {
            word: word,
            guesses: [],
            maxGuesses: 6,
            gameOver: false,
            won: false,
            collector: null,
            message: null
        };
        
        // Start the game
        await startGame(interaction, user, gameState, isSlash);
    }
};

async function startGame(interaction, user, gameState, isSlash) {
    const embed = createEmbed(gameState, user);
    
    // Create button rows for keyboard
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
    
    // Set up button collector for keyboard input
    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 600000, // 10 minutes
    });
    
    gameState.collector = collector;
    
    // Current guess being built
    let currentGuess = '';
    
    collector.on('collect', async i => {
        // Only the person who started the game can play it
        if (i.user.id !== user.id) {
            await i.reply({ 
                content: 'This is not your game!', 
                flags: MessageFlags.Ephemeral 
            });
            return;
        }
        
        // Game already over
        if (gameState.gameOver) {
            await i.deferUpdate();
            return;
        }
        
        // Handle button press
        const buttonId = i.customId;
        
        if (buttonId === 'ENTER') {
            if (currentGuess.length !== 5) {
                await i.reply({ 
                    content: 'Your guess must be 5 letters!', 
                    flags: MessageFlags.Ephemeral 
                });
                return;
            }
            
            // Submit guess
            gameState.guesses.push(currentGuess);
            
            // Check if the player won
            if (currentGuess === gameState.word) {
                gameState.won = true;
                gameState.gameOver = true;
            }
            
            // Check if out of guesses
            if (gameState.guesses.length >= gameState.maxGuesses) {
                gameState.gameOver = true;
            }
            
            // Reset current guess
            currentGuess = '';
            
            // Update the game
            const updatedEmbed = createEmbed(gameState, user);
            const updatedRows = createKeyboard(gameState);
            
            await i.update({ 
                embeds: [updatedEmbed], 
                components: updatedRows 
            });
            
            // If game over, stop the collector
            if (gameState.gameOver) {
                collector.stop();
            }
        } else if (buttonId === 'DELETE') {
            if (currentGuess.length > 0) {
                currentGuess = currentGuess.slice(0, -1);
            }
            
            const pendingEmbed = createEmbed(gameState, user, currentGuess);
            const updatedRows = createKeyboard(gameState);
            
            await i.update({ 
                embeds: [pendingEmbed], 
                components: updatedRows 
            });
        } else {
            // Letter button pressed
            if (currentGuess.length < 5) {
                currentGuess += buttonId;
            }
            
            const pendingEmbed = createEmbed(gameState, user, currentGuess);
            const updatedRows = createKeyboard(gameState);
            
            await i.update({ 
                embeds: [pendingEmbed], 
                components: updatedRows 
            });
        }
    });
    
    collector.on('end', async () => {
        if (!gameState.gameOver) {
            gameState.gameOver = true;
            const timeoutEmbed = createEmbed(gameState, user);
            timeoutEmbed.setTitle('Wordle - Timed Out')
                .setDescription(`Game ended due to inactivity. The word was **${gameState.word}**.`);
            
            // Disable all buttons
            const disabledRows = createKeyboard(gameState, true);
            
            await gameState.message.edit({ 
                embeds: [timeoutEmbed], 
                components: disabledRows 
            }).catch(logger.error);
        }
    });
}

function createEmbed(gameState, user, currentGuess = '') {
    const embed = new EmbedBuilder()
        .setTitle('🔤 Wordle')
        .setColor(gameState.gameOver ? (gameState.won ? '#2ECC71' : '#FF5733') : '#3498DB')
        .setFooter({ text: `${user.username}'s game` });
    
    let description = '';
    
    // Add guesses
    if (gameState.guesses.length === 0 && currentGuess === '') {
        description += 'Guess the 5-letter word!\n\n';
        // Show empty rows
        for (let i = 0; i < gameState.maxGuesses; i++) {
            description += '⬜⬜⬜⬜⬜\n';
        }
    } else {
        // Show guesses with colored blocks
        for (let i = 0; i < gameState.maxGuesses; i++) {
            if (i < gameState.guesses.length) {
                description += evaluateGuess(gameState.guesses[i], gameState.word);
            } else if (i === gameState.guesses.length && currentGuess) {
                // Current guess in progress
                const paddedGuess = currentGuess.padEnd(5, '⬜');
                for (let j = 0; j < paddedGuess.length; j++) {
                    if (paddedGuess[j] === '⬜') {
                        description += '⬜';
                    } else {
                        description += `🔠`; // Letter being typed
                    }
                }
                description += '\n';
            } else {
                // Empty rows
                description += '⬜⬜⬜⬜⬜\n';
            }
        }
    }
    
    if (gameState.gameOver) {
        description += '\n';
        if (gameState.won) {
            description += `<a:confeti:1379545512507740352> You won in ${gameState.guesses.length}/${gameState.maxGuesses} tries!`;
        } else {
            description += `❌ Game over! The word was **${gameState.word}**.`;
        }
    }
    
    embed.setDescription(description);
    return embed;
}

function createKeyboard(gameState = null, disableAll = false) {
    // Create a virtual keyboard layout
    const keyboard = [
        ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
        ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
        ['Z', 'X', 'C', 'V', 'B', 'N', 'M', 'DELETE', 'ENTER']
    ];
    
    // Track guessed letters for coloring
    const letterStates = {};
    
    // Process guesses to determine letter states if game exists
    if (gameState && gameState.guesses.length > 0) {
        for (const guess of gameState.guesses) {
            for (let i = 0; i < guess.length; i++) {
                const letter = guess[i];
                
                if (gameState.word[i] === letter) {
                    // Correct position
                    letterStates[letter] = 'correct';
                } else if (gameState.word.includes(letter) && letterStates[letter] !== 'correct') {
                    // Present but wrong position
                    letterStates[letter] = 'present';
                } else if (!letterStates[letter]) {
                    // Not in word
                    letterStates[letter] = 'absent';
                }
            }
        }
    }
    
    // Create button rows
    const rows = [];
    
    keyboard.forEach((row, rowIndex) => {
        const actionRow = new ActionRowBuilder();
        
        row.forEach(key => {
            let style = ButtonStyle.Secondary;
            let label = key;
            let disabled = disableAll || (gameState && gameState.gameOver);
            
            if (gameState && key !== 'DELETE' && key !== 'ENTER') {
                // Color the letter buttons based on guesses
                if (letterStates[key] === 'correct') {
                    style = ButtonStyle.Success;
                } else if (letterStates[key] === 'present') {
                    style = ButtonStyle.Primary;
                } else if (letterStates[key] === 'absent') {
                    style = ButtonStyle.Secondary;
                    disabled = true;
                }
            }
            
            if (key === 'DELETE') {
                style = ButtonStyle.Danger;
                label = '⌫';
            } else if (key === 'ENTER') {
                style = ButtonStyle.Success;
                label = 'Enter';
            }
            
            const button = new ButtonBuilder()
                .setCustomId(key)
                .setLabel(label)
                .setStyle(style)
                .setDisabled(disabled);
                
            actionRow.addComponents(button);
        });
        
        rows.push(actionRow);
    });
    
    return rows;
}

function evaluateGuess(guess, target) {
    let result = '';
    
    // First pass: mark correct letters
    const correctMask = Array(5).fill(false);
    const letterCount = countLetters(target);
    
    // Mark correct letters
    for (let i = 0; i < 5; i++) {
        if (guess[i] === target[i]) {
            result += '🟩'; // Correct position
            correctMask[i] = true;
            letterCount[guess[i]]--;
        }
    }
    
    // Second pass: mark present and absent letters
    for (let i = 0; i < 5; i++) {
        if (correctMask[i]) continue; // Skip already marked correct
        
        if (letterCount[guess[i]] > 0) {
            result += '🟨'; // Present but wrong position
            letterCount[guess[i]]--;
        } else {
            result += '⬛'; // Not in the word
        }
    }
    
    return result + '\n';
}

function countLetters(word) {
    const count = {};
    for (const letter of word) {
        count[letter] = (count[letter] || 0) + 1;
    }
    return count;
}