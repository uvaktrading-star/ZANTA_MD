const {
default: makeWASocket,
useMultiFileAuthState,
DisconnectReason,
jidNormalizedUser,
getContentType,
fetchLatestBaileysVersion,
Browsers,
} = require("@whiskeysockets/baileys");

const fs = require("fs");
const P = require("pino");
const express = require("express");
const axios = require("axios");
const path = require("path");
const qrcode = require("qrcode-terminal");

const config = require("./config");
const { sms, downloadMediaMessage } = require("./lib/msg");
const {
getBuffer,
getGroupAdmins,
getRandom,
h2k,
isUrl,
Json,
runtime,
sleep, 
fetchJson,
} = require("./lib/functions");
const { File } = require("megajs");
const { commands, replyHandlers } = require("./command");

// 🚨 Menu Reply Logic සඳහා Import කිරීම
const { lastMenuMessage } = require("./plugins/menu"); 

const app = express();
const port = process.env.PORT || 8000; 
const prefix = ".";
const ownerNumber = ["94743404814"];
const credsPath = path.join(__dirname, "/auth_info_baileys/creds.json");

// 🚨 FIX 1: UNCAUGHT EXCEPTION HANDLING
process.on('uncaughtException', (err) => {
console.error('⚠️ Uncaught Exception detected! The process will NOT exit. Error:', err);
});

process.on('unhandledRejection', (reason, promise) => {
console.error('⚠️ Unhandled Rejection at:', promise, 'reason:', reason);
});
// --------------------------------------------------------------------------

// 💾 Memory-Based Message Store (Anti-Delete සඳහා)
const messagesStore = {}; 

