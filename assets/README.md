# App Store Assets

Place the production PNG assets here before running EAS production builds.

## Required files

- `icon.png`
  - Size: 1024 x 1024 px
  - Format: PNG
  - Shape: square, no transparency
  - Purpose: default Expo app icon and iOS app icon source

- `adaptive-icon.png`
  - Size: 1024 x 1024 px
  - Format: PNG
  - Shape: transparent foreground artwork with safe-area padding
  - Purpose: Android adaptive icon foreground
  - Keep important content inside the center safe zone, roughly 66% of the canvas.
  - Background color is configured in `app.json` as `#102f46`.

- `splash.png`
  - Size: 1284 x 2778 px
  - Format: PNG
  - Shape: transparent or `#102f46` background
  - Purpose: launch screen image
  - Keep important content centered so it works with `resizeMode: "contain"`.

## Configured paths

These files are referenced from `app.json`:

- `expo.icon`: `./assets/icon.png`
- `expo.splash.image`: `./assets/splash.png`
- `expo.android.adaptiveIcon.foregroundImage`: `./assets/adaptive-icon.png`
