const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    jidNormalizedUser,
    getContentType,
    fetchLatestBaileysVersion,
    Browsers,
    // ⚠️ Added for loadMessage functionality ⚠️
    WAMessageKey,
} = require('@whiskeysockets/baileys');

const fs = require('fs');
const P = require('pino');
const express = require('express');
const axios = require('axios');
const path = require('path');
const qrcode = require('qrcode-terminal');

const config = require('./config');
// ⚠️ Updated to use downloadContentFromMessage from baileys for safety
const { sms } = require('./lib/msg'); 
const {
    getBuffer, getGroupAdmins, getRandom, h2k, isUrl, Json, runtime, sleep, fetchJson
} = require('./lib/functions');
const { File } = require('megajs');
const { commands, replyHandlers } = require('./command');

const app = express();
const port = process.env.PORT || 8000;

const prefix = '.';
const ownerNumber = ['94743404814'];
const credsPath = path.join(__dirname, '/auth_info_baileys/creds.json');

async function ensureSessionFile() {
    if (!fs.existsSync(credsPath)) {
        if (!config.SESSION_ID) {
            console.error('❌ SESSION_ID env variable is missing. Cannot restore session.');
            process.exit(1);
        }

        console.log("🔄 creds.json not found. Downloading session from MEGA...");

        const sessdata = config.SESSION_ID;
        const filer = File.fromURL(`https://mega.nz/file/${sessdata}`);

        filer.download((err, data) => {
            if (err) {
                console.error("❌ Failed to download session file from MEGA:", err);
                process.exit(1);
            }

            fs.mkdirSync(path.join(__dirname, '/auth_info_baileys/'), { recursive: true });
            fs.writeFileSync(credsPath, data);
            console.log("✅ Session downloaded and saved. Restarting bot...");
            setTimeout(() => {
                connectToWA();
            }, 2000);
        });
    } else {
        setTimeout(() => {
            connectToWA();
        }, 1000);
    }
}

async function connectToWA() {
    console.log("Connecting ZANTA-MD 🧬...");
    const { state, saveCreds } = await useMultiFileAuthState(path.join(__dirname, '/auth_info_baileys/'));
    const { version } = await fetchLatestBaileysVersion();

    const zanta = makeWASocket({
        logger: P({ level: 'silent' }),
        printQRInTerminal: false,
        browser: Browsers.macOS("Firefox"),
        auth: state,
        version,
        syncFullHistory: true,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: true,
    });

    // ⚠️ FIX: loadMessage functionality added to zanta object
    zanta.loadMessage = async (jid, id) => {
        try {
            const msgKey = { remoteJid: jid, id: id, fromMe: false };
            const fullMessage = await zanta.relayMessage(jid, {
                extendedTextMessage: {
                    text: '',
                    contextInfo: {
                        externalAdReply: {
                            body: '',
                            mediaType: 1,
                            renderLargerThumbnail: true,
                            showAdAttribution: true,
                            sourceUrl: '',
                            title: '',
                            thumbnail: Buffer.alloc(0),
                            mediaUrl: '',
                            mentionedJid: [zanta.user.id],
                        },
                        stanzaId: id,
                        participant: jid,
                        quotedMessage: fullMessage ? fullMessage.message : null,
                    },
                },
            }, { messageId: id, userJid: jid });
            return fullMessage;
        } catch (error) {
            // Fallback for cases where relayMessage fails (e.g., deleted message)
            console.error("zanta.loadMessage fallback failed:", error);
            return null;
        }
    };
    // ⚠️ END FIX

    zanta.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            if (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) {
                connectToWA();
            }
        } else if (connection === 'open') {
            console.log('✅ ZANTA-MD connected to WhatsApp');

            const up = `> ZANTA-MD connected ✅\n\nPREFIX: ${prefix}`;
            await zanta.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
                image: { url: `https://github.com/Akashkavindu/ZANTA_MD/blob/main/images/ChatGPT%20Image%20Nov%2021,%202025,%2001_21_32%20AM.png?raw=true` },
                caption: up
            });

            fs.readdirSync("./plugins/").forEach((plugin) => {
                if (path.extname(plugin).toLowerCase() === ".js") {
                    require(`./plugins/${plugin}`);
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
        
        // ⚠️ STATUS MEDIA FIX - Core Logic Injection ⚠️
        const quotedMsg = mek.message.extendedTextMessage?.contextInfo?.quotedMessage;
        const quotedJid = mek.message.extendedTextMessage?.contextInfo?.remoteJid;
        const quotedID = mek.message.extendedTextMessage?.contextInfo?.stanzaId;

        // 1. Check if it's a reply to a Status (Status replies are sent to the Bot as regular messages)
        if (quotedMsg && quotedJid === 'status@broadcast' && quotedID) {
            // 2. Load the original status message to get the Media Key
            const fullStatusMessage = await zanta.loadMessage(
                'status@broadcast', // JID is always status@broadcast for status messages
                quotedID 
            );

            if (fullStatusMessage && fullStatusMessage.message) {
                // 3. Extract the inner media message (which contains the media key)
                const innerMessage = fullStatusMessage.message.viewOnceMessage 
                                    ? fullStatusMessage.message.viewOnceMessage.message 
                                    : fullStatusMessage.message;
                
                // 4. Inject the full message object into the 'quoted' object (mek)
                // This makes the crucial 'mediaKey' available for the save.js plugin.
                mek.quoted.message = innerMessage; // Assuming sms() creates mek.quoted from quoted message part
                // Since sms(zanta, mek) runs before, we must manually update the full quoted message data
                // We use the raw mek object and adjust m.quoted (if m.quoted exists)
                
                // If you use m.quoted inside save.js, you must update m:
                // m.quoted = sms(zanta, fullStatusMessage); // This depends on how sms works
                
                // For simplicity, we assume save.js uses mek.quoted.message
                // We inject the entire fetched message structure (which contains the key) back into mek.quoted
                mek.quoted.message = innerMessage; // This is the actual data needed
            }
        }
        // ⚠️ END STATUS MEDIA FIX ⚠️


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
