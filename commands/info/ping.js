const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Checks the bot and API latency'),
    name: 'ping',
    description: 'Checks the bot and API latency',
    prefix: true,
    
    async execute(interaction) {
        const sent = await interaction.reply({ content: 'Pinging...', fetchReply: true });
        const botLatency = sent.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(interaction.client.ws.ping);

        const embed = this.generatePingEmbed(botLatency, apiLatency, interaction.guild.iconURL() || interaction.author.displayAvatarURL());
        await interaction.editReply({ content: '`🏓` Pong!', embeds: [embed] });
    },
    async run(message) {
        const sentMessage = await message.channel.send('Pinging...');
        const botLatency = sentMessage.createdTimestamp - message.createdTimestamp;
        const apiLatency = Math.round(message.client.ws.ping);

        const embed = this.generatePingEmbed(botLatency, apiLatency, message.guild.iconURL() || message.author.displayAvatarURL());
        await sentMessage.edit({ content: '`🏓` Pong!', embeds: [embed] });
    },
    generatePingEmbed(botLatency, apiLatency, guildIcon) {
        // Default to green
        let botLatencyEmoji = '<:GoodConnection:1357782415078064178>';
        let apiLatencyEmoji = '<:GoodConnection:1357782415078064178>';
        let embedColor = config.embedColors.green;
        let latencyBotText = `\`\`\`ansi\n[2;32m[0m[2;32m${botLatency}[0m\n\`\`\``;
        let latencyApiText = `\`\`\`ansi\n[2;32m[0m[2;32m${apiLatency}[0m\n\`\`\``;

        // Update colors and emojis based on thresholds
        if (botLatency >= 800) {
            embedColor = config.embedColors.red; // Red
            botLatencyEmoji = '<:LowConnection:1357782435617706186>';
            latencyBotText = `\`\`\`ansi\n[2;31m${botLatency}[0m\n\`\`\``;
        } else if (botLatency >= 500) {
            embedColor = config.embedColors.yellow; // Yellow
            botLatencyEmoji = '<:IdleConnection:1357782428034535497>';
            latencyBotText = `\`\`\`ansi\n[2;33m${botLatency}[0m\n\`\`\``;
        }

        if (apiLatency >= 800) {
            apiLatencyEmoji = '<:LowConnection:1357782435617706186>';
            latencyApiText = `\`\`\`ansi\n[2;31m${apiLatency}[0m\n\`\`\``;
        } else if (apiLatency >= 500) {
            apiLatencyEmoji = '<:IdleConnection:1357782428034535497>';
            latencyApiText = `\`\`\`ansi\n[2;33m${apiLatency}[0m\n\`\`\``;
        } else if (apiLatency < 0) {
            apiLatencyEmoji = '<:LowConnection:1357782435617706186>'; // Red for negative latency
            latencyApiText = `\`\`\`ansi\n[2;31m${apiLatency}[0m\n\`\`\``;
        }

        return new EmbedBuilder()
            .setAuthor({ name: '🏓 Pong', iconURL: guildIcon })
            .setColor(embedColor)
            .addFields(
                { name: `Latency ${botLatencyEmoji}`, value: latencyBotText, inline: true },
                { name: `API Latency ${apiLatencyEmoji}`, value: latencyApiText, inline: true }
            )
            .setTimestamp();
    }
};
