require('dotenv').config();

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const { DISCORD_TOKEN: token, CLIENT_ID: clientId, GUILD_ID: guildId } = process.env;

if (!token || !clientId || !guildId) {
  console.error('Missing DISCORD_TOKEN, CLIENT_ID, or GUILD_ID in .env.');
  process.exit(1);
}

const commands = [
  new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check whether the bot is responding'),
  new SlashCommandBuilder()
    .setName('event-suggest')
    .setDescription('Suggest a new event')
    .addStringOption((option) => option.setName('game').setDescription('Game or movie name').setRequired(true))
    .addStringOption((option) => option.setName('host').setDescription('Host and co-host names').setRequired(true))
    .addStringOption((option) => option.setName('availability').setDescription('Event days and available times').setRequired(true))
    .addStringOption((option) => option.setName('reward').setDescription('Points or other reward').setRequired(true))
    .addStringOption((option) => option.setName('plan').setDescription('Detailed event plan').setRequired(true)),
  new SlashCommandBuilder()
    .setName('point-log')
    .setDescription('Log an event placement and reward')
    .addUserOption((option) => option.setName('participant').setDescription('Discord participant').setRequired(true))
    .addStringOption((option) => option.setName('placement').setDescription('1st, 2nd, 3rd, or another placement').setRequired(true))
    .addIntegerOption((option) => option.setName('points').setDescription('Event points awarded').setMinValue(0).setRequired(true))
    .addStringOption((option) => option.setName('other_reward').setDescription('Non-point reward, if any'))
    .addStringOption((option) => option.setName('proof').setDescription('Proof of a non-point reward')),
  new SlashCommandBuilder()
    .setName('adjust-points')
    .setDescription('Adjust a participant event points')
    .addUserOption((option) => option.setName('participant').setDescription('Discord participant').setRequired(true))
    .addStringOption((option) => option.setName('action').setDescription('Add or remove points').setRequired(true)
      .addChoices(
        { name: 'Add points', value: 'add' },
        { name: 'Remove points', value: 'remove' },
      ))
    .addIntegerOption((option) => option.setName('points').setDescription('Number of points').setMinValue(0).setRequired(true))
    .addStringOption((option) => option.setName('reason').setDescription('Reason for the adjustment').setRequired(true)),
  new SlashCommandBuilder()
    .setName('points')
    .setDescription('Check event points')
    .addUserOption((option) => option.setName('participant').setDescription('Participant to check')),
  new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the event points leaderboard'),
].map((command) => command.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log(`Registered ${commands.length} command in guild ${guildId}.`);
})().catch((error) => {
  console.error('Failed to register commands:', error.message);
  process.exit(1);
});