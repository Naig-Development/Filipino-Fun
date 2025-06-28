const dotenv = require("dotenv");

dotenv.config();

module.exports = {
  token: process.env.BOT_TOKEN,
  prefix: process.env.PREFIX,
  mongoURI: process.env.MONGO_URI,
  clientId: process.env.CLIENT_ID,
  guildId: process.env.GUILD_ID,
  port: process.env.PORT,
  developerId: process.env.DEVELOPER_ID,
  bannerUrl: process.env.BANNER_URL,
  embedLine: "https://media.discordapp.net/attachments/963577707990503484/1316169106390515742/ezgif-1-a232e3d324.gif?ex=683ecdc0&is=683d7c40&hm=400648bc87a170e0af614a4ee5145d0cfc208614d83426051e6b312ab02b83f0&",
  embedColors: {
    main: "#e4d8c4",
    green: "#83D986",
    red: "#D98383",
    blue: "#6a87de",
    yellow: "#D9CE83",
    gold: "#FFD700", // Add gold color for starboard embeds if not already present
  },
  tambayVcId: "1235126844882161744",
  // Starboard Configuration
  starboardChannelId: "1379538128330817577",
  starThreshold: 7,   
  starboardEmojis: "⭐",
  countAllCustomEmojis: false,
  // Guild Configuration
  GuildOwnerRoleId: "1345836421008593008",
  GuildAdminRoleId: "1381355306218688633",
  ServerBoosterRoleId: "934144247681122334",
  DonorRoleId: "1312195448110579714",
  // AFK Voice channel Configuration
  afkChannelId: "1361371710984687776",
  // Vanity URL Tracking Configuration
  guilds: {
    "934111484345196614": {
      vanityTracking: {
        enabled: true,
        logChannelId: "1381294372464623637", 
      },
    }
  },
  // Instagram scraping configuration
  instagram: {
    apifyToken: process.env.APIFY_TOKEN,
    // Rate limiting configuration
    rateLimit: {
      maxRequestsPerUser: 3,
      windowMs: 5 * 60 * 1000, // 5 minutes
    }
  },
};
