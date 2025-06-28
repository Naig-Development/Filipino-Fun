const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const axios = require('axios');
const config = require('../../config.js');

// Try to import multiple Instagram modules with fallbacks
let instaFetcher, instagramPrivateApi, socialMediaScraper, instagramWebApi, igScraper;

try {
  instaFetcher = require('insta-fetcher');
} catch (error) {
  console.log('insta-fetcher not installed');
}

try {
  instagramPrivateApi = require('instagram-private-api');
} catch (error) {
  console.log('instagram-private-api not installed');
}

try {
  socialMediaScraper = require('social-media-scraper');
} catch (error) {
  console.log('social-media-scraper not installed');
}

try {
  instagramWebApi = require('instagram-web-api');
} catch (error) {
  console.log('instagram-web-api not installed');
}

try {
  igScraper = require('ig-scraper');
} catch (error) {
  console.log('ig-scraper not installed');
} 

// Helper function to generate random IP for X-Forwarded-For header
function generateRandomIP() {
  return `${Math.floor(Math.random() * 255) + 1}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;
}

// Helper function to get axios config with optional proxy
function getAxiosConfig(baseConfig = {}) {
  const axiosConfig = { ...baseConfig };
  
  // Add proxy configuration if enabled
  if (config.instagram?.proxy?.enabled && config.instagram.proxy.host) {
    axiosConfig.proxy = {
      host: config.instagram.proxy.host,
      port: parseInt(config.instagram.proxy.port) || 8080,
    };
    
    // Add authentication if provided
    if (config.instagram.proxy.auth?.username) {
      axiosConfig.proxy.auth = {
        username: config.instagram.proxy.auth.username,
        password: config.instagram.proxy.auth.password || ''
      };
    }
    
    console.log('Using proxy for Instagram request:', `${axiosConfig.proxy.host}:${axiosConfig.proxy.port}`);
  }
  
  return axiosConfig;
}

// Rate limiting map to track requests per username
const rateLimitMap = new Map();
const RATE_LIMIT_DURATION = config.instagram?.rateLimit?.windowMs || 5 * 60 * 1000; // 5 minutes
const MAX_REQUESTS_PER_USERNAME = config.instagram?.rateLimit?.maxRequestsPerUser || 3;

function isRateLimited(username) {
  const now = Date.now();
  const userRequests = rateLimitMap.get(username) || [];
  
  // Remove old requests
  const recentRequests = userRequests.filter(time => now - time < RATE_LIMIT_DURATION);
  rateLimitMap.set(username, recentRequests);
  
  return recentRequests.length >= MAX_REQUESTS_PER_USERNAME;
}

function addToRateLimit(username) {
  const now = Date.now();
  const userRequests = rateLimitMap.get(username) || [];
  userRequests.push(now);
  rateLimitMap.set(username, userRequests);
} 

// Updated helper function to show which data source was used
function getDataSourceText(userData) {
  if (userData.source) {
    return `Instagram Profile Info • ${userData.source}`;
  } else if (userData.isPrivateApi) {
    return 'Instagram Profile Info';
  } else if (userData.isSocialScraper) {
    return 'Instagram Profile Info';
  } else if (userData.isMultiAPI) {
    return 'Instagram Profile Info';
  } else if (userData.isWebScraping) {
    return 'Instagram Profile Info';
  } else if (userData.isThirdPartyAPI) {
    return 'Instagram Profile Info';
  } else if (userData.isSearchResult) {
    return 'Instagram Profile Inf';
  } else {
    return 'Instagram Profile Info';
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('instagram')
    .setDescription('Get Instagram user information')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Instagram username to lookup')
        .setRequired(true)
    ),
  name: 'instagram',
  description: 'Get Instagram user information',
  aliases: ['ig'],
  prefix: true, // Enable prefix command support
  
  // Slash command execution
  async execute(interaction) {
    const username = interaction.options.getString('username');
    await handleInstagramLookup(interaction, username, true);
  },
  
  // Prefix command execution
  async run(message, args) {
    if (!args || args.length === 0) {
      return message.reply('Please provide an Instagram username. Usage: `instagram <username>` or `ig <username>`');
    }
    
    const username = args[0];
    await handleInstagramLookup(message, username, false);
  }
};

// Shared logic for both slash and prefix commands
async function handleInstagramLookup(context, username, isSlashCommand) {
  // Remove @ symbol if present and clean username
  username = username.replace('@', '').trim().toLowerCase();
  
  // Validate username format
  if (!/^[a-zA-Z0-9._]+$/.test(username)) {
    const errorMsg = '> `⚠️` Invalid username format. Instagram usernames can only contain letters, numbers, periods, and underscores.';
    return isSlashCommand ? context.reply(errorMsg) : context.reply(errorMsg);
  }
  
  // Check rate limiting
  if (isRateLimited(username)) {
    const errorMsg = '> `⏰` This username has been searched too many times recently. Please wait 5 minutes before trying again.';
    return isSlashCommand ? context.reply(errorMsg) : context.reply(errorMsg);
  }
  
  // Add to rate limit tracker
  addToRateLimit(username);
  
  // Defer reply for both slash and prefix commands
  if (isSlashCommand) {
    await context.deferReply();
  } else {
    // For prefix commands, send a loading message
    const loadingMsg = await context.reply('`🔍` Looking up Instagram profile...');
    context.loadingMessage = loadingMsg;
  }
  
  try {
    // Method 1: Try insta-fetcher module
    let userData = await tryInstaFetcher(username);
    
    // Method 2: Try instagram-private-api module
    if (!userData) {
      userData = await tryInstagramPrivateApi(username);
    }
    
    // Method 3: Try social-media-scraper module
    if (!userData) {
      userData = await trySocialMediaScraper(username);
    }
    
    // Method 4: Try instagram-web-api module
    if (!userData) {
      userData = await tryInstagramWebApi(username);
    }
    
    // Method 5: Try ig-scraper module
    if (!userData) {
      userData = await tryIgScraper(username);
    }
    
    // Method 6: Try multiple Instagram endpoints (custom)
    if (!userData) {
      userData = await tryMultipleInstagramAPIs(username);
    }
    
    // Method 7: Enhanced web scraping
    if (!userData) {
      userData = await tryEnhancedWebScraping(username);
    }
    
    // Method 8: Apify as premium backup
    if (!userData && config.instagram?.apifyToken) {
      userData = await tryApifyAPI(username);
    }
    
    // If still no data, show basic profile
    if (!userData) {
      return await createBasicProfile(context, username, isSlashCommand);
    }

    // Create embed with extracted data
    const embed = new EmbedBuilder()
      .setTitle(`${userData.fullName || userData.username} (@${userData.username})`)
      .setURL(`https://www.instagram.com/${userData.username}/`)
      .setColor('#E1306C')
      .setDescription(userData.biography || '*No bio available*')
      .setFooter({ 
        text: getDataSourceText(userData), 
        iconURL: 'https://cdn.discordapp.com/emojis/1364322541132320768.webp?size=128' 
      });

    // Add thumbnail if available
    if (userData.profilePicUrl) {
      embed.setThumbnail(userData.profilePicUrl);
    }

    // Add search result notice if found via search
    if (userData.isSearchResult && userData.username.toLowerCase() !== username.toLowerCase()) {
      embed.addFields({ 
        name: '`🔍` Search Result', 
        value: `Searched for **${username}** but found **${userData.username}**`, 
        inline: false 
      });
    }
    if (userData.followerCount !== undefined) {
      embed.addFields(
        { name: '`👥` Followers', value: userData.followerCount.toLocaleString(), inline: true },
        { name: '`📈` Following', value: userData.followingCount.toLocaleString(), inline: true },
        { name: '`📸` Posts', value: userData.mediaCount.toLocaleString(), inline: true }
      );
    }

    // Add privacy and verification status if available
    if (userData.isPrivate !== undefined) {
      embed.addFields({ name: '`🔒` Private?', value: userData.isPrivate ? 'Yes' : 'No', inline: true });
    }
    
    if (userData.isVerified !== undefined) {
      embed.addFields({ name: '<:instagramVerified:1386064305287462953> Verified?', value: userData.isVerified ? 'Yes' : 'No', inline: true });
    }

    // Truncate description if too long
    if (userData.biography && userData.biography.length > 200) {
      embed.setDescription(userData.biography.substring(0, 200) + '...');
    }
    
    const button = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('View Profile')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://www.instagram.com/${userData.username}/`)
          .setEmoji('1386076329132298291')
      );

    // Send response based on command type
    if (isSlashCommand) {
      await context.editReply({ embeds: [embed], components: [button] });
    } else {
      await context.loadingMessage.edit({ content: '', embeds: [embed], components: [button] });
    }

  } catch (error) {
    console.error('Instagram lookup error:', error.message);
    
    // Determine if this is likely a server-hosting issue
    const isServerIssue = error.message.includes('401') || 
                         error.message.includes('429') || 
                         error.message.includes('Rate limited') ||
                         error.message.includes('Access denied');
    
    const errorEmbed = new EmbedBuilder()
      .setTitle('`⚠️` Instagram Profile Lookup Failed')
      .setDescription(`Could not fetch data for **@${username}**`)
      .setColor('#ff6b6b')
      .setFooter({ text: 'Instagram scraping is limited due to platform restrictions' });

    if (isServerIssue) {
      errorEmbed.addFields(
        { 
          name: '`🚫` Server Restrictions Detected', 
          value: 'Instagram is actively blocking requests from this server location.\nThis commonly happens with hosted bots due to:\n• IP-based rate limiting\n• Geographic restrictions\n• Data center detection' 
        },
        { 
          name: '`💡` Possible Solutions:', 
          value: '• Use a VPN or proxy service\n• Switch to a different hosting provider\n• Implement request rotation\n• Consider using official Instagram API' 
        },
        { 
          name: '`🔄` Temporary Fix:', 
          value: 'Try again in 10-15 minutes or use the link below to view manually.' 
        }
      );
    } else {
      errorEmbed.addFields(
        { name: 'Possible Reasons:', value: '• Profile is private\n• Username doesn\'t exist\n• Instagram is blocking requests\n• Rate limit reached' },
        { name: 'Suggestion:', value: 'Try again in a few minutes or verify the username is correct.' }
      );
    }

    const button = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setLabel('View Profile')
          .setStyle(ButtonStyle.Link)
          .setURL(`https://www.instagram.com/${username}/`)
          .setEmoji('1386076329132298291')
      );
    
    // Send error response based on command type
    if (isSlashCommand) {
      await context.editReply({ embeds: [errorEmbed], components: [button] });
    } else {
      await context.loadingMessage.edit({ content: '', embeds: [errorEmbed], components: [button] });
    }
  }
}

