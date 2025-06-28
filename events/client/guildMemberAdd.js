const config = require("../../config.js");
const logger = require("../../utils/logger.js");
const VanityUrl = require("../../schema/vanityUrl.js");

module.exports = {
  name: "guildMemberAdd",
  async execute(member, client) {
    if (!member.guild) return;

    const guildSettings = config.guilds?.[member.guild.id] || {};
    if (!guildSettings.vanityTracking?.enabled) return;

    try {
      const guildTerms = await VanityUrl.find({
        guildId: member.guild.id,
        isActive: true,
      });

      if (guildTerms.length === 0) return;
      
      setTimeout(async () => {
        // Fetch the member again to get updated presence
        const updatedMember = await member.guild.members
          .fetch(member.id)
          .catch(() => null);
        if (!updatedMember || !updatedMember.presence) return;

        const activities = updatedMember.presence.activities || [];
        const userStatus = activities
          .filter((activity) => activity.type === 4) // Custom Status
          .map((activity) => activity.state || "")
          .join(" ");

        const allUserText =
          activities
            .map((activity) => {
              return [
                activity.state || "",
                activity.details || "",
                activity.name || "",
              ].join(" ");
            })
            .join(" ") +
          " " +
          userStatus;

        const allUserTextLower = allUserText.toLowerCase();

        const roleTerms = new Map();
        for (const term of guildTerms) {
          if (!roleTerms.has(term.roleId)) {
            roleTerms.set(term.roleId, []);
          }
          roleTerms.get(term.roleId).push(term);
        }

        // Check each role's terms
        for (const [roleId, terms] of roleTerms.entries()) {
          const hasMatchForRole = terms.some((term) =>
            allUserTextLower.includes(term.term.toLowerCase())
          );

          if (hasMatchForRole) {
            await updatedMember.roles.add(
              roleId,
              "Matched term in status on join"
            );
            logger.info(
              `Added role ${roleId} to ${updatedMember.user.tag} on join`
            );

            // Update active users for matched terms
            for (const term of terms) {
              if (allUserTextLower.includes(term.term.toLowerCase())) {
                await VanityUrl.updateOne(
                  { _id: term._id },
                  {
                    $addToSet: {
                      activeUsers: {
                        userId: member.id,
                        lastSeen: new Date(),
                      },
                    },
                  }
                );
              }
            }
          }
        }
      }, 5000);
    } catch (error) {
      logger.error(`Error in guildMemberAdd vanity check: ${error}`);
    }
  },
};
