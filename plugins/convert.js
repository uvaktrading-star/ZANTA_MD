const { cmd, commands } = require("../command");
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg'); // fluent-ffmpeg dependency එක අවශ්‍යයි

// --- Helper function to determine media type from quoted message ---
const getMediaType = (quoted) => {
    let mediaType = quoted.mtype;
    let isSticker = mediaType === 'stickerMessage';
    let isImage = mediaType === 'imageMessage';
    let isVideo = mediaType === 'videoMessage';
    
    // View Once messages හසුරුවයි
    if (quoted.msg && quoted.msg.viewOnce) {
        const messageKeys = Object.keys(quoted.msg.message);
        if (messageKeys.includes('imageMessage')) isImage = true;
        if (messageKeys.includes('videoMessage')) isVideo = true;
    }
    
    return { isSticker, isImage, isVideo, mediaType };
};

// --- 1. STICKER to MEDIA (toimg/tovid) ---
cmd(
  {
    pattern: "toimg",
    alias: ["tovid"],
    react: "🖼️",
    desc: "Converts sticker to img",
    category: "convert",
    filename: __filename,
  },
  async (zanta, mek, m, { from, reply, quoted }) => {
    try {
      if (!quoted) return reply("*Please reply to a sticker!* 🖼️");
      
      const { isSticker } = getMediaType(quoted);
      if (!isSticker) return reply("*The message you replied to is not a Sticker!* ❌");

      reply("*Converting sticker to media...* ⏳");

      const mediaBuffer = await zanta.downloadMediaMessage(quoted);
      const isAnimated = quoted.msg.isAnimated;
      
      if (!isAnimated) {
          // Send as Image
          await zanta.sendMessage(
              from, 
              { image: mediaBuffer, caption: `*🖼️ Converted from Sticker (Image)*` }, 
              { quoted: mek }
          );
      } else {
          // Send as Video (Animated Sticker)
          await zanta.sendMessage(
              from, 
              { video: mediaBuffer, caption: `*🎥 Converted from Sticker (Video)*` }, 
              { quoted: mek }
          );
      }

      return reply("> *වැඩේ හරි 🙃✅*");
      
    } catch (e) {
      console.error(e);
      reply(`*Error converting sticker:* ${e.message || e}`);
    }
  }
);


// --- 2. MEDIA to STICKER (s) ---
cmd(
  {
    pattern: "s",
    alias: ["sticker", "st"],
    react: "🌟",
    desc: "Converts a sticker.",
    category: "convert",
    filename: __filename,
  },
  async (zanta, mek, m, { from, reply, quoted }) => {
    try {
      if (!quoted) return reply("*Please reply to an image or video!* 🌟");
      
      const { isImage, isVideo } = getMediaType(quoted);
      // Video is limited to 15 seconds for sticker conversion
      if (!isImage && (!isVideo || (isVideo && quoted.msg.seconds > 15))) {
          return reply("*Reply to an Image or a short Video (max 15s) to make a sticker!* ❌");
      }

      reply("*Creating sticker...* ⏳");
      
      const mediaBuffer = await zanta.downloadMediaMessage(quoted);

      await zanta.sendImageAsSticker(from, mediaBuffer, mek, { packname: "ZANTA", author: "Sticker Bot" });

      return reply("> *වැඩේ හරි 🙃✅*");
      
    } catch (e) {
      console.error(e);
      reply(`*Error creating sticker:* ${e.message || e}`);
    }
  }
);


// --- 3. VIDEO to MP3 (tomp3) ---
cmd(
  {
    pattern: "tomp3",
    alias: ["toaudio"],
    react: "🎶",
    desc: "Converts video to mp3.",
    category: "convert",
    filename: __filename,
  },
  async (zanta, mek, m, { from, reply, quoted }) => {
    try {
      if (!quoted) return reply("*Please reply to a video!* 🎶");
      
      const { isVideo } = getMediaType(quoted);
      if (!isVideo) return reply("*The message you replied to is not a Video!* ❌");

      // Check video duration limit (max 5 minutes for conversion)
      if (quoted.msg.seconds > 300) { 
          return reply("*Video is too long for conversion (Max 5 minutes allowed).* 😞");
      }

      reply("*Converting video to MP3... This may take time.* ⏳");
      
      const inputPath = `./temp/${m.sender.split('@')[0]}_input.mp4`;
      const outputPath = `./temp/${m.sender.split('@')[0]}_output.mp3`;

      // 1. Ensure temp directory exists 
      if (!fs.existsSync('./temp')) fs.mkdirSync('./temp');

      // 2. Download the video
      const mediaBuffer = await zanta.downloadMediaMessage(quoted);
      fs.writeFileSync(inputPath, mediaBuffer);

      // 3. Convert using fluent-ffmpeg
      ffmpeg(inputPath)
        .noVideo() // Process only the audio stream
        .audioCodec('libmp3lame')
        .save(outputPath)
        .on('error', (err) => {
          // Cleanup temporary files
          if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          console.error(`FFmpeg Conversion Error: ${err.message}`);
          reply(`*FFmpeg Conversion Error:* ${err.message}`);
        })
        .on('end', async () => {
          try {
            // 4. Send the MP3
            await zanta.sendMessage(
              from,
              { 
                  audio: fs.readFileSync(outputPath), 
                  mimetype: 'audio/mp3', 
                  fileName: 'converted.mp3' 
              },
              { quoted: mek, ptt: false } // ptt: false ensures it's sent as a regular audio file
            );

            // 5. Final Cleanup
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
            return reply("> *වැඩේ හරි 🙃✅*");

          } catch (sendError) {
              console.error("Error sending or cleaning up MP3:", sendError);
              reply(`*Error sending MP3:* ${sendError.message}`);
          }
        });
      
    } catch (e) {
      console.error(e);
      reply(`*Error converting to MP3:* ${e.message || e}`);
    }
  }
);

