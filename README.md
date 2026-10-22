# Coin Catcher

A small browser arcade game. Move the basket, catch falling coins, and avoid the bombs. You have 3 lives. The best score is saved in this browser.

## Run

Open `index.html` in a browser. That is enough — the game does not need a build step, a server, or any downloaded assets.

To serve it locally:

```bash
python3 -m http.server 8080
```

Then open http://localhost:8080.

## How to play

Press **Play**. After a 3-second countdown, coins and bombs fall from the top. Catch coins with the basket. Each coin is worth 10 points. Catching a bomb costs one life.

The game ends when all 3 lives are gone. **Play again** starts a fresh run without reloading the page. Pausing freezes the action, and resuming plays the countdown again so you can get set.

Falls get faster, objects appear more often, and bombs become a bit more common as your score climbs.

## Controls

| Action | Control |
| --- | --- |
| Move | Left and right arrows, A and D, mouse, or touch |
| Pause | P, Space, Esc, or the pause button |
| Resume | P, Space, Esc, or Resume |
| Mute | M, or the sound button |
| Start or restart | Play, Play again, or Enter |

Sound is created in the browser and starts after the first click or key press. Mute is remembered for the next visit. The best score is stored in `localStorage`.

## Customize

Gameplay numbers live in the `CONFIG` object at the top of `game.js`.

| Setting | What it changes |
| --- | --- |
| `startLives` | Lives at the start of a run |
| `coinPoints` | Points awarded per coin |
| `countdownSeconds` | Countdown length when starting or resuming |
| `baseFallSpeed`, `maxFallSpeed` | How fast objects fall, in pixels per second |
| `baseSpawnInterval`, `minSpawnInterval` | Seconds between spawns, from easy to hardest |
| `baseBombChance`, `maxBombChance` | Chance that a spawn is a bomb (0 to 1) |
| `difficultyScoreSpan` | Score at which difficulty reaches its cap. Higher is a slower ramp |
| `basketSpeed` | Keyboard speed in pixels per second |
| `pointerFollow` | How quickly the basket chases the mouse or finger |
| `invulnTime` | Brief shield after a bomb, in seconds |

Page colors and the font stack are the variables at the top of `style.css`. Coin, bomb, basket, and sky colors drawn on the canvas are in the `PALETTE` object in `game.js`.
