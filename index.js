require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client, EmbedBuilder, GatewayIntentBits, MessageFlags } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const dataPath = path.join(__dirname, 'data', 'points.json');
const interactionLockPath = path.join(__dirname, 'data', 'interaction-locks');
const instanceLockPath = path.join(__dirname, 'data', 'bot-instance.lock');

function loadPoints() {
  try {
    return JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not load points:', error.message);
    return {};
  }
}

function savePoints(points) {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  const temporaryPath = `${dataPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(points, null, 2));
  fs.renameSync(temporaryPath, dataPath);
}

function claimBotInstance() {
  fs.mkdirSync(path.dirname(instanceLockPath), { recursive: true });
  try {
    fs.writeFileSync(instanceLockPath, process.pid.toString(), { flag: 'wx' });
    return true;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;

    const existingPid = Number(fs.readFileSync(instanceLockPath, 'utf8'));
    if (Number.isInteger(existingPid) && existingPid > 0) {
      try {
        process.kill(existingPid, 0);
        return false;
      } catch (processError) {
        if (processError.code !== 'ESRCH') throw processError;
      }
    }
    fs.unlinkSync(instanceLockPath);
    return claimBotInstance();
  }
}

function releaseBotInstance() {
  try {
    if (Number(fs.readFileSync(instanceLockPath, 'utf8')) === process.pid) fs.unlinkSync(instanceLockPath);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Could not release bot instance lock:', error.message);
  }
}

function claimInteraction(interactionId) {
  fs.mkdirSync(interactionLockPath, { recursive: true });
  const lockPath = path.join(interactionLockPath, interactionId);
  try {
    fs.writeFileSync(lockPath, Date.now().toString(), { flag: 'wx' });
    return true;
  } catch (error) {
    if (error.code === 'EEXIST') return false;
    throw error;
  }
}

function getRank(points) {
  if (points >= 300) return 'Champion Winner';
  if (points >= 160) return 'Diamond Winner';
  if (points >= 120) return 'Platinum Winner';
  if (points >= 80) return 'Gold Winner';
  if (points >= 40) return 'Silver Winner';
  return 'Bronze Winner';
}

function getRankBadgeUrl(points) {
  if (points >= 300) return 'https://cdn.discordapp.com/emojis/1530365829995171870.png?size=128';
  if (points >= 160) return 'https://cdn.discordapp.com/emojis/1530365809828958299.png?size=128';
  if (points >= 120) return 'https://cdn.discordapp.com/emojis/1530365781060227143.png?size=128';
  if (points >= 80) return 'https://cdn.discordapp.com/emojis/1530365740165763252.png?size=128';
  if (points >= 40) return 'https://cdn.discordapp.com/emojis/1530365762567540796.png?size=128';
  return 'https://cdn.discordapp.com/emojis/1530365619206095122.png?size=128';
}

function formatPoints(points) {
  return `${points} points | ${getRank(points)} tier`;
}

const rankThresholds = [
  { name: 'Bronze Winner', points: 0 },
  { name: 'Silver Winner', points: 40 },
  { name: 'Gold Winner', points: 80 },
  { name: 'Platinum Winner', points: 120 },
  { name: 'Diamond Winner', points: 160 },
  { name: 'Champion Winner', points: 300 },
];

const achievementDefinitions = [
  { name: 'First Points', icon: '🎯', requirement: 1, description: 'Earn your first point.' },
  { name: 'Silver Winner', icon: '🥈', requirement: 40, description: 'Reach the Silver tier.' },
  { name: 'Gold Winner', icon: '🥇', requirement: 80, description: 'Reach the Gold tier.' },
  { name: 'Centurion', icon: '💯', requirement: 100, description: 'Earn 100 total points.' },
  { name: 'Platinum Winner', icon: '💎', requirement: 120, description: 'Reach the Platinum tier.' },
  { name: 'Diamond Winner', icon: '🔷', requirement: 160, description: 'Reach the Diamond tier.' },
  { name: 'Champion', icon: '🏆', requirement: 300, description: 'Reach the Champion tier.' },
];

function getRankProgress(points) {
  const currentIndex = rankThresholds.findLastIndex((rank) => points >= rank.points);
  const current = rankThresholds[currentIndex];
  const next = rankThresholds[currentIndex + 1];
  if (!next) return { current, next: null, percent: 100, remaining: 0 };
  const range = next.points - current.points;
  const progress = points - current.points;
  return {
    current,
    next,
    percent: Math.min(100, Math.floor((progress / range) * 100)),
    remaining: next.points - points,
  };
}

function makeProgressBar(percent) {
  const filled = Math.round(percent / 10);
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)} ${percent}%`;
}

