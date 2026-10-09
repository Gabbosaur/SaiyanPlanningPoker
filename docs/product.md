# DBZ Planning Poker - Product Overview

## Project Purpose
A real-time web application that gamifies agile planning poker sessions with a Dragon Ball Z theme. The application enables distributed teams to collaboratively estimate story points in an engaging, interactive environment.

## Key Features
- **Real-time Multiplayer Sessions**: WebSocket-powered live collaboration with instant vote updates
- **Multiple Estimation Decks**: Fibonacci, Modified Fibonacci, and T-shirt sizing options
- **Avatar System**: Custom avatar uploads with file validation and management
- **Session Management**: Create, join, and manage planning poker sessions with unique IDs
- **Vote Revelation System**: Simultaneous vote reveal with animated transitions
- **Spectator Mode**: Join and watch without taking part in the vote
- **Consensus Streak**: Table aura that escalates with consecutive unanimous rounds
- **Responsive Design**: Mobile-friendly interface with Tailwind CSS styling
- **Audio Integration**: Dragon Ball Z themed background music and sound effects
- **Visual Feedback**: Animated cards, vote indicators, and notification system

### Touchless Control (Ki Control)
- **Hand-gesture UI control**: Opt-in webcam mode where an on-screen ki pointer follows your hand and a closed fist acts as a click. All inference runs on-device, so **video never leaves the browser**.
- **Magnetic card dock**: The card under the pointer grows while neighbours slide aside, making selection easy without a mouse.
- **Accidental-input safeguards**: Edge-triggered clicks, dwell time, cooldowns, and a hold-to-confirm gesture for the destructive reset action.

### Playful Interactions
- **Punches**: Click a teammate's avatar to land a punch, with impact effects everyone sees.
- **Grab & throw**: Close your fist on an avatar to grab, drag and fling it, with spring physics and wall-impact effects. Server-enforced limits prevent abuse (cooldowns, auto-release, no interrupting someone who is still voting).
- **Sticker reactions**: Unlockable reaction packs, broadcast to the session with motion that matches the emotion (a laugh wobbles, a surprise snaps in).
- **Collective rituals**: Some effects can only be triggered by several people acting together, turning them into a small team ceremony.
- **Seasonal themes**: Monthly, Halloween and Christmas variants.

### Hidden Content
The app contains a number of easter eggs: secret typed commands, gesture
combinations and unlockables tied to the display name you choose.

**These are deliberately left undocumented.** Discovering them is part of the
experience, and spelling out the triggers would remove the surprise that makes
them worth having. They're also a reason to revisit the app and to pick a
playful name. The implementation details live in the code for maintainers;
`docs/structure.md` covers how to extend the unlockable content without listing
the triggers themselves.

## Target Users
- **Agile Development Teams**: Scrum masters and development teams conducting sprint planning
- **Remote Teams**: Distributed teams needing collaborative estimation tools
- **Dragon Ball Z Fans**: Teams who appreciate themed, engaging planning sessions
- **Project Managers**: Leaders facilitating story point estimation meetings

## Value Proposition
Transforms mundane planning poker sessions into engaging, themed experiences while maintaining professional estimation accuracy. Combines nostalgia with productivity to increase team participation and make agile ceremonies more enjoyable.

The touchless Ki Control mode adds a genuinely novel interaction layer: on-device hand tracking turns the webcam into an input device with no extra hardware, no install, and no privacy trade-off since no video is ever transmitted.

## Requirements & Constraints
- **Webcam features are opt-in.** Ki Control and the Genkidama ritual need camera permission and are off by default.
- **Secure context required**: `getUserMedia` only works over HTTPS or on `localhost`.
- **Model download**: Hand and pose models are fetched from a CDN on first activation, so the first use needs network access and a few seconds to warm up.
- **Genkidama needs company**: the ritual counts only users running Ki Control and requires at least two of them (a local override exists for solo testing).