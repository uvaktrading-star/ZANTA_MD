const { updateSetting } = require('./bot_db'); 
const { cmd } = require('../command'); 

const updateNotify = async (reply, successMessage) => {
    await reply(successMessage + '\n\n✅ යාවත්කාලීන කිරීම් ක්‍රියාත්මක විය.');
};

cmd({
    pattern: 'setbotname',
    category: 'Settings',
    desc: 'Bot නාමය වෙනස් කරයි.',
    fromMe: true,
    react: '⚙️'
}, async (client, message, m, { command, args, isOwner, reply }) => {
    if (!isOwner) return reply('🚫 මෙය Bot Owner ට පමණි.');
    const newName = args.join(' ');
    if (!newName) return reply(`භාවිතය: .${command} [නව නම]`);

    if (await updateSetting('botName', newName)) {
        global.CURRENT_BOT_SETTINGS.botName = newName; 
        await updateNotify(reply, `✅ Bot නාමය *${newName}* ලෙස වෙනස් කරන ලදී.`);
    } else {
        await reply('❌ Database ගැටලුවකි.');
    }
});

cmd({
    pattern: 'setownername',
    category: 'Settings',
    desc: 'Bot Owner නාමය වෙනස් කරයි.',
    fromMe: true,
    react: '👤'
}, async (client, message, m, { command, args, isOwner, reply }) => {
    if (!isOwner) return reply('🚫 මෙය Bot Owner ට පමණි.');
    const newName = args.join(' ');
    if (!newName) return reply(`භාවිතය: .${command} [නව නම]`);

    if (await updateSetting('ownerName', newName)) {
        global.CURRENT_BOT_SETTINGS.ownerName = newName; 
        await reply(`✅ Owner නාමය *${newName}* ලෙස වෙනස් කරන ලදී.`);
    } else {
        await reply('❌ Database ගැටලුවකි.');
    }
});

cmd({
    pattern: 'setprefix',
    category: 'Settings',
    desc: 'Bot Prefix එක වෙනස් කරයි.',
    fromMe: true,
    react: '🅿️'
}, async (client, message, m, { command, args, isOwner, reply }) => {
    if (!isOwner) return reply('🚫 මෙය Bot Owner ට පමණි.');
    const newPrefix = args[0] || '';
    if (!newPrefix || newPrefix.length > 2) return reply(`භාවිතය: .${command} [!]`);

    if (await updateSetting('prefix', newPrefix)) {
        global.CURRENT_BOT_SETTINGS.prefix = newPrefix; 
        await updateNotify(reply, `✅ Bot Prefix එක *${newPrefix}* ලෙස වෙනස් කරන ලදී.`);
    } else {
        await reply('❌ Database ගැටලුවකි.');
    }
});