// Method 1: Try insta-fetcher module
async function tryInstaFetcher(username) {
  if (!instaFetcher) {
    console.log('insta-fetcher module not available, skipping...');
    return null;
  }

  try {
    console.log(`Trying insta-fetcher for ${username}...`);
    
    // Method 1a: Try fetchProfile
    try {
      const userInfo = await instaFetcher.fetchProfile(username);
      if (userInfo && userInfo.username) {
        console.log(`✅ insta-fetcher.fetchProfile succeeded for ${username}`);
        return formatUserData(userInfo, 'Insta-Fetcher Module');
      }
    } catch (error) {
      console.log(`insta-fetcher.fetchProfile failed: ${error.message}`);
    }
    
    // Method 1b: Try igApi
    try {
      const { igApi } = instaFetcher;
      const userInfo = await igApi(username);
      if (userInfo && userInfo.username) {
        console.log(`✅ insta-fetcher.igApi succeeded for ${username}`);
        return formatUserData(userInfo, 'Insta-Fetcher API');
      }
    } catch (error) {
      console.log(`insta-fetcher.igApi failed: ${error.message}`);
    }
    
  } catch (error) {
    console.log(`❌ insta-fetcher completely failed: ${error.message}`);
  }
  
  return null;
}

// Method 2: Try instagram-private-api module
async function tryInstagramPrivateApi(username) {
  if (!instagramPrivateApi) {
    console.log('instagram-private-api module not available, skipping...');
    return null;
  }

  try {
    console.log(`Trying instagram-private-api for ${username}...`);
    
    const ig = new instagramPrivateApi.IgApiClient();
    ig.state.generateDevice(username);
    
    // Try to get user info without login (public data only)
    const userInfo = await ig.user.searchExact(username);
    
    if (userInfo) {
      console.log(`✅ instagram-private-api succeeded for ${username}`);
      return {
        username: userInfo.username,
        fullName: userInfo.full_name || userInfo.username,
        biography: userInfo.biography || null,
        profilePicUrl: userInfo.profile_pic_url || userInfo.hd_profile_pic_url_info?.url || null,
        followerCount: userInfo.follower_count || 0,
        followingCount: userInfo.following_count || 0,
        mediaCount: userInfo.media_count || 0,
        isPrivate: userInfo.is_private || false,
        isVerified: userInfo.is_verified || false,
        isPrivateApi: true
      };
    }
  } catch (error) {
    console.log(`❌ instagram-private-api failed: ${error.message}`);
  }
  
  return null;
}

