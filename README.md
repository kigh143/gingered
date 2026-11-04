# gingered

Recipe costing and test bakes for one admin. React + Vite, Firebase Auth (email/password) and Realtime Database, hosted on GitHub Pages.

## How it works

- **Ingredients**: name, unit (g / ml / pieces), pack size, price paid for the pack, where it was bought. Cost per unit is worked out from these. Mark flours with "This is a flour". Pieces (e.g. eggs) need a weight per piece.
- **Recipes**: name, description, cook durations (any number of stages), base flour weight, optional yield (e.g. 24 cookies). Each ingredient is a **baker's percentage**, meaning a % of the total flour weight. Flours add up to 100%. Each ingredient has a "why it's needed" note.
- **Scale**: on a recipe, type a flour weight (or the number of pieces wanted) to get every quantity and the batch cost, cost per kg and cost per piece.
- **Test lab**: change percentages and the flour amount, record how many pieces it made plus notes, and save the test. Saved tests keep the prices from that day. Load an old test back into the lab, or copy the lab's percentages into the recipe.

## Data layout (Realtime Database)

```
ingredients/{id}   name, unit, packSize, packPrice, store, gramsPerPiece, isFlour, notes, updatedAt
recipes/{id}       name, description, durations[{label, minutes}], items[{ingredientId, percent, reason}],
                   baseFlour, yieldCount, yieldLabel, createdAt, updatedAt
tests/{recipeId}/{id}  flourWeight, lines[...snapshot], totalWeight, totalCost, piecesMade, notes, createdAt
settings           currency
```

## One-time Firebase setup

1. Create a project at <https://console.firebase.google.com>.
2. **Authentication → Sign-in method**: enable **Email/Password**.
3. **Authentication → Users → Add user**: create the admin's email and password. This is the only login.
4. **Authentication → Settings → User actions**: turn off **Enable create (sign-up)** so nobody else can register.
5. **Realtime Database → Create database**.
6. **Realtime Database → Rules**: paste in `database.rules.json`, replace both `ADMIN_EMAIL_HERE` with the admin email, then **Publish**. Only that account can read or write.
7. **Project settings → General → Your apps → Add app → Web**: copy the config values.
8. **Authentication → Settings → Authorized domains**: add `<your-github-username>.github.io`.

## Run locally

```sh
cp .env.example .env.local   # then fill in the values from step 7
yarn install
yarn dev
```

Node 24+ is recommended. On Node 22, `.yarnrc` skips an engine check for a Firebase module this app doesn't use.

## Deploy to GitHub Pages

1. Push this repo to GitHub.
2. **Settings → Pages → Build and deployment → Source**: choose **GitHub Actions**.
3. **Settings → Secrets and variables → Actions → Variables**: add `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_DATABASE_URL`, `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID`.
4. Push to `main`. `.github/workflows/deploy.yml` builds the site and publishes it to `https://<user>.github.io/<repo>/`.

The Firebase web config is not a secret. It ends up in the browser anyway. The database rules and the turned-off sign-up are what keep the data private.
