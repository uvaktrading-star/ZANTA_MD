const { cmd } = require("../command");
const { ytmp4, ytmp3 } = require("@vreden/youtube_scraper"); // සාර්ථක වූ Scraper Library එක
const yts = require("yt-search");
const { sleep } = require("../lib/functions");

// --- Core Helper Function for Download ---
async function downloadYoutubeVreden(url, format, zanta, from, mek, reply, data) {
    if (!url) return reply("❌ Invalid YouTube URL provided.");

    try {
        let finalData;
        let fileType = format === 'mp4' ? 'video' : 'audio';

        reply(`*Starting download (${format.toUpperCase()}):* ${data.title} 📥`);
        await sleep(1000); 

        if (format === 'mp4') {
            finalData = await ytmp4(url, '360'); // 360p Quality එකක් තෝරා ගනිමු
        } else if (format === 'mp3') {
            finalData = await ytmp3(url, '192');
        }

        if (!finalData || !finalData.download || !finalData.download.url) {
            return reply(`*❌ Download Failed!* Reason: Could not get valid download URL from scraper.`);
        }

        const downloadUrl = finalData.download.url;
        const caption = `*Download Complete (${format.toUpperCase()})!* \n\n🎬 Title: ${data.title}`;
        
        // --- File Type එක අනුව Message යැවීම ---
        if (format === 'mp4') {
            await zanta.sendMessage(
                from, 
                { 
                    video: { url: downloadUrl }, 
                    caption: caption,
                    mimetype: 'video/mp4' 
                }, 
                { quoted: mek }
            );
        } else if (format === 'mp3') {
             await zanta.sendMessage(
                from, 
                { 
                    audio: { url: downloadUrl }, 
                    caption: caption,
                    mimetype: 'audio/mpeg' 
                }, 
                { quoted: mek }
            );
        }

        return reply(`> *Download Complete!* ${fileType === 'video' ? '🎞️' : '🎶'}✅`);

    } catch (e) {
        console.error(`Vreden Download Error (${format}):`, e);
        reply(`*❌ Download Failed!* \n\n*Reason:* ${e.message} 😔`);
    }
}


// --- $ytmp4 Command (Video Download) ---
cmd(
    {
        pattern: "ytmp4",
        alias: ["vid", "ytvideo"],
        react: "🎞️",
        desc: "Downloads a YouTube video as MP4.",
        category: "download",
        filename: __filename,
    },
    async (zanta, mek, m, { from, reply, q }) => {
        if (!q) return reply("*Please provide a YouTube link or search query.* 🔗");
        
        // Search Logic (ඔබ $song එකේදී මෙන්)
        const search = await yts(q);
        const data = search.videos[0];
        
        if (!data) return reply("❌ Could not find the requested video.");
        
        // Video Download
        await downloadYoutubeVreden(data.url, 'mp4', zanta, from, mek, reply, data);
    }
);

// --- $ytmp3 Command (Audio Download) ---
cmd(
    {
        pattern: "ytmp3",
        alias: ["audio", "ytaudio"],
        react: "🎶",
        desc: "Downloads a YouTube video as MP3 audio.",
        category: "download",
        filename: __filename,
    },
    async (zanta, mek, m, { from, reply, q }) => {
        if (!q) return reply("*Please provide a YouTube link or search query.* 🔗");
        
        // Search Logic
        const search = await yts(q);
        const data = search.videos[0];
        
        if (!data) return reply("❌ Could not find the requested video.");
        
        // Audio Download
        await downloadYoutubeVreden(data.url, 'mp3', zanta, from, mek, reply, data);
    }
);
