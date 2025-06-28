const { SlashCommandBuilder } = require('discord.js');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const logger = require('../../utils/logger.js');

// Word list for the game
const words = [
    'discord', 'javascript', 'developer', 'programming', 'keyboard',
    'monitor', 'computer', 'algorithm', 'database', 'variable',
    'function', 'interface', 'module', 'server', 'client',
    'network', 'wireless', 'internet', 'website', 'browser',
    'application', 'framework', 'library', 'component', 'plugin',
    'syntax', 'semantic', 'debugging', 'compiler', 'interpreter',
    'recursive', 'iteration', 'condition', 'parameter', 'callback',
    'promise', 'asynchronous', 'synchronous', 'object', 'array'
];

// Time limits in seconds
const EASY_TIME = 30;
const MEDIUM_TIME = 20;
const HARD_TIME = 12;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('fasttype')
        .setDescription('Test your typing speed with a word scramble game!')
        .addStringOption(option =>
            option.setName('difficulty')
                .setDescription('Choose the difficulty level')
                .setRequired(false)
                .addChoices(
                    { name: 'Easy', value: 'easy' },
                    { name: 'Medium', value: 'medium' },
                    { name: 'Hard', value: 'hard' }
                )),
    
    // For classic command handling
    name: 'fasttype',
    description: 'Test your typing speed with a word scramble game!',
    aliases: ['typefast', 'wordrace', 'wordscramble'],
    usage: 'fasttype [easy|medium|hard]',
    category: 'fun',
    
    // Unified execute function for both slash and classic commands
    async execute(interaction, args, client) {
        // Determine if this is a slash command or message command
        const isSlash = interaction.commandId ? true : false;
        const user = isSlash ? interaction.user : interaction.author;
        
        // Get difficulty
        let difficulty = 'medium'; // Default to medium
        
        if (isSlash) {
            const selectedDifficulty = interaction.options.getString('difficulty');
            if (selectedDifficulty) difficulty = selectedDifficulty;
        } else {
            if (args && args.length > 0) {
                const inputDifficulty = args[0].toLowerCase();
                if (['easy', 'medium', 'hard'].includes(inputDifficulty)) {
                    difficulty = inputDifficulty;
                }
            }
        }
        
        // Set up time limit based on difficulty
        let timeLimit;
        switch (difficulty) {
            case 'easy': timeLimit = EASY_TIME; break;
            case 'hard': timeLimit = HARD_TIME; break;
            default: timeLimit = MEDIUM_TIME;
        }
        
        // Initialize game
        const selectedWord = words[Math.floor(Math.random() * words.length)];
        const scrambledWord = scrambleWord(selectedWord);
        const gameData = {
            word: selectedWord,
            scrambled: scrambledWord,
            startTime: Date.now(),
            timeLimit: timeLimit * 1000, // Convert to milliseconds
            difficulty: difficulty,
            ended: false
        };
        
        // Create embed
        const embed = new EmbedBuilder()
            .setTitle('⌨️ Fast Type - Word Scramble')
            .setDescription(
                `**Difficulty:** ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}\n` +
                `**Time Limit:** ${timeLimit} seconds\n\n` +
                `Unscramble this word: **${scrambledWord}**\n\n` +
                `Type the correct word in this channel.`
            )
            .setColor('#3498DB')
            .setFooter({ text: `Requested by ${user.username}` })
            .setTimestamp();
        
        // Send message
        let gameMessage;
        if (isSlash) {
            gameMessage = await interaction.reply({ embeds: [embed], fetchReply: true });
        } else {
            gameMessage = await interaction.channel.send({ embeds: [embed] });
        }
        
        // Create message collector
        const filter = m => !m.author.bot;
        const collector = interaction.channel.createMessageCollector({
            filter,
            time: timeLimit * 1000
        });
        
        collector.on('collect', async (message) => {
            // Ignore messages from other users if in a busy channel
            if (message.author.id !== user.id) return;
            
            const guess = message.content.toLowerCase().trim();
            
            if (guess === selectedWord.toLowerCase()) {
                // Calculate time taken
                const timeTaken = (Date.now() - gameData.startTime) / 1000;
                const formattedTime = timeTaken.toFixed(2);
                
                // Calculate WPM (Words Per Minute)
                // Assuming average word is 5 characters
                const charactersPerSecond = selectedWord.length / timeTaken;
                const wpm = Math.round((charactersPerSecond * 60) / 5);
                
                // Success embed
                const successEmbed = new EmbedBuilder()
                    .setTitle('⌨️ Fast Type - You got it! <a:confeti:1379545512507740352>')
                    .setDescription(
                        `You unscrambled **${scrambledWord}** correctly!\n\n` +
                        `\`✅\` Correct Word: **${selectedWord}**\n` +
                        `⏱️ Time Taken: **${formattedTime}s**\n` +
                        `🏆 Typing Speed: **${wpm} WPM**`
                    )
                    .setColor('#2ECC71')
                    .setFooter({ text: `Difficulty: ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}` })
                    .setTimestamp();
                
                // Award a score based on difficulty and time
                let scoreModifier;
                switch (difficulty) {
                    case 'easy': scoreModifier = 1; break;
                    case 'medium': scoreModifier = 1.5; break;
                    case 'hard': scoreModifier = 2; break;
                    default: scoreModifier = 1;
                }
                
                const score = Math.round((selectedWord.length / timeTaken) * scoreModifier * 10);
                successEmbed.addFields({ name: 'Score', value: `${score} points` });
                
                await gameMessage.edit({ embeds: [successEmbed] });
                gameData.ended = true;
                collector.stop('success');
            }
        });
        
        collector.on('end', (collected, reason) => {
            if (reason !== 'success' && !gameData.ended) {
                const timeoutEmbed = new EmbedBuilder()
                    .setTitle('⌨️ Fast Type - Time\'s up! ⏱️')
                    .setDescription(
                        `You ran out of time!\n\n` +
                        `The correct word was: **${selectedWord}**`
                    )
                    .setColor('#FF5733')
                    .setFooter({ text: `Better luck next time, ${user.username}!` })
                    .setTimestamp();
                
                gameMessage.edit({ embeds: [timeoutEmbed] }).catch(logger.error);
            }
        });
    },
};

// Function to scramble a word
function scrambleWord(word) {
    const wordArray = word.split('');
    
    // Fisher-Yates shuffle algorithm
    for (let i = wordArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [wordArray[i], wordArray[j]] = [wordArray[j], wordArray[i]];
    }
    
    // Make sure the scrambled word is different from the original
    let scrambled = wordArray.join('');
    while (scrambled === word) {
        // Try again if we got the same word back
        for (let i = wordArray.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [wordArray[i], wordArray[j]] = [wordArray[j], wordArray[i]];
        }
        scrambled = wordArray.join('');
    }
    
    return scrambled;
}