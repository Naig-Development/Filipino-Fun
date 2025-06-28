const { SlashCommandBuilder, MessageFlags } = require("discord.js");
const { sendLiveLeaderboard } = require("../../utils/liveLeaderboard.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("update-leaderboard")
    .setDescription("Manually update the live leaderboard (Admin only)"),

  async execute(interaction) {
    // Check if user has admin permissions or is the developer
    const isDeveloper = interaction.user.id === process.env.DEVELOPER_ID;
    const hasAdminPerms = interaction.member.permissions.has("Administrator");
    
    if (!isDeveloper && !hasAdminPerms) {
      return interaction.reply({
        content: "\`❌\` You need Administrator permissions to use this command!",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephermeral });

    try {
      await sendLiveLeaderboard(interaction.client);
      
      await interaction.editReply({
        content: "`\`✅\`` Live leaderboard has been updated successfully!",
      });
      
    } catch (error) {
      console.error("Error updating leaderboard:", error);
      
      await interaction.editReply({
        content: "\`❌\` Failed to update the live leaderboard. Check console for details.",
      });
    }
  },
};