// Method 3: Try social-media-scraper module
async function trySocialMediaScraper(username) {
  if (!socialMediaScraper) {
    console.log('social-media-scraper module not available, skipping...');
    return null;
  }

  try {
    console.log(`Trying social-media-scraper for ${username}...`);
    
    // Try different methods from the module
    const methods = [
      () => socialMediaScraper.instagram.getProfile(username),
      () => socialMediaScraper.getInstagramProfile(username),
      () => socialMediaScraper(username, 'instagram')
    ];
    
    for (let i = 0; i < methods.length; i++) {
      try {
        const userInfo = await methods[i]();
        if (userInfo && (userInfo.username || userInfo.handle)) {
          console.log(`✅ social-media-scraper method ${i + 1} succeeded for ${username}`);
          return {
            username: userInfo.username || userInfo.handle || username,
            fullName: userInfo.fullName || userInfo.full_name || userInfo.name || userInfo.username,
            biography: userInfo.biography || userInfo.bio || userInfo.description || null,
            profilePicUrl: userInfo.profilePicUrl || userInfo.profile_pic_url || userInfo.avatar || null,
            followerCount: userInfo.followers || userInfo.followersCount || userInfo.follower_count || 0,
            followingCount: userInfo.following || userInfo.followingCount || userInfo.following_count || 0,
            mediaCount: userInfo.posts || userInfo.postsCount || userInfo.media_count || 0,
            isPrivate: userInfo.isPrivate || userInfo.is_private || false,
            isVerified: userInfo.isVerified || userInfo.is_verified || false,
            isSocialScraper: true
          };
        }
      } catch (methodError) {
        console.log(`social-media-scraper method ${i + 1} failed: ${methodError.message}`);
        continue;
      }
    }
  } catch (error) {
    console.log(`❌ social-media-scraper completely failed: ${error.message}`);
  }
  
  return null;
}

