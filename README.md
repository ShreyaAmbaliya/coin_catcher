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

## Deploy to GitHub Pages

The game is a static site. `index.html`, `style.css`, and `game.js` are the only files the live site needs. Styles and scripts use relative paths (`./style.css` and `./game.js`), so they load when the site is served from a project URL such as `https://USERNAME.github.io/REPOSITORY/`.

There is no backend, server-side code, or environment variables. GitHub Actions publishes the game with the official Pages actions. The workflow is `.github/workflows/deploy.yml`. It runs on every push to `main`, copies the three game files to the site root, and deploys that folder. The README and workflow files stay in the repository and are not part of the live site.

### Create a GitHub repository

1. Sign in to GitHub and create a new repository.
2. Make it public if you want a public game URL on the free plan.
3. Name it whatever you want the site path to be. A repository named `coin-catcher` is published at `https://USERNAME.github.io/coin-catcher/`.
4. Do not add a README, .gitignore, or license from the GitHub form. This project already has its files.
5. Leave the default branch as `main`.

### Push this project

From this folder, if git is not set up yet:

```bash
git init
git checkout -b main
git add index.html style.css game.js README.md .github/workflows/deploy.yml .gitattributes
git commit -m "Publish Coin Catcher with GitHub Pages"
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

Replace `USERNAME` and `REPOSITORY` with your GitHub username and repository name. If this folder is already a git repo on `main`, commit the Pages workflow and push that branch.

### Enable GitHub Pages using GitHub Actions

1. Open the repository on GitHub.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Open the **Actions** tab. The "Deploy to GitHub Pages" workflow starts from the push to `main`.
5. If it does not start, use **Run workflow** on that workflow. That uses the manual `workflow_dispatch` trigger.

The workflow already sets the `contents: read`, `pages: write`, and `id-token: write` permissions, and it deploys into the `github-pages` environment. You do not need to add secrets.

### Find the public game URL

When the workflow finishes successfully:

1. Open **Settings → Pages**. The address is shown at the top, in the form `https://USERNAME.github.io/REPOSITORY/`.
2. Or open the successful Actions run and use the URL on the **github-pages** environment.

Give the site a few minutes the first time. Open the URL with a trailing slash. `index.html` is deployed at the site root, so that address loads the game.

### Update the live game

1. Change the game files locally.
2. Commit the changes.
3. Push to `main`.

The same workflow deploys again. After it succeeds, refresh the public URL. If the browser still shows the old game, reload without using the cached copy.
