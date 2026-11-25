# Sippy: Cozy Hydration Pet for VS Code

Sippy is a tiny penguin who lives in a turquoise virtual-pet egg in your **Explorer sidebar**. Log your water, feed her snacks, play with her, and she reacts while you code. Drink enough and she glows; forget about her and she gets thirsty.

<p align="center">
  <img src="docs/preview-sidebar.png" alt="Sippy's Room in the VS Code Explorer sidebar" width="300">
</p>

## Install

Sippy isn't on the Marketplace yet, so you install her from a `.vsix` file.

1. Install [Node.js](https://nodejs.org) if you don't have it.
2. In this folder, build the package:
   ```bash
   npx @vscode/vsce package
   ```
   This creates `sippy-water-pet-<version>.vsix`.
3. In VS Code, open the **Extensions** view (`Ctrl+Shift+X`), click the **`...`** menu at the top, and choose **Install from VSIX...**. Pick the `.vsix` file.
4. Run **Developer: Reload Window** (`Ctrl+Shift+P`, then type "reload window").

To update later, build and install the new `.vsix` the same way, then reload.

## Find Sippy

1. Open the **Explorer** (`Ctrl+Shift+E`).
2. Expand **Sippy's Room** at the bottom.
3. Optional: drag the section header to move it (for example, below Timeline), or drag its border to resize it.

## Use Sippy

<p align="center">
  <img src="docs/preview-moods.png" alt="Sippy's moods: ready to play, snack menu, goal complete, thirsty, sleepy and crying" width="720">
</p>

### The buttons

| Button | What it does |
|---|---|
| **Left** yellow button | Opens the **snack menu**. Pick one: 🐟 fish (very filling), 🦐 shrimp (filling and tasty), 🍦 ice cream (a happy treat). |
| **Middle** yellow button | Logs **250 ml** of water. |
| **Right** yellow button | **Plays** with Sippy. It makes her happy but uses a little energy. |
| **Zz** on the screen | Lets her **rest** to restore energy. |
| Click **Sippy** | She waves hello. |

### The bars on her screen

- **💧 Water** shows today's water against your goal. Each segment is a quarter of the goal. It resets every morning.
- **❤️ Health** is the average of hunger, happiness and energy. Feeding, playing and resting fill it, and it drains slowly over a few hours.

Hover over the egg to see the exact numbers.

### Her moods

| Mood | When it happens |
|---|---|
| Eyes open, blinking | Normal |
| Happy `^ ^` with a ♥ | You care for her, save a file, a build passes, you commit, or you reach your goal |
| Thirsty (droopy, sad eyes) | You're more than 20% behind where you should be for the time of day (paced from 8:00 to 22:00) |
| Sleepy `∪ ∪` with "z Z" | Resting, low energy, or late at night (23:00 to 5:00) |
| Worried | 5 or more errors in your workspace |
| Crying `> <` with tears | A build or task fails, or she's been neglected for a few days |

She always breathes gently and only moves briefly when she reacts. If your system has **reduce motion** turned on, she stays still.

### Sounds

Sippy makes tiny retro sounds: bloops when she drinks, nom-nom when she eats, a chirp when you save, a lullaby when she rests, a jingle on commits and a fanfare when you hit your goal. VS Code only allows sound after you **click inside Sippy's Room once** after starting VS Code.

### Reminders

While VS Code is open, Sippy reminds you to drink every 45 minutes until you reach your goal. Click **Log 250 ml** in the reminder to log a drink without opening her room.

## Commands

Open the Command Palette (`Ctrl+Shift+P`) and type "Sippy":

| Command | What it does |
|---|---|
| **Sippy: Open Pet Room** | Opens the Explorer and focuses Sippy's Room |
| **Sippy: Log Water** | Log a custom amount (1 to 2000 ml) |
| **Sippy: Feed Sippy** | Choose a snack from a list |
| **Sippy: Toggle Sound** | Turn her sounds on or off |
| **Sippy: Reset Today's Water** | Set today's total back to 0 |

## Settings

Open Settings (`Ctrl+,`) and search for **sippy**:

| Setting | Default | What it does |
|---|---|---|
| `sippy.dailyGoal` | `2000` | Daily water goal in ml |
| `sippy.reminderMinutes` | `45` | Minutes between reminders (5 to 240) |
| `sippy.remindersEnabled` | `true` | Show hydration reminders |
| `sippy.codingReactions` | `true` | React to saves, builds, commits and errors |
| `sippy.sound` | `true` | Play Sippy's sounds |
| `sippy.soundVolume` | `40` | Sound volume, 0 to 100 |

## Privacy

Everything is stored locally in VS Code. Sippy has no accounts, telemetry, network requests or dependencies.

## Limits

- Reminders only run while VS Code is open. Sippy isn't a system-wide reminder app.
- VS Code may pause her animations while her view is hidden.
- VS Code decides the exact height of the Explorer section. Sippy's egg shrinks to fit short views.
- The git commit reaction needs VS Code's built-in Git extension.

## For developers

Run the extension from source:

1. Open this folder in VS Code.
2. Press **F5** and choose **Run Sippy Extension** if asked. A second VS Code window (the Extension Development Host) opens with Sippy loaded.
3. After changing `extension.js`, restart it with **Shift+F5** and then **F5**. Changes to `media/room.html` show up when you run **Developer: Reload Window** in that second window.

Run the tests:

```bash
node tests/test-extension.cjs
```

### Project layout

| Path | Contents |
|---|---|
| `extension.js` | Extension logic: water, pet stats, reminders, coding reactions, commands |
| `media/room.html` | Sippy's Room webview: layout, faces, animations, sounds |
| `media/room-egg.png` | The egg and room artwork |
| `media/sippy-faces.png` | Sprite sheet with 6 faces: happy, open, blink, sleep, sad, cry |
| `media/bar-heart.png`, `media/bar-water.png` | Full-bar layers for the live stat bars |
| `sippy-cozy-reference.png` | The original design reference |
| `docs/` | README screenshots (not included in the `.vsix`) |

### Publishing to the Marketplace

[Create a Marketplace publisher](https://code.visualstudio.com/api/working-with-extensions/publishing-extension), replace `local-dev` in `package.json` with your publisher ID, then publish with `npx @vscode/vsce publish`. A public GitHub repository alone doesn't list the extension on the Marketplace.

Repository: https://github.com/Noblesse013/sippy-vscode-pet

See [CHANGELOG.md](CHANGELOG.md) for version history.
