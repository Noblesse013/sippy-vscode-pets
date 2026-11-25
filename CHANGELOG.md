## 0.5.0 — Sippy notices you
- Coding reactions: Sippy waves when you save, cheers when a task passes, worries when it fails, dances on git commits, and reacts when errors pile up or get fixed. Throttled so it never spams; toggle with `sippy.codingReactions`.
- Mood follows your pace: Sippy droops a little and says she's thirsty when you're more than 20% behind your expected intake (paced 8:00 to 22:00), and gets sleepy late at night.
- New look matching `sippy-cozy-reference.png`: Sippy now sits on her rug with her scarf (cut from the reference art).
- Smoother art: assets are pre-scaled with high-quality resampling (`media/room-egg.png`) and drawn smoothly instead of with jagged nearest-neighbour scaling.
- Sound: tiny retro sounds made in code (no audio files): bloops when she drinks, nom-nom when she eats, a happy arpeggio when playing, a chirp on save, a lullaby when resting, a party jingle on commits, an uh-oh for errors, a sniffle when she cries and a fanfare at your daily goal. Settings `sippy.sound` and `sippy.soundVolume`, plus **Sippy: Toggle Sound**. VS Code only allows sound after you've clicked inside Sippy's Room once per session.
- Live stat bars: the ❤️ and 💧 bars on Sippy's screen now update. 💧 fills one segment per quarter of today's goal; ❤️ shows her health (average of hunger, happiness and energy), so feeding and playing fill it and it slowly drains over time.
- Feeding: the Feed button opens a snack menu (🐟 fish: very filling, 🦐 shrimp: filling and tasty, 🍦 ice cream: a happy treat). Sippy eats the snack in front of her with a happy face. Also available as **Sippy: Feed Sippy** in the Command Palette.
- Emotions: Sippy's eyes are open by default and she blinks every few seconds. She smiles (happy eyes) when you care for her or code goes well, sleeps with closed eyes when resting or late at night, looks sad when thirsty or errors pile up, and cries when a build fails or she's been neglected (`media/sippy-faces.png` sprite sheet). Each face is distinct even at sidebar size: happy `^ ^` with a pink ♥, sleeping `∪ ∪` with a blue "z Z", crying `> <` with big tears.
- Breathing: Sippy always breathes gently (a ~3% chest rise anchored at her feet, not a bounce). Slow and deep while sleeping, quick sobs while crying. Off under "reduce motion".
- No more constant up-and-down bobbing: Sippy sits still and only moves briefly when she reacts. Mood states (thirsty, sleepy, goal complete) are still poses, and all motion turns off under "reduce motion".
- Status messages now return to Sippy's mood after each reaction instead of sticking (e.g. "Hello!").

## 0.4.0 — Cozy Sippy
- Integrated the approved cozy virtual-pet egg artwork into the active Explorer webview.
- Animated Sippy separately above the new pastel-pink room, avoiding a duplicate static penguin.
- Repositioned the three care buttons to match the redesigned shell.
- Preserved compact layout, daily goal cap, reminders, pet-care state and local storage.

# Changelog

## 0.3.0
- New tiny turquoise virtual-pet egg layout for VS Code Explorer
- Feed, water, play, rest pet controls
- Saved hunger, happiness, energy stats
- Always-animated Sippy when visible
- Preserved daily water logging, hard cap, reminders, automatic daily reset
