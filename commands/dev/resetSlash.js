const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resetslash')
        .setDescription('Reset all slash commands by clearing them'),
    
    async execute(interaction) {
        try {
            // Clear all guild commands
            await interaction.guild.commands.set([]);
            
            // Clear all global commands
            await interaction.client.application.commands.set([]);
            
            await interaction.reply({
                content: '`\`✅\`` All slash commands have been cleared successfully!',
                flags: MessageFlags.Ephermeral
            });
        } catch (error) {
            console.error('Error clearing commands:', error);
            await interaction.reply({
                content: '\`❌\` Failed to clear slash commands.',
                flags: MessageFlags.Ephermeral
            });
        }
    },
};