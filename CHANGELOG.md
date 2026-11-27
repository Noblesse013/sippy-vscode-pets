## 0.8.6: Fresh look
- New marketplace icon showing today's Sippy in her room.
- README: new screenshots and a clearer moods table (sleepy vs. napping).

## 0.8.5: Cozier sleep and a fresh start each day
- While she naps, the Zz button now shows a small pixel alarm clock instead of a yellow "Wake" label.
- Every new day (and a brand-new Sippy) starts with her health bar at 2 of 6 segments. Drinking water and caring for her fill it up.
- The water part of her health now counts what you've actually drunk today (still dropping if you fall behind pace).

## 0.8.4: More bug fixes
- Fix: with auto-save on, Sippy waved "Saved!" every 30 seconds while you typed. She now only reacts to saves you make yourself.
- Fix: Zz almost never worked (energy drains only 1 point an hour, so after a nap she refused for ~5 hours). She can now nap whenever she isn't fully rested, and at night always.
- At night (19:00 to 6:00) she sleeps through until morning instead of waking up the moment she's rested.
- Smaller package: two unused images are no longer bundled.

## 0.8.3: Bug fixes
- Fix: if VS Code closed Sippy's view, the minute timer could crash and stop water reminders, mood updates and auto-wake. Closed views are now forgotten and a failing tick can't stop the timer.
- Fix: Sippy no longer says "Oops, an error!" on startup for errors that were already in your project (20-second grace while language servers load).
- Fix: her screen now refreshes at midnight when today's water resets.
- Fix: broken saved stats or a non-number daily goal fall back to defaults instead of showing NaN.
- **Sippy: Put to Sleep / Wake Up** now tells you what happened, even when her room is hidden.
- The sleeping "z Z" sits in a little cream bubble so it's readable against the night-sky window.

## 0.8.2
- The Zz button is now clearly two-way: while Sippy sleeps it turns yellow and says **Wake**.
- New command **Sippy: Put to Sleep / Wake Up**.

## 0.8.1
- Fix: Sippy's room stopped working in 0.8.0 because of a broken message in the webview script. Added a test that checks the webview script's syntax.

## 0.8.0: A proper nap
- While she naps, Sippy wears a cozy nightcap and is tucked under a little pink blanket.
- Day and night: from 19:00 to 6:00 the window fades to a night sky with a moon and stars, and the room gets a soft blue tint.
- Asleep, Sippy now regains energy over time (about 1 point a minute) instead of getting +28 at once, and gets hungry and bored at half speed.
- She wakes up by herself when fully rested ("All rested! Good morning!"). Zz, feeding or patting still wake her early.
- Zz does nothing when she's already rested ("Not sleepy yet!").
- She naps through saves, commits and builds; only code errors startle her.
- Clicking her or logging water while she naps doesn't make her wave or drink in her sleep.

## 0.7.4
- Pats are quicker (about 1.2 seconds) and the patting hand is now white.

## 0.7.3
- The error sound is louder and easier to notice: a buzzy "uh-oh... uh-ohh" instead of two soft notes.

## 0.7.2
- Health bar now has 6 blocks (each is about 17% health).

## 0.7.0: Head pats
- The Play button is now **Pat**: a little hand gently strokes Sippy's head while she leans into it, with a soft pat-pat-coo sound.
- A pat gives +20 happiness and, unlike playing, doesn't cost energy or make her hungry.

## 0.6.2
- Sippy now stays worried for 7 seconds when code errors appear (other reactions are unchanged).

## 0.6.1
- Health bar now has 8 blocks (each is 12.5% health).

## 0.6.0: Water keeps Sippy healthy
- One health bar: the ❤️ and 💧 bars are merged into a single 10-segment health bar.
- Your water intake now counts for 40% of Sippy's health. Staying on pace with your daily goal keeps her healthy; falling behind makes the bar drop, and drinking fills it right away.

## 0.5.1: Sippy listens better
- Error reactions: Sippy now says "Oops, an error!" for any new error, and "So many errors..." at 5 or more (before, she only reacted when the count crossed 5).
- The ❤️ bar fills smoothly with her exact health, so feeding, playing and slow decay all visibly move it.
- Zz is now a nap toggle: Sippy stays asleep until you press Zz again, feed her or play with her. She stays asleep across reloads.

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
