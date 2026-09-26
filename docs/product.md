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
- **Punches & Super Saiyan**: Click a teammate's avatar to land a punch; spam your own to transform.
- **Grab & throw**: Close your fist on an avatar to grab, drag and fling it, with spring physics and wall-impact effects. Server-enforced limits prevent abuse (cooldowns, auto-release, no interrupting someone who is still voting).
- **Kamehameha**: Type the name to charge and fire a screen-crossing beam that knocks everyone back.
- **Genkidama**: A collective ritual. Users on Ki Control raise their arms to donate energy; the sphere grows with the number of raised arms and the ceremony fires when everyone commits. Purely ceremonial, it changes no game state.
- **Konami code**: Transforms your avatar and triggers a full-screen Super Saiyan 2 spectacle for the whole session.
- **Seasonal themes**: Monthly, Halloween and Christmas variants.

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