const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../../config.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('developers')
    .setDescription('Meet the developers behind this bot'),
  name: 'developers',
  description: 'Meet the developers behind this bot',
  aliases: ['devs', 'creators', 'authors'],
  prefix: true,  async execute(interaction, client, args) {
    // Handle both slash and prefix commands
    let isSlashCommand = interaction.isChatInputCommand?.();
    
    // Ensure we have the client reference
    if (!client) {
      client = interaction.client || interaction.guild?.client;
    }
      if (isSlashCommand) {
      await interaction.deferReply();
    }

    // Developer information
    const developers = [
        {
          id: '573709909594734603',
          name: 'CharlesNaig',
          role: 'Senior Developer',
          github: 'https://github.com/CharlesNaig',
          description: 'Main bot developer and project maintainer',
          color: '#28a363'
        },
        {
          id: '774974687394267157',
          name: 'Daisukie',
          role: 'Senior Developer',
          github: 'https://github.com/DaisuKiee', // Add GitHub if available
          description: 'Contributing developer',
          color: '#13a6ef'
        }
      ];

      const embeds = [];
      const buttons = [];

      for (const dev of developers) {
        try {
          // Fetch Discord user
          const user = await client.users.fetch(dev.id);
          
          const embed = new EmbedBuilder()
            .setTitle(`${dev.role}: ${dev.name}`)
            .setColor(dev.color)
            .setThumbnail(user.displayAvatarURL({ size: 256 }))
            .setDescription(dev.description)
            .addFields(
              { name: '`👤` Discord Tag', value: user.tag, inline: true },
              { name: '`🆔` User ID', value: dev.id, inline: true },
              { name: '`📅` Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`, inline: false }
            );

          // Add GitHub if available
          if (dev.github) {
            embed.addFields({ name: '💻 GitHub', value: `[${dev.name}](${dev.github})`, inline: true });
          }

          // Add user status if available
          if (user.presence?.status) {
            const statusEmoji = {
              online: '🟢',
              idle: '🟡',
              dnd: '🔴',
              offline: '⚫'
            };
            embed.addFields({ 
              name: '`📶` Status', 
              value: `${statusEmoji[user.presence.status] || '⚫'} ${user.presence.status.charAt(0).toUpperCase() + user.presence.status.slice(1)}`, 
              inline: true 
            });
          }

          // Add custom status if available
          if (user.presence?.activities?.length > 0) {
            const activity = user.presence.activities[0];
            if (activity.type === 4) { // Custom status
              embed.addFields({ name: '`💭` Custom Status', value: activity.state || 'No custom status', inline: false });
            }
          }

          embeds.push(embed);

          // Add buttons for each developer
          if (dev.github) {
            buttons.push(
              new ButtonBuilder()
                .setLabel(`${dev.name}'s GitHub`)
                .setStyle(ButtonStyle.Link)
                .setURL(dev.github)
                .setEmoji('904792338512105523')
            );
          }
        } catch (error) {
          console.error(`Failed to fetch user ${dev.id}:`, error);
          
          // Fallback embed if user fetch fails
          const fallbackEmbed = new EmbedBuilder()
            .setTitle(`${dev.role}: ${dev.name}`)
            .setColor(dev.color)
            .setDescription(dev.description)
            .addFields(
              { name: '`🆔` User ID', value: dev.id, inline: true },
              { name: '`⚠️` Status', value: 'User information unavailable', inline: true }
            );

          if (dev.github) {
            fallbackEmbed.addFields({ name: '💻 GitHub', value: `[${dev.name}](${dev.github})`, inline: true });
          }

          embeds.push(fallbackEmbed);
        }
      }

      // Main info embed
      const mainEmbed = new EmbedBuilder()
        .setTitle('`🛠️` Bot Developers')
        .setDescription('Meet the talented developers who created and maintain this bot!')
        .setColor('#5865F2')
        .addFields(
          { name: '`📊` Bot Stats', value: `Serving ${client.guilds.cache.size} servers\nHelping ${client.users.cache.size} users`, inline: true },
          { name: '`🔗` Links', value: 'Check out our GitHub profiles and connect with us!', inline: true }
        )
        .setFooter({ text: 'Thank you for using our bot!' })
        .setTimestamp();

      // Add all embeds
      embeds.unshift(mainEmbed);

      // Create button row if we have buttons
      let components = [];
      if (buttons.length > 0) {
        components.push(new ActionRowBuilder().addComponents(buttons.slice(0, 5))); // Max 5 buttons per row
        
        // If more than 5 buttons, create additional rows
        if (buttons.length > 5) {
          components.push(new ActionRowBuilder().addComponents(buttons.slice(5, 10)));
        }
      }      // Send response
      if (isSlashCommand) {
        await interaction.editReply({ embeds: embeds, components: components });
      } else {
        await interaction.reply({ embeds: embeds, components: components });
      }
  },

  // Prefix command execution
  async run(message, args, client) {
    await this.execute(message, client, args);
  }
};