const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    jidNormalizedUser,
    getContentType,
    fetchLatestBaileysVersion,
    Browsers
} = require('@whiskeysockets/baileys');

const fs = require('fs');
const P = require('pino');
const express = require('express');
const axios = require('axios'); // 👈 API Session Restore සඳහා මෙය අත්‍යවශ්‍යයි
const path = require('path');
const { sms, downloadMediaMessage } = require('./lib/msg');
const {
    getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson
} = require('./lib/functions');
const { commands, replyHandlers } = require('./command');

const config = require('./config'); // config file එක load කරයි

const app = express();
const port = process.env.PORT || 8000;

const prefix = '.';
const ownerNumber = ['94743404814'];
const authDir = path.join(__dirname, '/auth_info_baileys/');
const credsPath = path.join(authDir, 'creds.json');

// --- Session Restore Logic (API Call) ---
async function ensureSessionFile() {
    if (!fs.existsSync(credsPath)) {
        if (!config.SESSION_ID) {
            console.error('❌ SESSION_ID env variable is missing. Cannot proceed.');
            process.exit(1);
        }

        const sessionIdKey = config.SESSION_ID;

        console.log(`🔄 Session file not found. Attempting to fetch session data for key: ${sessionIdKey}`);

        try {
            // 💡 ඔබගේ Short Session ID එක Base64 Session JSON බවට පත් කරන API URL එක
            // ...
            const API_URL = `https://session.samurai-md.xyz/api/session/${sessionIdKey}`; 
            // ...
            
            console.log(`Fetching session from API: ${API_URL}`);
            
            const { data } = await axios.get(API_URL);
            
            if (!data || !data.session) {
                 throw new Error("Invalid response from session API: session data is missing.");
            }
            
            // API Response එක Base64 String එකක් බවට සලකයි (Decode කරයි)
            const sessionData = Buffer.from(data.session, 'base64').toString('utf-8');
            
            // auth_info_baileys folder එක සෑදීම
            if (!fs.existsSync(authDir)) {
                 fs.mkdirSync(authDir, { recursive: true });
            }
            
            // creds.json file එක ලිවීම
            fs.writeFileSync(credsPath, sessionData);
            
            console.log("✅ Session restored via API and saved. Connecting bot...");
            setTimeout(() => {
                connectToWA();
            }, 1000);

        } catch (e) {
            console.error("❌ Failed to restore session via API. Check SESSION_ID and API URL:", e.message || e);
            process.exit(1);
        }
    } else {
        setTimeout(() => {
            connectToWA();
        }, 1000);
    }
}
// --- Session Restore Logic End ---


async function connectToWA() {
    console.log("Connecting ZANTA-MD 🧬...");
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const zanta = makeWASocket({
        logger: P({ level: 'info' }),
        printQRInTerminal: false,
        browser: Browsers.macOS("Firefox"),
        auth: state,
        version,
        syncFullHistory: true,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
    });

    // 👈 1. Message Cache Map එක initialize කිරීම (Antidelete සඳහා)
    zanta.messages = new Map();

    zanta.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                connectToWA();
            } else {
                 console.log('🤖 Connection logged out. Delete session files and scan a new QR code locally, or update the SESSION_ID.');
            }
        } else if (connection === 'open') {
            console.log('✅ ZANTA-MD connected to WhatsApp');

            const up = `> ZANTA-MD connected ✅\n\nPREFIX: ${prefix}`;
            await zanta.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
                image: { url: `https://raw.githubusercontent.com/Akashkavindu/ZANTA_MD/refs/heads/main/images/ChatGPT%20Image%20Nov%2021%2C%202025%2C%2001_21_32%20AM.png` },
                caption: up
            });

            fs.readdirSync("./plugins/").forEach((plugin) => {
                if (path.extname(plugin).toLowerCase() === ".js") {
                    const pluginModule = require(`./plugins/${plugin}`);
                    if (typeof pluginModule === 'function') {
                        pluginModule(zanta);
                    }
                }
            });
        }
    });

    zanta.ev.on('creds.update', saveCreds);

    zanta.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            if (msg.messageStubType === 68) {
                await zanta.sendMessageAck(msg.key);
            }
            
            // 👈 2. Message Cache එක Update කිරීම (Antidelete Logic සඳහා)
            if (msg.key.id && !msg.key.fromMe && msg.key.remoteJid !== 'status@broadcast') {
                 zanta.messages.set(msg.key.id, msg);
                 if (zanta.messages.size > 200) {
                     zanta.messages.delete(zanta.messages.keys().next().value);
                 }
            }
        }

        const mek = messages[0];
        if (!mek || !mek.message) return;

        mek.message = getContentType(mek.message) === 'ephemeralMessage' ? mek.message.ephemeralMessage.message : mek.message;
        if (mek.key.remoteJid === 'status@broadcast') return;

        const m = sms(zanta, mek);
        const type = getContentType(mek.message);
        const from = mek.key.remoteJid;
        const body = type === 'conversation' ? mek.message.conversation : mek.message[type]?.text || mek.message[type]?.caption || '';
        const isCmd = body.startsWith(prefix);
        const commandName = isCmd ? body.slice(prefix.length).trim().split(" ")[0].toLowerCase() : '';
        const args = body.trim().split(/ +/).slice(1);
        const q = args.join(' ');

        const sender = mek.key.fromMe ? zanta.user.id : (mek.key.participant || mek.key.remoteJid);
        const senderNumber = sender.split('@')[0];
        const isGroup = from.endsWith('@g.us');
        const botNumber = zanta.user.id.split(':')[0];
        const pushname = mek.pushName || 'Sin Nombre';
        const isMe = botNumber.includes(senderNumber);
        const isOwner = ownerNumber.includes(senderNumber) || isMe;
        const botNumber2 = await jidNormalizedUser(zanta.user.id);

        const groupMetadata = isGroup ? await zanta.groupMetadata(from).catch(() => {}) : '';
        const groupName = isGroup ? groupMetadata.subject : '';
        const participants = isGroup ? groupMetadata.participants : '';
        const groupAdmins = isGroup ? await getGroupAdmins(participants) : '';
        const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false;
        const isAdmins = isGroup ? groupAdmins.includes(sender) : false;

        const reply = (text) => zanta.sendMessage(from, { text }, { quoted: mek });

        if (isCmd) {
            const cmd = commands.find((c) => c.pattern === commandName || (c.alias && c.alias.includes(commandName)));
            if (cmd) {
                if (cmd.react) zanta.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
                try {
                    cmd.function(zanta, mek, m, {
                        from, quoted: mek, body, isCmd, command: commandName, args, q,
                        isGroup, sender, senderNumber, botNumber2, botNumber, pushname,
                        isMe, isOwner, groupMetadata, groupName, participants, groupAdmins,
                        isBotAdmins, isAdmins, reply,
                    });
                } catch (e) {
                    console.error("[PLUGIN ERROR]", e);
                }
            }
        }

        const replyText = body;
        for (const handler of replyHandlers) {
            if (handler.filter(replyText, { sender, message: mek })) {
                try {
                    await handler.function(zanta, mek, m, {
                        from, quoted: mek, body: replyText, sender, reply,
                    });
                    break;
                } catch (e) {
                    console.log("Reply handler error:", e);
                }
            }
        }
    });
}

ensureSessionFile();

app.get("/", (req, res) => {
    res.send("Hey, ZANTA-MD started✅");
});

app.listen(port, () => console.log(`Server listening on http://localhost:${port}`));