if (!token) {
  console.error('Missing DISCORD_TOKEN. Add it to a .env file.');
  process.exit(1);
}

if (!claimBotInstance()) {
  console.error('Another bot instance is already running. Stop it before starting this instance.');
  process.exit(1);
}

process.once('exit', releaseBotInstance);
process.once('SIGINT', () => process.exit(0));
process.once('SIGTERM', () => process.exit(0));
process.once('uncaughtException', (error) => {
  console.error('Uncaught bot error:', error);
  releaseBotInstance();
  process.exit(1);
});
process.once('unhandledRejection', (error) => {
  console.error('Unhandled bot rejection:', error);
  releaseBotInstance();
  process.exit(1);
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

console.log(`Starting bot instance ${process.pid}`);

const pointsByGuild = loadPoints();

function getGuildPoints(guildId) {
  if (!pointsByGuild[guildId]) pointsByGuild[guildId] = {};
  return pointsByGuild[guildId];
}

client.once('clientReady', (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (!claimInteraction(interaction.id)) return;
    const isPrivateCommand = ['points', 'leaderboard', 'achievements', 'rank-card'].includes(interaction.commandName);
    await interaction.deferReply({ flags: isPrivateCommand ? MessageFlags.Ephemeral : undefined });

    if (interaction.commandName === 'ping') {
      await interaction.editReply(`Pong! ${client.ws.ping}ms`);
      return;
    }

    const points = getGuildPoints(interaction.guildId);

    if (interaction.commandName === 'event-suggest') {
      const options = interaction.options;
      const suggestionEmbed = new EmbedBuilder()
        .setColor(0x45c486)
        .setTitle('Event suggestion')
        .addFields(
          { name: 'Game or movie', value: options.getString('game'), inline: true },
          { name: 'Host or co host', value: options.getString('host'), inline: true },
          { name: 'Days and times', value: options.getString('availability') },
          { name: 'Reward', value: options.getString('reward'), inline: true },
          { name: 'Event plan', value: options.getString('plan') },
        )
        .setFooter({ text: `Suggested by ${interaction.user.tag}` })
        .setTimestamp();
      await interaction.editReply({ embeds: [suggestionEmbed] });
      return;
    }

    if (interaction.commandName === 'point-log') {
      const participant = interaction.options.getUser('participant');
      const awarded = interaction.options.getInteger('points');
      points[participant.id] = (points[participant.id] || 0) + awarded;
      savePoints(pointsByGuild);
      const logEmbed = new EmbedBuilder()
        .setColor(0x4f8cff)
        .setTitle('Event points logged')
        .setDescription(`<@${participant.id}> received **${awarded} point${awarded === 1 ? '' : 's'}**.`)
        .setThumbnail(getRankBadgeUrl(points[participant.id]))
        .addFields(
          { name: 'Placement', value: interaction.options.getString('placement'), inline: true },
          { name: 'New total', value: formatPoints(points[participant.id]), inline: true },
        )
        .setFooter({ text: `Logged by ${interaction.user.tag}` })
        .setTimestamp();
      const otherReward = interaction.options.getString('other_reward');
      const proof = interaction.options.getString('proof');
      if (otherReward) logEmbed.addFields({ name: 'Other reward', value: otherReward });
      if (proof) logEmbed.addFields({ name: 'Proof of reward', value: proof });
      try {
        const receiptEmbed = new EmbedBuilder()
          .setColor(0x4f8cff)
          .setTitle('Event points received')
          .setDescription(`You have received ${awarded} point${awarded === 1 ? '' : 's'}. Your current rank is ${getRank(points[participant.id])}.`)
          .setThumbnail(getRankBadgeUrl(points[participant.id]));
        await participant.send({ embeds: [receiptEmbed] });
      } catch (error) {
        console.warn(`Could not DM ${participant.tag}: ${error.message}`);
      }
      await interaction.editReply({ embeds: [logEmbed] });
      return;
    }

    if (interaction.commandName === 'adjust-points') {
      const participant = interaction.options.getUser('participant');
      const amount = interaction.options.getInteger('points');
      const action = interaction.options.getString('action');
      const adjustment = action === 'remove' ? -amount : amount;
      points[participant.id] = Math.max(0, (points[participant.id] || 0) + adjustment);
      savePoints(pointsByGuild);
      const total = points[participant.id];
      try {
        const adjustmentEmbed = new EmbedBuilder()
          .setColor(0x4f8cff)
          .setTitle('Points adjusted')
          .setDescription(`Your points have been adjusted to ${total} points. Your current rank is ${getRank(total)}.`)
          .setThumbnail(getRankBadgeUrl(total));
        await participant.send({ embeds: [adjustmentEmbed] });
      } catch (error) {
        console.warn(`Could not DM ${participant.tag}: ${error.message}`);
      }
      const actionEmbed = new EmbedBuilder()
        .setColor(action === 'remove' ? 0xd95f59 : 0x45c486)
        .setTitle('Points adjusted')
        .setDescription(`<@${participant.id}> now has ${formatPoints(total)}.`)
        .addFields(
          { name: 'Action', value: action === 'remove' ? 'Points removed' : 'Points added', inline: true },
          { name: 'Amount', value: `${amount} point${amount === 1 ? '' : 's'}`, inline: true },
          { name: 'Reason', value: interaction.options.getString('reason') },
        )
        .setThumbnail(getRankBadgeUrl(total));
      await interaction.editReply({ embeds: [actionEmbed] });
      return;
    }

    if (interaction.commandName === 'points') {
      const selectedParticipant = interaction.options.getUser('participant');
      const participant = selectedParticipant || interaction.user;
      const total = points[participant.id] || 0;
      const serverRank = Object.values(points).filter((score) => score > total).length + 1;
      const serverSize = interaction.guild?.memberCount || Object.keys(points).length;
      const pointsEmbed = new EmbedBuilder()
        .setColor(0x4f8cff)
        .setTitle(selectedParticipant ? `${participant.tag}'s event points` : 'Your event points')
        .setDescription(`<@${participant.id}> has ${formatPoints(total)}.`)
        .addFields({ name: 'Current server rank', value: `${serverRank} out of ${serverSize}` })
        .setThumbnail(getRankBadgeUrl(total));
      await interaction.editReply({ embeds: [pointsEmbed] });
      return;
    }

    if (interaction.commandName === 'achievements') {
      const selectedParticipant = interaction.options.getUser('participant');
      const participant = selectedParticipant || interaction.user;
      const total = points[participant.id] || 0;
      const unlocked = achievementDefinitions.filter((achievement) => total >= achievement.requirement);
      const locked = achievementDefinitions.filter((achievement) => total < achievement.requirement);
      const achievementEmbed = new EmbedBuilder()
        .setColor(0xf0b429)
        .setTitle(`${participant.username}'s achievements`)
        .setDescription(`${formatPoints(total)}\n\n**Unlocked: ${unlocked.length}/${achievementDefinitions.length}**`)
        .setThumbnail(participant.displayAvatarURL({ extension: 'png', size: 256 }));
      if (unlocked.length) achievementEmbed.addFields({ name: 'Unlocked', value: unlocked.map((achievement) => `${achievement.icon} **${achievement.name}**\n${achievement.description}`).join('\n\n') });
      if (locked.length) achievementEmbed.addFields({ name: 'Still to earn', value: locked.map((achievement) => `🔒 **${achievement.name}** - ${achievement.requirement - total} more point${achievement.requirement - total === 1 ? '' : 's'}`).join('\n') });
      await interaction.editReply({ embeds: [achievementEmbed] });
      return;
    }

    if (interaction.commandName === 'rank-card') {
      const selectedParticipant = interaction.options.getUser('participant');
      const participant = selectedParticipant || interaction.user;
      const total = points[participant.id] || 0;
      const serverRank = Object.values(points).filter((score) => score > total).length + 1;
      const progress = getRankProgress(total);
      const refreshedGuild = await interaction.guild.fetch({ withCounts: true });
      const serverSize = refreshedGuild.approximateMemberCount || refreshedGuild.memberCount || Object.keys(points).length;
      console.log(`Rank card server: ${interaction.guild.name} | ${interaction.guild.id} | ${serverSize} members`);
      const rankCardEmbed = new EmbedBuilder()
        .setColor(0x45c486)
        .setAuthor({ name: participant.tag, iconURL: participant.displayAvatarURL({ extension: 'png', size: 128 }) })
        .setTitle('Pantheon Rank Card')
        .setDescription(`## ${progress.current.name}\n${formatPoints(total)}`)
        .setThumbnail(getRankBadgeUrl(total))
        .addFields(
          { name: 'Server position', value: `#${serverRank} of ${serverSize}`, inline: true },
          { name: 'Achievements', value: `${achievementDefinitions.filter((achievement) => total >= achievement.requirement).length}/${achievementDefinitions.length}`, inline: true },
          { name: progress.next ? `Progress to ${progress.next.name}` : 'Maximum tier reached', value: progress.next ? `${makeProgressBar(progress.percent)}\n**${progress.remaining}** points remaining` : '🏆 You have reached the highest tier.' },
        )
        .setFooter({ text: 'Keep showing up. Keep climbing.' })
        .setTimestamp();
      await interaction.editReply({ embeds: [rankCardEmbed] });
      return;
    }

    if (interaction.commandName === 'leaderboard') {
      const entries = Object.entries(points).sort(([, left], [, right]) => right - left).slice(0, 10);
      const leaderboardEmbeds = entries.length
        ? entries.map(([userId, total], index) => new EmbedBuilder()
          .setColor(0xf0b429)
          .setTitle(`${index + 1}. ${interaction.guild?.members.cache.get(userId)?.displayName || 'Participant'}`)
          .setDescription(`<@${userId}> has ${formatPoints(total)}.`)
          .setThumbnail(getRankBadgeUrl(total))
          .setFooter({ text: 'Top 10 event points leaderboard' }))
        : [new EmbedBuilder().setColor(0xf0b429).setTitle('Top 10 event points leaderboard').setDescription('No event points have been recorded yet.')];
      await interaction.editReply({ embeds: leaderboardEmbeds });
    }
  } catch (error) {
    if (error.code === 10062) return;
    console.error('Interaction failed:', error);
    try {
      if (interaction.replied || interaction.deferred) await interaction.followUp({ content: 'Something went wrong while processing that command.', ephemeral: true });
      else if (interaction.isRepliable()) await interaction.reply({ content: 'Something went wrong while processing that command.', ephemeral: true });
    } catch (responseError) {
      if (responseError.code !== 10062) console.error('Could not report interaction failure:', responseError.message);
    }
  }
});

client.login(token).catch((error) => {
  if (error.code === 'TokenInvalid') {
    console.error('Discord rejected the token. Generate a new bot token in the Developer Portal.');
  } else {
    console.error('Discord login failed:', error.message);
  }
  process.exitCode = 1;
});