async function ensureSessionFile() {
if (!fs.existsSync(credsPath)) {
if (!config.SESSION_ID) {
console.error(
"❌ SESSION_ID env variable is missing. Cannot restore session.",
);
process.exit(1);
}

console.log(
"🔄 creds.json not found. Downloading session from MEGA...",
);

const sessdata = config.SESSION_ID;
const filer = File.fromURL(`https://mega.nz/file/${sessdata}`);

filer.download((err, data) => {
if (err) {
console.error(
"❌ Failed to download session file from MEGA:",
err,
);
process.exit(1);
}

fs.mkdirSync(path.join(__dirname, "/auth_info_baileys/"), {
recursive: true,
});
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
const { state, saveCreds } = await useMultiFileAuthState(
path.join(__dirname, "/auth_info_baileys/"),
);
const { version } = await fetchLatestBaileysVersion();

const danuwa = makeWASocket({
logger: P({ level: "silent" }),
printQRInTerminal: false,
browser: Browsers.macOS("Firefox"),
auth: state,
version,
syncFullHistory: true,
markOnlineOnConnect: config.ALWAYS_ONLINE, // 🌟 config value එක අනුව Start එකේදී Online තීරණය කරයි
generateHighQualityLinkPreview: true,
messages: new Map(),
});

danuwa.ev.on("connection.update", async (update) => {
const { connection, lastDisconnect } = update;
if (connection === "close") {
if (
lastDisconnect?.error?.output?.statusCode !==
DisconnectReason.loggedOut
) {
connectToWA();
}
} else if (connection === "open") {
console.log("✅ ZANTA-MD connected to WhatsApp");

// 🌟 FIX: ALWAYS_ONLINE: true නම්, නිරන්තරයෙන් Available Status එක යැවීම
if (config.ALWAYS_ONLINE) {
    // 30s Loop එකකින් Online Status එක maintain කරයි
    setInterval(async () => {
        await danuwa.sendPresenceUpdate('available');
    }, 30000); 
    console.log('✅ Continuous ONLINE presence loop started.');
}


const up = `ZANTA-MD connected ✅\n\nPREFIX: ${prefix}`;
await danuwa.sendMessage(ownerNumber[0] + "@s.whatsapp.net", {
image: {
url: `https://github.com/Akashkavindu/ZANTA_MD/blob/main/images/ChatGPT%20Image%20Nov%2021,%202025,%2001_21_32%20AM.png?raw=true`,
},
caption: up,
});

// ✅ PLUGIN LOADER
fs.readdirSync("./plugins/").forEach((plugin) => {
if (path.extname(plugin).toLowerCase() === ".js") {
try {
const pluginModule = require(`./plugins/${plugin}`);
if (typeof pluginModule === "function") {
pluginModule(danuwa);
console.log(
`[Plugin Loader] Successfully injected client into: ${plugin}`,
);
} else {
console.log(
`[Plugin Loader] Loaded command plugin: ${plugin}`,
);
}
} catch (e) {
console.error(
`[Plugin Loader] Error loading ${plugin}:`,
e,
);
}
}
});
}
});

danuwa.ev.on("creds.update", saveCreds);

// ----------------------------------------------------------------------
// 🗑️ ANTI-DELETE DETECTION EVENT 
// ----------------------------------------------------------------------
danuwa.ev.on("messages.delete", async (deletedMessage) => {
const { remoteJid, fromMe } = deletedMessage.key;
if (fromMe) return;
const storedMessage = messagesStore[deletedMessage.key.id];

if (storedMessage && storedMessage.message) {
let messageType = getContentType(storedMessage.message);
let deletedContent = 'මෙහි අන්තර්ගතය සොයාගත නොහැක (Media/Sticker).'; 
if (messageType === 'conversation') {
deletedContent = storedMessage.message.conversation;
} else if (messageType === 'extendedTextMessage') {
deletedContent = storedMessage.message.extendedTextMessage.text;
} else if (messageType === 'imageMessage') {
deletedContent = storedMessage.message.imageMessage.caption || "Image Message";
} else if (messageType === 'videoMessage') {
deletedContent = storedMessage.message.videoMessage.caption || "Video Message";
}
const senderName = storedMessage.pushName || remoteJid;

const replyText = 
`🗑️ **MESSAGE DELETED (Anti-Delete)**\n` +
`*යවන්නා:* ${senderName}\n` +
`*වර්ගය:* ${messageType}\n` +
`*අන්තර්ගතය:* \n\`\`\`${deletedContent}\`\`\``;

await danuwa.sendMessage(
remoteJid, 
{ text: replyText }, 
{ quoted: storedMessage }
);
delete messagesStore[deletedMessage.key.id];
}
});


// ----------------------------------------------------------------------
// 📥 INCOMING MESSAGE EVENT 
// ----------------------------------------------------------------------
danuwa.ev.on("messages.upsert", async ({ messages }) => {
for (const msg of messages) {
if (msg.messageStubType === 68) {
await danuwa.sendMessageAck(msg.key);
}
}

const mek = messages[0];

        // 🚩 JID Normalization
        const fromJidRaw = mek.key.remoteJid;
        const from = fromJidRaw ? jidNormalizedUser(fromJidRaw) : null;
        if (!from) return;


// 🟢 STATUS AUTO-SEEN & REACT LOGIC
// Baileys හි Status Updates සඳහා නිල JID: status@broadcast
const isStatusUpdate = mek.key.remoteJid === 'status@broadcast';
const isMyStatus = mek.key.fromMe; 

if (isStatusUpdate && !isMyStatus) {
    // 💡 Debugging: Status එකක් ලැබුණු බව තහවුරු කරයි
    console.log(`[STATUS DETECTED] New Status from: ${mek.key.participant || 'Unknown'}. Config React: ${config.AUTO_STATUS_REACT}`); 

    // Status Logic ක්‍රියාත්මක වන්නේ AUTO_STATUS_REACT enabled නම් පමණි
    if (config.AUTO_STATUS_REACT) {

        // Status Key එක සකස් කිරීම - Read/React සඳහා participant අනිවාර්ය වේ.
        const statusKey = {
            remoteJid: mek.key.remoteJid,
            id: mek.key.id,
            participant: mek.key.participant, // Status එක දැමූ පුද්ගලයාගේ JID එක
        };

        // 1. Status Seen (Mark as read) - 500ms ප්‍රමාදය Status Read කිරීමට අත්‍යවශ්‍යයි
        await sleep(500); 
        await danuwa.readMessages([statusKey]);
        console.log(`✅ Status viewed: ${statusKey.id}`);

        // 2. Status Auto Reaction (Heart ❤️)
        await sleep(100); 

        // 🚨 FINAL REACTION FIX: Reaction එක Status එක දැමූ පුද්ගලයාගේ Private JID එකට යැවීම
        await danuwa.sendMessage(statusKey.participant, { 
            react: {
                text: '❤️', // Heart emoji
                // Key Structure එක පැහැදිලිව සඳහන් කිරීම
                key: {
                    remoteJid: statusKey.remoteJid, // status@broadcast
                    id: statusKey.id,
                    participant: statusKey.participant,
                    fromMe: false, // මෙය අනෙක් පුද්ගලයාගේ Status එකක් නිසා false විය යුතුයි
                }
            }
        });
        console.log(`✅ Status reacted with ❤️ to: ${statusKey.participant}`);
    } else {
        console.log(`[STATUS SKIP] AUTO_STATUS_REACT is disabled in config.`);
    }

    // Status message process කිරීමෙන් පසු, අමතර Chat Logic සඳහා යැවීම නවත්වයි
    return; 
}
// ---------------------------------------------------------------------

// 🚨 PRESENCE UPDATE LOGIC: ALWAYS_ONLINE = true නම්, බලහත්කාරයෙන් Online පෙන්වයි.
if (config.ALWAYS_ONLINE) {
    // 🌟 ස්ථිර Online Fix එක: කෙටි ප්‍රමාදයන් සහිතව Available status කිහිපයක් යවයි.
    await danuwa.sendPresenceUpdate('available'); 
    await sleep(100); 
    await danuwa.sendPresenceUpdate('available'); 
    await sleep(100);
    await danuwa.sendPresenceUpdate('available');
} else if (!config.ALWAYS_ONLINE && !mek.key.fromMe) {
    // ALWAYS_ONLINE = false නම්, Message එකක් ආ විටම Typing පෙන්වයි
    await danuwa.sendPresenceUpdate('composing', from); 
}
// ---------------------------------------------------------------------

// 🚨 INCOMING MESSAGE DEBUG LOG
console.log("-----------------------------------------");
console.log(`📥 Incoming Message from (Normalized): ${from}`); 
console.log(`Message Body: ${mek.message?.conversation || mek.message?.extendedTextMessage?.text || 'Non-Text Message'}`);
console.log("-----------------------------------------");

if (!mek || !mek.message) return;

// 💡 1. Incoming Messages Store: Memory එකේ ගබඩා කිරීම
if (mek.key.id && !mek.key.fromMe) {
messagesStore[mek.key.id] = mek;
}

mek.message =
getContentType(mek.message) === "ephemeralMessage"
? mek.message.ephemeralMessage.message
: mek.message;
if (from.endsWith("@broadcast")) return; 

const m = sms(danuwa, mek);
const type = getContentType(mek.message);

const body =
type === "conversation"
? mek.message.conversation
: mek.message[type]?.text || mek.message[type]?.caption || "";
const isCmd = body.startsWith(prefix);
const commandName = isCmd
? body.slice(prefix.length).trim().split(" ")[0].toLowerCase()
: "";
const args = body.trim().split(/ +/).slice(1);
const q = args.join(" ");

// ✅ SENDER හඳුනාගැනීමේ Logic
const sender = mek.key.fromMe
? danuwa.user.id
: mek.key.participant
? mek.key.participant
: mek.key.remoteJid;
const senderNumber = sender.split("@")[0];
const isGroup = from.endsWith("@g.us");
const botNumber = danuwa.user.id.split(":")[0];
const pushname = mek.pushName || "Sin Nombre";
const isMe = botNumber.includes(senderNumber);
const isOwner = ownerNumber.includes(senderNumber) || isMe;
const botNumber2 = await jidNormalizedUser(danuwa.user.id);

const groupMetadata = isGroup
? await danuwa.groupMetadata(from).catch(() => ({}))
: {};
const groupName = isGroup ? groupMetadata.subject : "";
const participants = isGroup ? groupMetadata.participants : "";
const groupAdmins = isGroup ? await getGroupAdmins(participants) : "";
const isBotAdmins = isGroup ? groupAdmins.includes(botNumber2) : false;
const isAdmins = isGroup ? groupAdmins.includes(sender) : false;

const reply = (text) => 
danuwa.sendMessage(from, { text }, { quoted: mek });

// ------------------------------------------------------------------
// REPLY-BASED COMMAND EXECUTION LOGIC එක (Menu Reply Handling)
// ------------------------------------------------------------------
const isMenuReply = (m.quoted && lastMenuMessage && lastMenuMessage.get(from) === m.quoted.id);
let shouldExecuteMenu = false;
let replySelection = null;

if (isMenuReply && body && !body.startsWith(prefix)) {
replySelection = body.trim().toLowerCase();
shouldExecuteMenu = true;
}

if (isCmd || shouldExecuteMenu) { 
const executionCommandName = shouldExecuteMenu ? 'menu' : commandName;
const executionArgs = shouldExecuteMenu ? [replySelection] : args;
const executionBody = shouldExecuteMenu ? replySelection : body;
const executionQ = shouldExecuteMenu ? replySelection : q;

const cmd = commands.find(
(c) =>
c.pattern === executionCommandName || 
(c.alias && c.alias.includes(executionCommandName)),
);

if (cmd) {
if (cmd.react)
danuwa.sendMessage(from, {
react: { text: cmd.react, key: mek.key },
});
try {
cmd.function(danuwa, mek, m, {
from,
quoted: mek,
body: executionBody, 
isCmd,
command: executionCommandName,
args: executionArgs,
q: executionQ,
isGroup,
sender,
senderNumber,
botNumber2,
botNumber,
pushname,
isMe,
isOwner,
groupMetadata,
groupName,
participants,
groupAdmins,
isBotAdmins,
isAdmins,
reply,
});
} catch (e) {
console.error("[PLUGIN EXECUTION ERROR]", e);
reply("❌ An internal error occurred while running the command.");
}
}
}

const replyText = body;
for (const handler of replyHandlers) {
if (handler.filter(replyText, { sender, message: mek })) {
try {
await handler.function(danuwa, mek, m, {
from,
quoted: mek,
body: replyText,
sender,
reply,
});
break;
} catch (e) {
console.log("Reply handler error:", e);
}
}
}

// 🛑 ALWAYS_ONLINE = false නම් පමණක් Paused තත්ත්වයට මාරු කිරීම
if (!config.ALWAYS_ONLINE) {
    // 200ms ප්‍රමාදයක් ලබා දී Paused තත්ත්වයට යවයි.
    await sleep(200); 
    await danuwa.sendPresenceUpdate('paused', from);
}
});
}

ensureSessionFile();

app.get("/", (req, res) => {
res.send("Hey, ZANTA-MD started ✅");
});

app.listen(port, () =>
console.log(`Server listening on http://localhost:${port}`),
);
