const { SlashCommandBuilder, EmbedBuilder, Client } = require('discord.js');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const client = require('../../index.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Displays all available commands by category.'),
    name: 'help',
    description: 'Displays all available commands by category.',
    prefix: true,
    async execute(interaction, client) { // Ensure client is passed
        const categories = getCommandCategories();
        const helpEmbed = createHelpEmbed(categories, interaction.user, client); // Pass client here

        await interaction.reply({ embeds: [helpEmbed] });
    },
    /**
    * 
    * @param {import('discord.js').Message} message
    * @param {string[]} args
    * @param {import('discord.js').Client} client
    */
    async run(message, client) { // Ensure client is passed
        const categories = getCommandCategories();
        const helpEmbed = createHelpEmbed(categories, message.author, client); // Pass client here

        await message.channel.send({ embeds: [helpEmbed] });
    }
};

// Helper: Reads commands directory to categorize commands
function getCommandCategories() {
    const commandsDir = path.join(__dirname, '..');
    const categories = {};

    fs.readdirSync(commandsDir).forEach(folder => {
        const folderPath = path.join(commandsDir, folder);
        if (fs.lstatSync(folderPath).isDirectory()) {
            const commandFiles = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
            const commands = commandFiles.map(file => {
                const command = require(path.join(folderPath, file));
                return command.data?.name || command.name;
            }).filter(Boolean);

            if (commands.length) {
                categories[folder] = commands;
            }
        }
    });

    return categories;
}

// Helper: Creates the help embed
function createHelpEmbed(categories, user) { // Accept client as an argument
    const embed = new EmbedBuilder()
        .setTitle('Help Menu')
        .setDescription('Here is a list of all available commands categorized by their functionality.')
        .setColor(config.embedColors.main)
        .setImage(config.bannerUrl) // Use client.user here
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 4096 })) // Use client.user here
        .setFooter({
            text: `Help command | Requested by ${user.username}`,
            iconURL: user.displayAvatarURL({ dynamic: true })
        })
        .setTimestamp();

    for (const [category, commands] of Object.entries(categories)) {
        embed.addFields({
            name: `**${capitalize(category)}**`,
            value: `\`${commands.join('`, `')}\``,
            inline: false
        });
    }

    return embed;
}

// Helper: Capitalizes the first letter of a string
function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}
