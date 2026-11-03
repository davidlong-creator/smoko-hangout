# 🎮 Games — Online Edition

The full games app (Poker, Werewolf/Mafia, Chess) with **true online multiplayer**:
friends on separate devices join with a 4-letter room code or invite link.

## Play online
1. Open the hosted app (the live preview link, NOT a downloaded file).
2. Scroll to **🌐 Play Online With Friends**, enter your name, pick a game, **Create Online Room**.
3. Share the **room code** or **🔗 Invite link**. Friends open it, enter a name, and **Join Room**.
4. Add bots for empty seats if you like, then the host hits **Start Game**.

### What's online
- **Poker**: 5-Card Draw / Texas Hold'em / Omaha, 2–10 players, bots fill seats, secret cards per player.
- **Werewolf/Mafia**: 5–10 players, secret role per device, night actions & votes on each phone, wolves-only pack chat (server-enforced).
- **Chess**: standard chess (server-validated legal moves, AI seats available) and Chess Royale for 3–5 players.

The offline modes from the original app (solo vs AI, pass-and-play, tutorials) still work in the hosted copy too.

## Party communication
- Open **🎉 Party** in an online room for text chat with clickable file/download links.
- Choose **Everyone**, a private one-to-one conversation, or create a private group with selected players. The server filters private messages by recipient.
- Upload a profile picture from the online setup or the Party 📷 button. Images are cropped and resized in the browser before sharing.
- The **Voice & screen** tab opens a private Jitsi Meet room for the game room, so players can talk and share screens from different locations. This requires internet access and microphone/screen permissions.

## Run it yourself
```bash
npm install
npm start   # http://localhost:3000
```
If the preview ever says the game is asleep, ask the host agent to restart the server.