// Method 4: Try instagram-web-api module
async function tryInstagramWebApi(username) {
  if (!instagramWebApi) {
    console.log('instagram-web-api module not available, skipping...');
    return null;
  }

  try {
    console.log(`Trying instagram-web-api for ${username}...`);
    
    const client = new instagramWebApi();
    
    // Try different methods
    const methods = [
      () => client.getUser(username),
      () => client.getUserByUsername(username),
      () => client.searchUsers(username)
    ];
    
    for (let i = 0; i < methods.length; i++) {
      try {
        const userInfo = await methods[i]();
        
        // Handle different response formats
        let user = userInfo;
        if (userInfo && userInfo.users && userInfo.users.length > 0) {
          user = userInfo.users.find(u => u.username.toLowerCase() === username.toLowerCase());
        }
        
        if (user && user.username) {
          console.log(`✅ instagram-web-api method ${i + 1} succeeded for ${username}`);
          return formatUserData(user, 'Instagram Web API');
        }
      } catch (methodError) {
        console.log(`instagram-web-api method ${i + 1} failed: ${methodError.message}`);
        continue;
      }
    }
  } catch (error) {
    console.log(`❌ instagram-web-api completely failed: ${error.message}`);
  }
  
  return null;
}

// Method 5: Try ig-scraper module
async function tryIgScraper(username) {
  if (!igScraper) {
    console.log('ig-scraper module not available, skipping...');
    return null;
  }

  try {
    console.log(`Trying ig-scraper for ${username}...`);
    
    const userInfo = await igScraper.getProfile(username);
    
    if (userInfo && userInfo.username) {
      console.log(`✅ ig-scraper succeeded for ${username}`);
      return formatUserData(userInfo, 'IG-Scraper Module');
    }
  } catch (error) {
    console.log(`❌ ig-scraper failed: ${error.message}`);
  }
  
  return null;
}

