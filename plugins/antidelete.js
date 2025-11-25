// Antidelete Logic එකට zanta object එක index.js එකේ Plugin Loader එක මඟින් ලැබිය යුතුයි
module.exports = zanta => {
  
  // 👈 Baileys 'messages.delete' Event Listener එක නිවැරදි කර ඇත
  zanta.ev.on('messages.delete', async (messageData) => { 
    try {
      // 1. Basic checks
      if (!messageData || !messageData.keys || messageData.keys.length === 0) return;
      
      const deleteKey = messageData.keys[0];  
      // Bot එක delete කළ message නම් නොසලකා හරියි
      if (deleteKey.fromMe) return; 

      // 2. Fetch deleted message from cache (zanta.messages වෙතින් ලබා ගනී)
      const deletedMessage = zanta.messages.get(deleteKey.id);
      
      if (!deletedMessage) {
        // Message එක cache එකේ නොතිබුනහොත් (උදා: Bot එක start කිරීමට පෙර යැවූ ඒවා)
        return; 
      }

      // 3. Extract sender and chat info
      const isGroup = deleteKey.remoteJid.endsWith('@g.us');
      const senderJid = deletedMessage.key.participant || deletedMessage.key.remoteJid;  
      const senderNumber = senderJid.replace('@s.whatsapp.net', '');

      let text = "Message Content Not Found"; // Default text

      // 4. Extract Message Content
      if (deletedMessage.message) {
        // Ephemeral Message (View Once/Disappearing) Check
        const effectiveMessage = deletedMessage.message.ephemeralMessage 
                                 ? deletedMessage.message.ephemeralMessage.message 
                                 : deletedMessage.message;
                                 
        const messageType = Object.keys(effectiveMessage)[0];
        const content = effectiveMessage[messageType];
        
        // Message Type එක අනුව Content extract කිරීම
        switch (messageType) {
          case 'conversation':
          case 'extendedTextMessage':
            text = content.text || content.caption || 'No Text Content';
            break;
          case 'imageMessage':
            text = `PHOTO 🖼️`;
            if (content.caption) {
                text += `\n*Caption:* ${content.caption}`;
            }
            break;
          case 'videoMessage':
            text = `VIDEO 🎥`;
            if (content.caption) {
                text += `\n*Caption:* ${content.caption}`;
            }
            break;
          case 'stickerMessage':
            text = "STICKER 🌟";
            break;
          case 'documentMessage':
            text = `DOCUMENT 📄 (${content.fileName || 'No Name'})`;
            break;
          case 'audioMessage':
            text = "AUDIO 🎤";
            break;
          case 'contactMessage':
            text = `CONTACT 📞: ${content.displayName || 'No Name'}`;
            break;
          case 'locationMessage':
            text = `LOCATION 📍`;
            break;
          default:
            text = `TYPE: ${messageType}`;
        }
      }
      
      // 5. Create and Send the Notification Message
      const deleteNotification = `
*🚫 MESSAGE DELETED!*
*👤 Sender:* @${senderJid.split('@')[0]}
*📱 Number:* ${senderNumber}
*🗑️ Deleted Content:*
--------------------------------
${text}
--------------------------------
      `;

      await zanta.sendMessage(
        deleteKey.remoteJid, // Send back to the original chat/group
        {
          text: deleteNotification,
          mentions: [senderJid] // Mention the user who deleted the message
        }, 
        // ❌ Note: Deleted media messages (photos/videos) cannot be resent easily 
        // using just the quoted message object without downloading and re-uploading the file.
        // We will only quote the message text for simplicity.
        { quoted: deletedMessage } 
      );

    } catch (error) {
      console.error("Error in AntiDelete Plugin:", error);
    }
  });
};
