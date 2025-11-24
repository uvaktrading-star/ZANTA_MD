const { cmd, commands } = require("../command");
const ytdl = require("ytdl-core");

cmd(
  {
    pattern: "ytmp4",
    alias: ["ytv"],
    react: "🎬",
    desc: "Download YouTube video as MP4",
    category: "download",
    filename: __filename,
  },
  async (
    zanta,
    mek,
    m,
    {
      from,
      reply,
      q,
    }
  ) => {
    try {
      if (!q) {
        return reply("*Please provide a valid YouTube video URL or ID!* 🎬");
      }

      // 1. URL Validation
      const youtubeUrl = q; // Using q directly, similar to fb.js

      if (!ytdl.validateURL(youtubeUrl)) {
        return reply("*Invalid YouTube URL! Please check and try again.* ☹️");
      }
      
      reply("*Downloading YouTube video... This may take a moment.* ⏳");

      // 2. Get Video Info
      const info = await ytdl.getInfo(youtubeUrl);
      const videoTitle = info.videoDetails.title;
      const videoLength = parseInt(info.videoDetails.lengthSeconds);
      
      // Check for video length (Limit to 30 minutes / 1800 seconds)
      if (videoLength > 1800) { 
          return reply("*Video is too long! (Max 30 minutes allowed)* 😞");
      }

      // 3. Find Best MP4 Format (Video & Audio combined)
      const format = ytdl.chooseFormat(info.formats, { 
          quality: 'highestvideo', 
          filter: 'videoandaudio', 
      });

      if (!format) {
          return reply("*Could not find a suitable MP4 format with audio.* ☹️");
      }

      // 4. Download and Send
      const downloadStream = ytdl(youtubeUrl, { format: format });
      
      const captionText = `*🎬 YouTube Video Downloaded*\n\n*Title:* ${videoTitle}`;

      await zanta.sendMessage(
        from,
        {
          video: { stream: downloadStream },
          caption: captionText,
          fileName: `${videoTitle}.mp4`,
          mimetype: 'video/mp4',
        },
        { quoted: mek }
      );
      
      return reply("> *වැඩේ හරි 🙃✅*");
      
    } catch (e) {
      console.error(e);
      reply(`*Error downloading video:* ${e.message || e}`);
    }
  }
);