// Method 6: Try multiple Instagram endpoints (most reliable)
async function tryMultipleInstagramAPIs(username) {
  const endpoints = [
    {
      url: `https://www.instagram.com/${username}/?__a=1`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'X-Requested-With': 'XMLHttpRequest'
      }
    },
    {
      url: `https://i.instagram.com/api/v1/users/web_profile_info/?username=${username}`,
      headers: {
        'User-Agent': 'Instagram 219.0.0.12.117 Android',
        'Accept': 'application/json',
        'X-IG-App-ID': '936619743392459'
      }
    },
    {
      url: `https://www.instagram.com/web/search/topsearch/?query=${username}`,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest'
      }
    }
  ];

  for (let i = 0; i < endpoints.length; i++) {
    try {
      console.log(`Trying Instagram API method ${i + 1} for ${username}...`);
      
      const response = await axios.get(endpoints[i].url, {
        headers: endpoints[i].headers,
        timeout: 10000,
        validateStatus: (status) => status < 500
      });

      if (response.data) {
        let user = null;
        
        // Parse different response formats
        if (response.data.graphql?.user) {
          user = response.data.graphql.user;
        } else if (response.data.data?.user) {
          user = response.data.data.user;
        } else if (response.data.users?.length > 0) {
          user = response.data.users.find(u => 
            u.user.username.toLowerCase() === username.toLowerCase()
          )?.user;
        }
        
        if (user && user.username) {
          console.log(`✅ Instagram API method ${i + 1} succeeded for ${username}`);
          return {
            username: user.username,
            fullName: user.full_name || user.name || user.username,
            biography: user.biography || user.bio || null,
            profilePicUrl: user.profile_pic_url_hd || user.profile_pic_url || null,
            followerCount: user.edge_followed_by?.count || user.followers_count || user.follower_count || 0,
            followingCount: user.edge_follow?.count || user.following_count || 0,
            mediaCount: user.edge_owner_to_timeline_media?.count || user.media_count || 0,
            isPrivate: user.is_private || false,
            isVerified: user.is_verified || false,
            isMultiAPI: true
          };
        }
      }
    } catch (error) {
      console.log(`❌ Instagram API method ${i + 1} failed: ${error.message}`);
      continue;
    }
  }
  
  return null;
}

// Method 7: Enhanced web scraping with multiple user agents
async function tryEnhancedWebScraping(username) {
  const userAgents = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Android 13; Mobile; rv:109.0) Gecko/109.0 Firefox/121.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];

  for (let i = 0; i < userAgents.length; i++) {
    try {
      console.log(`Trying web scraping method ${i + 1} for ${username}...`);
      
      const response = await axios.get(`https://www.instagram.com/${username}/`, {
        headers: {
          'User-Agent': userAgents[i],
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        timeout: 12000,
        validateStatus: (status) => status < 500
      });

      if (response.status === 200 && response.data) {
        const html = response.data;
        
        // Try to extract JSON-LD structured data
        const jsonLdMatch = html.match(/<script type="application\/ld\+json"[^>]*>(.*?)<\/script>/s);
        if (jsonLdMatch) {
          try {
            const jsonData = JSON.parse(jsonLdMatch[1]);
            if (jsonData['@type'] === 'Person' && jsonData.alternateName) {
              console.log(`✅ Web scraping method ${i + 1} succeeded for ${username}`);
              return {
                username: jsonData.alternateName.replace('@', ''),
                fullName: jsonData.name,
                biography: jsonData.description || null,
                profilePicUrl: jsonData.image || null,
                isWebScraping: true
              };
            }
          } catch (e) {
            // Continue to meta tags extraction
          }
        }

        // Fallback to meta tags
        const titleMatch = html.match(/<title>([^<]+)<\/title>/);
        const descMatch = html.match(/<meta name="description" content="([^"]+)"/);
        const imageMatch = html.match(/<meta property="og:image" content="([^"]+)"/);
        
        if (titleMatch) {
          const title = titleMatch[1];
          const nameMatch = title.match(/^(.+?)\s*\(@([^)]+)\)/);
          
          if (nameMatch) {
            console.log(`✅ Web scraping method ${i + 1} (meta) succeeded for ${username}`);
            return {
              username: nameMatch[2],
              fullName: nameMatch[1].trim(),
              biography: descMatch ? descMatch[1] : null,
              profilePicUrl: imageMatch ? imageMatch[1] : null,
              isWebScraping: true
            };
          }
        }
      }
    } catch (error) {
      console.log(`❌ Web scraping method ${i + 1} failed: ${error.message}`);
      continue;
    }
  }
  
  return null;
}

