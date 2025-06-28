const config = require("../../config.js");
const logger = require("../../utils/logger.js");
const { EmbedBuilder } = require("discord.js");
const VanityUrl = require("../../schema/vanityUrl.js");

module.exports = {
  name: "presenceUpdate",
  async execute(oldPresence, newPresence, client) {
    if (!newPresence || !newPresence.guild) return;
    
    const guildSettings = config.guilds?.[newPresence.guild.id] || {};
    if (!guildSettings.vanityTracking?.enabled) return;

    try {
      // Get all active terms for this guild
      const guildTerms = await VanityUrl.find({ 
        guildId: newPresence.guild.id, 
        isActive: true
      });
      
      if (guildTerms.length === 0) return;
      
      const member = await newPresence.guild.members.fetch(newPresence.user.id).catch(() => null);
      if (!member || member.user.bot) return;

      // Get all text from user's presence
      const activities = newPresence.activities || [];
      const userStatus = activities
        .filter(activity => activity.type === 4) // Custom Status
        .map(activity => activity.state || "")
        .join(" ");

      // Also check streaming status and presence details
      const allUserText = activities
        .map(activity => {
          return [
            activity.state || "",
            activity.details || "",
            activity.name || ""
          ].join(" ");
        })
        .join(" ") + " " + userStatus;
        
      const allUserTextLower = allUserText.toLowerCase();

      // Group terms by role for efficient role handling
      const roleTerms = new Map(); // Maps roleId -> array of terms
      
      for (const term of guildTerms) {
        if (!roleTerms.has(term.roleId)) {
          roleTerms.set(term.roleId, []);
        }
        roleTerms.get(term.roleId).push(term);
      }
      
      // Check each role's terms for matches
      for (const [roleId, terms] of roleTerms.entries()) {
        const hasMatchForRole = terms.some(term => 
          allUserTextLower.includes(term.term.toLowerCase())
        );
        
        if (hasMatchForRole) {
          // User has a match for this role, add if they don't have it
          if (!member.roles.cache.has(roleId)) {
            await member.roles.add(roleId, "Added matched term to status");
            logger.info(`Added role ${roleId} to ${member.user.tag} in ${newPresence.guild.name}`);
            
            // Send notification if enabled
            if (guildSettings.vanityTracking?.logChannelId) {
              const logChannel = await newPresence.guild.channels.fetch(guildSettings.vanityTracking.logChannelId).catch(() => null);
              if (logChannel) {
                const roleName = newPresence.guild.roles.cache.get(roleId)?.name || "Unknown role";
                const embed = new EmbedBuilder()
                  .setTitle("\`\`✅\`\` Tracked Role Added")
                  .setDescription(`${member.user.tag} added a tracked term to their status`)
                  .addFields(
                    { name: "User", value: `<@${member.id}>`, inline: true },
                    { name: "Role", value: `${roleName} (<@&${roleId}>)`, inline: true }
                  )
                  .setColor(config.embedColors.main)
                  .setTimestamp();
                logChannel.send({ embeds: [embed] }).catch(err => logger.error(`Failed to send vanity log: ${err}`));
              }
            }
          }
          
          // Update the terms' active users
          for (const term of terms) {
            if (allUserTextLower.includes(term.term.toLowerCase())) {
              await VanityUrl.updateOne(
                { _id: term._id },
                { 
                  $addToSet: { 
                    activeUsers: {
                      userId: member.id,
                      lastSeen: new Date()
                    } 
                  }
                }
              );
            }
          }
        } else {
          // User doesn't have any terms for this role in their status
          // Only remove the role if they have it
          if (member.roles.cache.has(roleId)) {
            await member.roles.remove(roleId, "Removed tracked term from status");
            logger.info(`Removed role ${roleId} from ${member.user.tag} in ${newPresence.guild.name}`);
            
            // Send notification if enabled
            if (guildSettings.vanityTracking?.logChannelId) {
              const logChannel = await newPresence.guild.channels.fetch(guildSettings.vanityTracking.logChannelId).catch(() => null);
              if (logChannel) {
                const roleName = newPresence.guild.roles.cache.get(roleId)?.name || "Unknown role";
                const embed = new EmbedBuilder()
                  .setTitle("\`❌\` Tracked Role Removed")
                  .setDescription(`${member.user.tag} removed tracked term from their status`)
                  .addFields(
                    { name: "User", value: `<@${member.id}>`, inline: true },
                    { name: "Role", value: `${roleName} (<@&${roleId}>)`, inline: true }
                  )
                  .setColor(config.embedColors.main)
                  .setTimestamp();
                logChannel.send({ embeds: [embed] }).catch(err => logger.error(`Failed to send vanity log: ${err}`));
              }
            }
            
            // Update the terms' active users list
            for (const term of terms) {
              await VanityUrl.updateOne(
                { _id: term._id },
                { $pull: { activeUsers: { userId: member.id } } }
              );
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Error in vanity presence tracking: ${error}`);
    }
  },
};