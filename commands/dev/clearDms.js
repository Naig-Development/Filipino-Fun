const {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags,
    ButtonBuilder,
    ButtonStyle,
    ActionRowBuilder,
  } = require("discord.js");
  const config = require("../../config.js");
  const logger = require("../../utils/logger.js");
  
  module.exports = {
    data: new SlashCommandBuilder()
      .setName("cleardm")
      .setDescription("Clears bot messages from your DMs")
      .addIntegerOption(option => 
        option.setName("amount")
          .setDescription("Number of messages to delete")
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(100)),
    name: "cleardm",
    description: "Clears bot messages from your DMs",
    prefix: true,
    
    // Slash command handler
    async execute(interaction) {
      // Check if user is developer
      if (interaction.user.id !== config.developerId) {
        return await interaction.reply({
          content: "You don't have permission to use this command.",
          flags: MessageFlags.Ephemeral,
        });
      }
  
      const amount = interaction.options.getInteger("amount");
      
      await interaction.deferReply({ flags: MessageFlags.Ephemeral, });
      
      try {
        // Get DM channel with the developer
        const dmChannel = await interaction.user.createDM();
        
        // Fetch the messages from the channel
        const messages = await dmChannel.messages.fetch({ limit: amount });
        
        // Filter for bot messages only
        const botMessages = messages.filter(m => m.author.id === interaction.client.user.id);
        
        if (botMessages.size === 0) {
          return await interaction.editReply("No bot messages found to delete.");
        }
        
        // Create confirmation button
        const confirmButton = new ButtonBuilder()
          .setCustomId('confirm_delete_dm')
          .setLabel(`Delete ${botMessages.size} messages`)
          .setStyle(ButtonStyle.Danger);
        
        const cancelButton = new ButtonBuilder()
          .setCustomId('cancel_delete_dm')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary);
        
        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
        
        // Send confirmation message
        const reply = await interaction.editReply({
          content: `Are you sure you want to delete ${botMessages.size} messages from your DMs?`,
          components: [row]
        });
        
        // Create collector for button interaction
        const filter = i => i.user.id === interaction.user.id;
        const collector = reply.createMessageComponentCollector({ filter, time: 30000 });
        
        collector.on('collect', async i => {
          if (i.customId === 'confirm_delete_dm') {
            await i.update({ content: 'Deleting messages...', components: [] });
            
            let deleted = 0;
            
            // Delete messages one by one
            for (const message of botMessages.values()) {
              try {
                await message.delete();
                deleted++;
              } catch (error) {
                logger.error(`Failed to delete message ${message.id}:`, error);
              }
            }
            
            await i.editReply(`Successfully deleted ${deleted} messages.`);
          } else {
            await i.update({ content: 'Operation cancelled.', components: [] });
          }
        });
        
        collector.on('end', async collected => {
          if (collected.size === 0) {
            await interaction.editReply({
              content: 'Confirmation timed out.',
              components: []
            });
          }
        });
        
      } catch (error) {
        logger.error('Error executing clearDM command:', error);
        await interaction.editReply('An error occurred while trying to clear DMs.');
      }
    },
    
    // Prefix command handler
    async run(message, args, client) {
      // Check if user is developer
      if (message.author.id !== config.developerId) {
        return message.reply("You don't have permission to use this command.");
      }
      
      if (!args[0] || isNaN(args[0])) {
        return message.reply("Please specify a valid number of messages to delete.");
      }
      
      const amount = parseInt(args[0]);
      if (amount < 1 || amount > 100) {
        return message.reply("Please provide a number between 1 and 100.");
      }
      
      try {
        // Get DM channel with the developer
        const dmChannel = await message.author.createDM();
        
        // Fetch the messages from the channel
        const messages = await dmChannel.messages.fetch({ limit: amount });
        
        // Filter for bot messages only
        const botMessages = messages.filter(m => m.author.id === client.user.id);
        
        if (botMessages.size === 0) {
          return message.reply("No bot messages found to delete.");
        }
        
        // Create confirmation button
        const confirmButton = new ButtonBuilder()
          .setCustomId('confirm_delete_dm')
          .setLabel(`Delete ${botMessages.size} messages`)
          .setStyle(ButtonStyle.Danger);
        
        const cancelButton = new ButtonBuilder()
          .setCustomId('cancel_delete_dm')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary);
        
        const row = new ActionRowBuilder().addComponents(confirmButton, cancelButton);
        
        // Send confirmation message
        const reply = await message.reply({
          content: `Are you sure you want to delete ${botMessages.size} messages from your DMs?`,
          components: [row]
        });
        
        // Create collector for button interaction
        const filter = i => i.user.id === message.author.id;
        const collector = reply.createMessageComponentCollector({ filter, time: 30000 });
        
        collector.on('collect', async i => {
          if (i.customId === 'confirm_delete_dm') {
            await i.update({ content: 'Deleting messages...', components: [] });
            
            let deleted = 0;
            
            // Delete messages one by one
            for (const message of botMessages.values()) {
              try {
                await message.delete();
                deleted++;
              } catch (error) {
                logger.error(`Failed to delete message ${message.id}:`, error);
              }
            }
            
            await i.editReply(`Successfully deleted ${deleted} messages.`);
          } else {
            await i.update({ content: 'Operation cancelled.', components: [] });
          }
        });
        
        collector.on('end', async collected => {
          if (collected.size === 0) {
            await reply.edit({
              content: 'Confirmation timed out.',
              components: []
            });
          }
        });
        
      } catch (error) {
        logger.error('Error executing clearDM command:', error);
        message.reply('An error occurred while trying to clear DMs.');
      }
    }
  };