// Method 8: Apify Instagram scraper (premium backup)
async function tryApifyAPI(username) {
  try {
    if (!config.instagram?.apifyToken) {
      console.log('Apify token not configured, skipping...');
      return null;
    }

    console.log(`Trying Apify API for ${username}...`);

    const runResponse = await axios.post(
      `https://api.apify.com/v2/acts/apify~instagram-profile-scraper/run-sync?token=${config.instagram.apifyToken}`,
      {
        usernames: [username],
        resultsType: "details"
      },
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    if (runResponse.data && runResponse.data.length > 0) {
      const user = runResponse.data[0];
      console.log(`✅ Apify API succeeded for ${username}`);
      return {
        username: user.username,
        fullName: user.fullName,
        biography: user.biography,
        profilePicUrl: user.profilePicUrl,
        followerCount: user.followersCount || 0,
        followingCount: user.followsCount || 0,
        mediaCount: user.postsCount || 0,
        isPrivate: user.private || false,
        isVerified: user.verified || false,
        isThirdPartyAPI: true
      };
    }
  } catch (error) {
    console.log(`❌ Apify API failed: ${error.message}`);
  }
  
  return null;
}

// Create a basic profile when no data can be retrieved
async function createBasicProfile(context, username, isSlashCommand) {
  const embed = new EmbedBuilder()
    .setTitle(`@${username}`)
    .setURL(`https://www.instagram.com/${username}/`)
    .setColor('#E1306C')
    .setDescription('*Profile data unavailable - click the button below to view directly on Instagram*')
    .addFields({ 
      name: '`ℹ️` Notice', 
      value: 'Unable to fetch profile data due to Instagram restrictions, but the profile may still be accessible via the link below.', 
      inline: false 
    })
    .setFooter({ 
      text: 'Instagram Profile • Direct Link Only', 
      iconURL: 'https://cdn.discordapp.com/emojis/1364322541132320768.webp?size=128' 
    });

  const button = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setLabel('View Profile')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://www.instagram.com/${username}/`)
        .setEmoji('1386076329132298291')
    );

  // Send response based on command type
  if (isSlashCommand) {
    await context.editReply({ embeds: [embed], components: [button] });
  } else {
    await context.loadingMessage.edit({ content: '', embeds: [embed], components: [button] });
  }
}

// Helper function to format user data consistently
function formatUserData(userInfo, source) {
  return {
    username: userInfo.username || userInfo.handle,
    fullName: userInfo.fullName || userInfo.full_name || userInfo.name || userInfo.username,
    biography: userInfo.biography || userInfo.bio || userInfo.description || null,
    profilePicUrl: userInfo.profilePicUrl || userInfo.profile_pic_url_hd || userInfo.profile_pic_url || userInfo.avatar || null,
    followerCount: userInfo.followers || userInfo.followersCount || userInfo.follower_count || userInfo.edge_followed_by?.count || 0,
    followingCount: userInfo.following || userInfo.followingCount || userInfo.following_count || userInfo.edge_follow?.count || 0,
    mediaCount: userInfo.posts || userInfo.postsCount || userInfo.media_count || userInfo.edge_owner_to_timeline_media?.count || 0,
    isPrivate: userInfo.isPrivate || userInfo.is_private || userInfo.private || false,
    isVerified: userInfo.isVerified || userInfo.is_verified || userInfo.verified || false,
    source: source
  };
}