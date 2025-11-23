const { cmd } = require("../command");
const axios = require('axios'); // Media Download සඳහා axios library එක අවශ්‍යයි.

cmd(
    {
        pattern: "save",
        react: "✅", 
        desc: "Resend Status or One-Time View Media (Buffer FIX)",
        category: "general",
        filename: __filename,
    },
    async (
        zanta,
        mek,
        m,
        {
            from,
            quoted,
            reply,
        }
    ) => {
        try {
            if (!quoted) {
                return reply("*කරුණාකර Status/Media Message එකකට reply කරන්න!* 🧐");
            }

            let mediaObject = quoted.quoted || quoted.fakeObj;
            let saveCaption = "*💾 Saved and Resent!*";
            
            if (!mediaObject) {
                return reply("*⚠️ Media Content එක හඳුනාගැනීමට අසමත් විය. (Media Data නැත)*");
            }

            // 1. Media Type එක තීරණය කිරීම
            const messageType = Object.keys(mediaObject)[0];
            const mediaData = mediaObject[messageType];
            
            // 2. Download URL එක ලබා ගැනීම
            const mediaUrl = mediaData.url || mediaData.directPath; 

            if (!mediaUrl) {
                 return reply("*⚠️ Media Download කිරීමට URL එකක් සොයාගත නොහැක.*");
            }
            
            reply("*Media File එක Download කරමින්...* ⏳");

            // 3. Media File එක Download කර Buffer එකක් ලෙස ලබා ගැනීම
            const mediaResponse = await axios.get(mediaUrl, { responseType: 'arraybuffer' });
            const mediaBuffer = mediaResponse.data;
            
            // 4. Message Options සැකසීම (Buffer භාවිතයෙන්)
            let messageOptions = {};
            
            if (messageType === 'imageMessage') {
                messageOptions = { image: mediaBuffer, caption: saveCaption };
            } else if (messageType === 'videoMessage') {
                messageOptions = { video: mediaBuffer, caption: saveCaption };
            } else if (messageType === 'documentMessage') {
                messageOptions = { document: mediaBuffer, fileName: mediaData.fileName, mimetype: mediaData.mimetype, caption: saveCaption };
            } else {
                 return reply("*⚠️ හඳුනාගත් Media Type එක යැවීමට සහය නොදක්වයි.*");
            }

            // 5. Message යැවීම
            await zanta.sendMessage(from, messageOptions, { quoted: mek });

            return reply("*වැඩේ හරි 🙃✅*");

        } catch (e) {
            console.error(e);
            reply(`*Error downloading or sending media:* ${e.message || e}`);
        }
    }
);
