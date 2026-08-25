# Pantheon Ranks Discord Bot

## Setup

1. Revoke the exposed token in the Discord Developer Portal and generate a new one.
2. Create or select an application at https://discord.com/developers/applications.
3. Open **Bot**, generate a new token, and copy it.
4. Copy `.env.example` to `.env` and set `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID`.
5. Install dependencies and register the test-server command:

```powershell
npm install discord.js dotenv
npm run register
npm start
```

The bot logs in with the `Guilds` intent and provides:

- `/event-suggest` to publish the game/movie, hosts, availability, reward, and event plan as an embed.
- `/point-log` to record a participant's placement, points, and optional non-point reward proof.
- `/adjust-points` for adding or removing points and notifying the participant by DM.
- `/points` for an individual total and tier.
- `/leaderboard` for the top 10 participants.
- `/achievements` for milestone badges and locked achievements.
- `/rank-card` for a participant's tier, server position, badge, and progress to the next tier.

All commands are available to members who can use the bot in the server. Point totals are stored in `data/points.json` separately for each server. The configured tiers are Bronze (1+), Silver (40+), Gold (80+), Platinum (120+), Diamond (160+), and Champion (300+). Never commit `.env` or share the token.
