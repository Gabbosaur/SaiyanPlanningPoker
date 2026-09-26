# Saiyan Planning Poker

A web app for agile teams to estimate tasks using a fun Dragon Ball Z theme.

## Features

- Real-time multiplayer planning poker sessions
- Multiple estimation decks (Fibonacci, Modified Fibonacci, T-shirt sizes)
- Themed avatars with custom image upload
- Session management (create, join, invite link)
- Simultaneous vote reveal with mode, average and consensus
- Spectator mode for people who watch without voting
- Consensus streak: the table aura escalates with consecutive unanimous rounds
- Seasonal themes (monthly, Halloween, Christmas) and a built-in music player
- Responsive UI for desktop and mobile

### Ki Control (touchless, webcam)

Optional mode that lets you drive the interface with hand gestures:

- An on-screen ki pointer follows your hand; **close your fist to click**
- Vote cards magnify as the pointer approaches, so they're easy to hit
- Destructive actions (like resetting the round) need a held gesture to confirm
- **Everything runs on-device. No video is ever sent anywhere.**

Toggle it with the ✋ button in the header. Requires camera permission, and a
secure context (HTTPS or `localhost`).

### Easter eggs

- **Punch** a teammate by clicking their avatar; spam your own to go Super Saiyan
- **Grab & throw**: with Ki Control on, close your fist on an avatar to grab, sling
  and slam it around (with server-side limits so it can't be abused)
- **Kamehameha**: type `kamehameha` to charge and fire
- **Genkidama**: everyone on Ki Control raises their arms to donate energy; the
  sphere grows with the number of raised arms until the ritual completes
- **Konami code**: ↑ ↑ ↓ ↓ ← → ← → B A

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm

### Installation

```bash
git clone https://github.com/Gabbosaur/SaiyanPlanningPoker.git
cd SaiyanPlanningPoker
npm install
```

### Running the App

```bash
npm start      # production
npm run dev    # with auto-reload
```

Visit `http://localhost:3000` in your browser.

### Tests

```bash
npm test
```

## Usage

1. Create or join a session (share the invite link with your team).
2. Pick your estimate for the story.
3. Votes reveal once everyone has voted.
4. Discuss, then reset for the next round.

## Technologies

- Node.js / Express
- Socket.IO for real-time communication
- Vanilla JavaScript and Tailwind CSS on the frontend (no build step)
- MediaPipe Tasks Vision for on-device hand and pose tracking
- Jest for tests

See [`docs/`](docs) for architecture, conventions and a deeper technical
overview.

## Contributing

Pull requests are welcome! Please open an issue first to discuss changes.

## License

MIT

---
*This project is not affiliated with or endorsed by Toei Animation or the Dragon Ball franchise.*
