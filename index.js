require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { Client, EmbedBuilder, GatewayIntentBits } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const dataPath = path.join(__dirname, 'data', 'points.json');

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
	fs.writeFileSync(dataPath, JSON.stringify(points, null, 2));
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

if (!token) {
	console.error('Missing DISCORD_TOKEN. Add it to a .env file.');
	process.exit(1);
}

const client = new Client({
	intents: [GatewayIntentBits.Guilds],
});

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
		if (interaction.commandName === 'ping') {
			await interaction.reply(`Pong! ${client.ws.ping}ms`);
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
			await interaction.reply({ embeds: [suggestionEmbed] });
			return;
		}

		if (interaction.commandName === 'point-log') {
			const participant = interaction.options.getUser('participant');
			const awarded = interaction.options.getInteger('points');
			points[participant.id] = (points[participant.id] || 0) + awarded;
			savePoints(pointsByGuild);
			const otherReward = interaction.options.getString('other_reward');
			const proof = interaction.options.getString('proof');
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
			await interaction.reply({ embeds: [logEmbed] });
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
			const adjustmentEmbed = new EmbedBuilder()
				.setColor(0x4f8cff)
				.setTitle('Points adjusted')
				.setDescription(`Your points have been adjusted to ${total} points. Your current rank is ${getRank(total)}.`)
				.setThumbnail(getRankBadgeUrl(total));
			try {
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
			await interaction.reply({ embeds: [actionEmbed] });
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
			await interaction.reply({
				embeds: [pointsEmbed],
				ephemeral: true,
			});
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
				: [new EmbedBuilder()
					.setColor(0xf0b429)
					.setTitle('Top 10 event points leaderboard')
					.setDescription('No event points have been recorded yet.')];
			await interaction.reply({ embeds: leaderboardEmbeds, ephemeral: true });
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
