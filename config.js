const fs = require('fs');
if (fs.existsSync('config.env')) require('dotenv').config({ path: './config.env' });

function convertToBool(text, fault = 'true') {
    return text === fault ? true : false;
}

module.exports = {
    ALIVE_IMG: process.env.ALIVE_IMG || "https://github.com/Akashkavindu/ZANTA_MD/blob/main/images/alive-new.jpg?raw=true",
    SESSION_ID: process.env.SESSION_ID || "Enter your session ID", //enter your session id
    OWNER_NUMBER: process.env.OWNER_NUMBER || "94743404814", //enter your whatsapp number

    // Default Fallback Settings 
    DEFAULT_BOT_NAME: "ZANTA-MD",
    DEFAULT_OWNER_NAME: "Akash Kavindu",
    DEFAULT_PREFIX: ".",

    // Bot Features
    AUTO_STATUS_SEEN: convertToBool(process.env.AUTO_STATUS_SEEN || 'true'),
};
