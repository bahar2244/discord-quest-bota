require('dotenv').config();
const { 
    Client, 
    GatewayIntentBits, 
    REST, 
    Routes, 
    SlashCommandBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    EmbedBuilder 
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'database.json');

// ডাটাবেস পড়ার ফাংশন
function getDB() {
    if (!fs.existsSync(dbPath)) fs.writeFileSync(dbPath, '{}');
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

// ডাটাবেসে সেভ করার ফাংশন
function saveDB(data) {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// স্ল্যাশ কমান্ড তৈরি
const commands = [
    new SlashCommandBuilder()
        .setName('quest')
        .setDescription('একটি কোয়েস্ট সম্পন্ন করে ৩ দিনের প্রিমিয়াম জিতে নিন!'),
    new SlashCommandBuilder()
        .setName('status')
        .setDescription('আপনার বর্তমান প্রিমিয়াম মেয়াদের তথ্য দেখুন')
].map(command => command.toJSON());

// বট চালু হলে কমান্ড রেজিস্টার করা
client.once('ready', async () => {
    console.log(`🤖 বট সফলভাবে লগইন হয়েছে: ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
        console.log('✅ স্ল্যাশ কমান্ড সফলভাবে রেজিস্টার করা হয়েছে!');
    } catch (error) {
        console.error('কমান্ড রেজিস্টার করতে সমস্যা হয়েছে:', error);
    }

    // প্রতি ১০ মিনিট পর পর প্রিমিয়াম এক্সপায়ারি চেক করা
    setInterval(checkExpiredPremiums, 10 * 60 * 1000);
});

// ইন্টারঅ্যাকশন হ্যান্ডলার
client.on('interactionCreate', async (interaction) => {
    const db = getDB();

    // ১. /quest কমান্ড হ্যান্ডলার
    if (interaction.isChatInputCommand() && interaction.commandName === 'quest') {
        const userId = interaction.user.id;
        const now = Date.now();

        // ইউজার ইতিমধ্যে প্রিমিয়াম কিনা চেক
        if (db[userId] && db[userId].expiresAt > now) {
            const remainingDays = Math.ceil((db[userId].expiresAt - now) / (1000 * 60 * 60 * 24));
            return interaction.reply({ 
                content: `❌ আপনার ইতিমধ্যে প্রিমিয়াম এক্সেস রয়েছে! বাকি আছে আর প্রায় **${remainingDays} দিন**।`, 
                ephemeral: true 
            });
        }

        // কোয়েস্ট এম্বেড
        const questEmbed = new EmbedBuilder()
            .setTitle('🎯 স্পেশাল ডিসকর্ড কোয়েস্ট!')
            .setDescription('নিচের বাটনে ক্লিক করে কোয়েস্ট সম্পন্ন করুন এবং জিতে নিন **৩ দিনের জন্য প্রিমিয়াম এক্সেস**!')
            .setColor(0x00FF99)
            .setFooter({ text: 'মেয়াদ: ৩ দিন (৭২ ঘণ্টা)' });

        const questButton = new ButtonBuilder()
            .setCustomId('claim_quest')
            .setLabel('Claim 3 Days Premium')
            .setStyle(ButtonStyle.Success)
            .setEmoji('🎁');

        const row = new ActionRowBuilder().addComponents(questButton);

        await interaction.reply({ embeds: [questEmbed], components: [row], ephemeral: true });
    }

    // ২. কোয়েস্ট বাটন ক্লিক হ্যান্ডলার
    if (interaction.isButton() && interaction.customId === 'claim_quest') {
        const userId = interaction.user.id;
        const member = interaction.member;
        const roleId = process.env.PREMIUM_ROLE_ID;
        const now = Date.now();

        if (db[userId] && db[userId].expiresAt > now) {
            return interaction.reply({ content: '❌ আপনি ইতিমধ্যে প্রিমিয়াম নিয়ে নিয়েছেন!', ephemeral: true });
        }

        // ৩ দিন = ৩ * ২৪ * ৬০ * ৬০ * ১০০০ মিলিসেকেন্ড
        const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
        const expiresAt = now + THREE_DAYS;

        try {
            // প্রিমিয়াম রোল যুক্ত করা
            await member.roles.add(roleId);

            // ডাটাবেসে সেভ করা
            db[userId] = {
                expiresAt: expiresAt,
                claimedAt: now
            };
            saveDB(db);

            await interaction.update({
                content: `🎉 **অভিনন্দন!** কোয়েস্ট সম্পন্ন হয়েছে। আপনাকে **৩ দিনের জন্য প্রিমিয়াম এক্সেস** দেওয়া হয়েছে!`,
                embeds: [],
                components: []
            });
        } catch (error) {
            console.error('রোল দেওয়ার সময় সমস্যা হয়েছে:', error);
            await interaction.reply({ content: '⚠️ রোল দেওয়া সম্ভব হয়নি! বটের পারমিশন চেক করুন।', ephemeral: true });
        }
    }

    // ৩. /status কমান্ড হ্যান্ডলার
    if (interaction.isChatInputCommand() && interaction.commandName === 'status') {
        const userId = interaction.user.id;
        const now = Date.now();

        if (db[userId] && db[userId].expiresAt > now) {
            const timeLeft = db[userId].expiresAt - now;
            const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
            interaction.reply({ content: `✨ আপনার প্রিমিয়াম এক্সেস মেয়াদ শেষ হতে বাকি আছে: **${hoursLeft} ঘণ্টা**।`, ephemeral: true });
        } else {
            interaction.reply({ content: `❌ আপনার কোনো একটিভ প্রিমিয়াম নেই। কোয়েস্ট পেতে \`/quest\` ব্যবহার করুন।`, ephemeral: true });
        }
    }
});

// ৩ দিন পার হলে রোল রিমুভ করার ফাংশন
async function checkExpiredPremiums() {
    const db = getDB();
    const now = Date.now();
    const guild = await client.guilds.fetch(process.env.GUILD_ID).catch(() => null);

    if (!guild) return;

    for (const userId of Object.keys(db)) {
        if (db[userId].expiresAt <= now) {
            try {
                const member = await guild.members.fetch(userId).catch(() => null);
                if (member) {
                    await member.roles.remove(process.env.PREMIUM_ROLE_ID);
                    member.send('⏰ আপনার ৩ দিনের প্রিমিয়াম এক্সেসের মেয়াদ শেষ হয়ে গেছে! আবার কোয়েস্ট চালু হলে জয়েন করুন।').catch(() => {});
                    console.log(`রোল রিমুভ করা হয়েছে: ${member.user.tag}`);
                }
                // ডাটাবেস থেকে ডিলিট
                delete db[userId];
                saveDB(db);
            } catch (err) {
                console.error(`রোল রিমুভ করতে সমস্যা: ${userId}`, err);
            }
        }
    }
}

client.login(process.env.DISCORD_TOKEN);