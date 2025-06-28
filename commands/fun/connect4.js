const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { Connect4 } = require('discord-gamecord');
const logger = require('../../utils/logger.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('connect4')
        .setDescription('Play Connect 4 with someone!')
        .addUserOption(option => 
            option.setName('opponent')
                .setDescription('The user you want to play against')
                .setRequired(true)),
    
    // For classic command handling
    name: 'connect4',
    description: 'Play Connect 4 with someone!',
    aliases: ['connect-4', 'c4'],
    usage: 'connect4 @user',
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
        
        // Initialize game
        const Game = new Connect4({
            message: interaction,
            isSlashGame: isSlash,
            opponent: opponent,
            embed: {
                title: 'Connect 4',
                color: '#3498DB',
                statusTitle: 'Status',
                statusText: 'Waiting for opponent to make a move...'
            },
            emojis: {
                board: '⚪',
                player1: '🔴',
                player2: '🟡'
            },
            mentionUser: true,
            timeoutTime: 60000,
            buttonStyle: 'PRIMARY',
            turnMessage: '{emoji} | It\'s turn of player **{player}**.',
            winMessage: '{emoji} | **{player}** won the Connect 4 game.',
            tieMessage: 'The game tied! No one won the game!',
            timeoutMessage: 'The game went unfinished! No one won the game!',
            playerOnlyMessage: 'Only {player} and {opponent} can use these buttons.'
        });
        
        Game.startGame();
    },
};