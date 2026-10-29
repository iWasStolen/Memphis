/* ============================================================
   Memphis unBLACKed — app catalog
   50 real day-use apps, each opened through the Scramjet
   proxy in the built-in browser. Favicons load from Google's
   public favicon service.
   ============================================================ */

export interface AppDef {
  id: string;
  name: string;
  desc: string;
  url: string;
  /** domain used for the favicon */
  domain: string;
  tag: string;
}

export const APP_CATEGORIES = [
  "all",
  "social",
  "video",
  "music",
  "ai",
  "google",
  "utility",
  "shopping",
  "gaming",
] as const;

export const APPS: AppDef[] = [
  /* ---- social ---- */
  { id: "youtube", name: "YouTube", desc: "The world's video platform", url: "https://www.youtube.com", domain: "youtube.com", tag: "video" },
  { id: "instagram", name: "Instagram", desc: "Photos, reels and stories", url: "https://www.instagram.com", domain: "instagram.com", tag: "social" },
  { id: "tiktok", name: "TikTok", desc: "Short-form video feed", url: "https://www.tiktok.com", domain: "tiktok.com", tag: "social" },
  { id: "chatgpt", name: "ChatGPT", desc: "OpenAI's chat assistant", url: "https://chatgpt.com", domain: "chatgpt.com", tag: "ai" },
  { id: "gemini", name: "Gemini", desc: "Google's AI assistant", url: "https://gemini.google.com", domain: "gemini.google.com", tag: "ai" },
  { id: "x", name: "X (Twitter)", desc: "Posts, trends and spaces", url: "https://x.com", domain: "x.com", tag: "social" },
  { id: "facebook", name: "Facebook", desc: "The social network", url: "https://www.facebook.com", domain: "facebook.com", tag: "social" },
  { id: "snapchat", name: "Snapchat", desc: "Snaps and streaks", url: "https://web.snapchat.com", domain: "snapchat.com", tag: "social" },
  { id: "reddit", name: "Reddit", desc: "Communities for everything", url: "https://www.reddit.com", domain: "reddit.com", tag: "social" },
  { id: "whatsapp", name: "WhatsApp", desc: "Messaging in the browser", url: "https://web.whatsapp.com", domain: "web.whatsapp.com", tag: "social" },
  { id: "telegram", name: "Telegram", desc: "Fast cloud messaging", url: "https://web.telegram.org", domain: "telegram.org", tag: "social" },
  { id: "discord", name: "Discord", desc: "Chat for communities", url: "https://discord.com/app", domain: "discord.com", tag: "social" },
  { id: "pinterest", name: "Pinterest", desc: "Ideas and inspiration boards", url: "https://www.pinterest.com", domain: "pinterest.com", tag: "social" },
  { id: "linkedin", name: "LinkedIn", desc: "Professional network", url: "https://www.linkedin.com", domain: "linkedin.com", tag: "social" },

  /* ---- video ---- */
  { id: "netflix", name: "Netflix", desc: "Films and series streaming", url: "https://www.netflix.com", domain: "netflix.com", tag: "video" },
  { id: "twitch", name: "Twitch", desc: "Live streaming", url: "https://www.twitch.tv", domain: "twitch.tv", tag: "video" },
  { id: "disneyplus", name: "Disney+", desc: "Disney, Marvel, Star Wars", url: "https://www.disneyplus.com", domain: "disneyplus.com", tag: "video" },
  { id: "vimeo", name: "Vimeo", desc: "High-quality video hosting", url: "https://vimeo.com", domain: "vimeo.com", tag: "video" },

  /* ---- music ---- */
  { id: "spotify", name: "Spotify", desc: "Music and podcasts", url: "https://open.spotify.com", domain: "spotify.com", tag: "music" },
  { id: "soundcloud", name: "SoundCloud", desc: "Tracks from creators", url: "https://soundcloud.com", domain: "soundcloud.com", tag: "music" },
  { id: "ytmusic", name: "YouTube Music", desc: "Music streaming from YouTube", url: "https://music.youtube.com", domain: "music.youtube.com", tag: "music" },
  { id: "applemusic", name: "Apple Music", desc: "Apple's music catalog", url: "https://music.apple.com", domain: "music.apple.com", tag: "music" },

  /* ---- ai ---- */
  { id: "claude", name: "Claude", desc: "Anthropic's assistant", url: "https://claude.ai", domain: "claude.ai", tag: "ai" },
  { id: "perplexity", name: "Perplexity", desc: "AI search engine", url: "https://www.perplexity.ai", domain: "perplexity.ai", tag: "ai" },
  { id: "copilot", name: "Copilot", desc: "Microsoft's AI companion", url: "https://copilot.microsoft.com", domain: "copilot.microsoft.com", tag: "ai" },
  { id: "characterai", name: "Character.AI", desc: "Chat with AI characters", url: "https://character.ai", domain: "character.ai", tag: "ai" },

  /* ---- google ---- */
  { id: "gmail", name: "Gmail", desc: "Google Mail", url: "https://mail.google.com", domain: "mail.google.com", tag: "google" },
  { id: "gmaps", name: "Google Maps", desc: "Maps and directions", url: "https://www.google.com/maps", domain: "google.com", tag: "google" },
  { id: "gdrive", name: "Google Drive", desc: "Cloud storage", url: "https://drive.google.com", domain: "drive.google.com", tag: "google" },
  { id: "gdocs", name: "Google Docs", desc: "Documents in the browser", url: "https://docs.google.com", domain: "docs.google.com", tag: "google" },
  { id: "gphotos", name: "Google Photos", desc: "Photo library", url: "https://photos.google.com", domain: "photos.google.com", tag: "google" },
  { id: "gtranslate", name: "Google Translate", desc: "Translate anything", url: "https://translate.google.com", domain: "translate.google.com", tag: "google" },
  { id: "gcalendar", name: "Google Calendar", desc: "Schedule and events", url: "https://calendar.google.com", domain: "calendar.google.com", tag: "google" },

  /* ---- utility ---- */
  { id: "notion", name: "Notion", desc: "Notes, docs and wikis", url: "https://www.notion.so", domain: "notion.so", tag: "utility" },
  { id: "github", name: "GitHub", desc: "Code hosting", url: "https://github.com", domain: "github.com", tag: "utility" },
  { id: "stackoverflow", name: "Stack Overflow", desc: "Programming Q&A", url: "https://stackoverflow.com", domain: "stackoverflow.com", tag: "utility" },
  { id: "wikipedia", name: "Wikipedia", desc: "The free encyclopedia", url: "https://www.wikipedia.org", domain: "wikipedia.org", tag: "utility" },
  { id: "slack", name: "Slack", desc: "Team messaging", url: "https://app.slack.com", domain: "slack.com", tag: "utility" },
  { id: "canva", name: "Canva", desc: "Design anything", url: "https://www.canva.com", domain: "canva.com", tag: "utility" },
  { id: "zoom", name: "Zoom", desc: "Video meetings", url: "https://zoom.us", domain: "zoom.us", tag: "utility" },
  { id: "duolingo", name: "Duolingo", desc: "Learn languages free", url: "https://www.duolingo.com", domain: "duolingo.com", tag: "utility" },

  /* ---- shopping ---- */
  { id: "amazon", name: "Amazon", desc: "Shop everything", url: "https://www.amazon.com", domain: "amazon.com", tag: "shopping" },
  { id: "ebay", name: "eBay", desc: "Auctions and deals", url: "https://www.ebay.com", domain: "ebay.com", tag: "shopping" },
  { id: "etsy", name: "Etsy", desc: "Handmade and vintage", url: "https://www.etsy.com", domain: "etsy.com", tag: "shopping" },

  /* ---- gaming ---- */
  { id: "roblox", name: "Roblox", desc: "Play and build worlds", url: "https://www.roblox.com", domain: "roblox.com", tag: "gaming" },
  { id: "steam", name: "Steam", desc: "PC game store", url: "https://store.steampowered.com", domain: "steampowered.com", tag: "gaming" },
  { id: "epicgames", name: "Epic Games", desc: "Free games weekly", url: "https://store.epicgames.com", domain: "epicgames.com", tag: "gaming" },
  { id: "crazygames", name: "CrazyGames", desc: "Browser games", url: "https://www.crazygames.com", domain: "crazygames.com", tag: "gaming" },
  { id: "chess", name: "Chess.com", desc: "Play chess online", url: "https://www.chess.com", domain: "chess.com", tag: "gaming" },
  { id: "geforce-now", name: "GeForce NOW", desc: "Cloud gaming", url: "https://play.geforcenow.com", domain: "geforcenow.com", tag: "gaming" },
];

export function faviconUrl(domain: string, size = 128): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=${size}`;
}

export function getApp(id: string): AppDef | undefined {
  return APPS.find((a) => a.id === id);
}
