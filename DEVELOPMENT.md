### How to build & run extension?
1. `nvm use 24`
1. `npm run compile`
1. `code .`
1. Then press `F5`
    - This launches a new VS Code `Extension Development Host`
1. Open an `Ace` project



### How to deploy?
1. Commit changes
1. Bump the Package Version
    | Command             | When to Use                        | Example         |
    | ------------------- | ---------------------------------- | --------------- |
    | `npm version patch` | Bug fixes or minor improvements    | `0.6.0 → 0.6.1` |
    | `npm version minor` | New features (backward-compatible) | `0.6.0 → 0.7.0` |
    | `npm version major` | Breaking changes                   | `0.6.0 → 1.0.0` |
  1. Push to Github
      - 🚨 `git push origin main --follow-tags`
      - `npm version patch` (or `minor`/`major`) creates both a `commit` and a `git tag`
      - `git push` by itself only pushes commits, **not tags**.
      - `--follow-tags` pushes both the commit and the tag (so `GitHub` can create the release properly)
1. Publish: `npm run publish`
