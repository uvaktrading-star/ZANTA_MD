const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    jidNormalizedUser,
    getContentType,
    fetchLatestBaileysVersion,
    Browsers
    //... (Add 'isJidGroup' if available, otherwise ignore)
    // ... (Add 'WAMessageStubType' if available, otherwise ignore)
} = require('@whiskeysockets/baileys');

// ... (Other require statements)
// ...

// ... (ensureSessionFile and connectToWA functions are here, UNCHANGED)
// ...

async function connectToWA() {
    // ... (connection logic UNCHANGED) ...

    zanta.ev.on('messages.upsert', async ({ messages }) => {
        for (const msg of messages) {
            // ... (message stub handling UNCHANGED) ...
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

        // ... (Sender, Group, Admin variables UNCHANGED) ...

        const reply = (text) => zanta.sendMessage(from, { text }, { quoted: mek });

        // ╔═════════ ADDED BUTTONS MENU CHECK ═════════╗
        let isButtonReply = false;
        let buttonCommand = null;
        let selectedId = null;

        // 🚨 NEW LOGIC: Check if the message is a Button Response
        if (type === 'buttonsResponseMessage') {
            isButtonReply = true;
            buttonCommand = 'menu'; // We only use the 'menu' command for this type of response
            selectedId = mek.message.buttonsResponseMessage.selectedButtonId; // Extract the button ID (e.g., 'CAT_OWNER')
        }
        // ╚═══════════════════════════════════════════╝


        // --------------------------------------------------------------------------------
        // COMMAND EXECUTION BLOCK
        // Runs if it's a prefixed command (isCmd) OR a button was clicked (isButtonReply)
        // --------------------------------------------------------------------------------
        if (isCmd || isButtonReply) {
            
            let commandToExecute;
            let queryArguments;
            
            if (isCmd) {
                commandToExecute = commandName;
                queryArguments = q;
            } else if (isButtonReply) {
                commandToExecute = buttonCommand; // 'menu'
                queryArguments = selectedId;     // The Button ID (e.g., 'CAT_OWNER')
                
                // 🚨 CRITICAL FIX: Pass the Button ID as m.q for the plugin to read
                m.q = queryArguments; 
            }
            
            const cmd = commands.find((c) => c.pattern === commandToExecute || (c.alias && c.alias.includes(commandToExecute)));
            
            if (cmd) {
                if (cmd.react) zanta.sendMessage(from, { react: { text: cmd.react, key: mek.key } });
                try {
                    cmd.function(zanta, mek, m, {
                        // Pass the arguments correctly, using queryArguments for command input
                        from, quoted: mek, body, isCmd, command: commandToExecute, args: queryArguments ? [queryArguments] : args, q: queryArguments,
                        isGroup, sender, senderNumber, botNumber2, botNumber, pushname,
                        isMe, isOwner, groupMetadata, groupName, participants, groupAdmins,
                        isBotAdmins, isAdmins, reply,
                    });
                } catch (e) {
                    console.error("[PLUGIN ERROR]", e);
                }
            }
        }

        // ... (Reply Handler Block UNCHANGED) ...
    });
}

ensureSessionFile();

// ... (Express Server UNCHANGED) ...
