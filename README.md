# gingered

Recipe costing and test bakes for one admin. React + Vite, Firebase Auth (email/password), Realtime Database and Firebase Hosting.

## How it works

- **Ingredients**: name, unit (g / ml / pieces), pack size, price paid for the pack, where it was bought. Cost per unit is worked out from these. Mark flours with "This is a flour". Pieces (e.g. eggs) need a weight per piece.
- **Recipes**: name, description, cook durations (any number of stages), base flour weight, optional yield (e.g. 24 cookies). Each ingredient is a **baker's percentage**, meaning a % of the total flour weight. Flours add up to 100%. Each ingredient has a "why it's needed" note.
- **Scale**: on a recipe, type a flour weight (or the number of pieces wanted) to get every quantity and the batch cost, cost per kg and cost per piece.
- **Inactive ingredients**: switch an ingredient off on a recipe and it stays there, greyed out, but adds nothing to quantities, cost or flour %. Switch it back on any time.
- **Manufacture**: on a recipe, click Manufacture. Choose the batch size by flour or by pieces wanted, check stock, enter how many were made and the price per piece, then save it as produce. Stock is reduced unless you untick that option.
- **Production**: lists every batch with cost, price, sold and left. Record sales, edit price or notes, or delete a batch (with the option to put the stock back).
- **Stock**: each ingredient has a stock level. "+ Stock" records a purchase and can update the pack price. Editing an ingredient corrects the count.
- **Test lab**: change percentages and the flour amount, record how many pieces it made plus notes, and save the test. Saved tests keep the prices from that day. Load an old test back into the lab, or copy the lab's percentages into the recipe.

## Data layout (Realtime Database)

```
ingredients/{id}   name, unit, packSize, packPrice, store, gramsPerPiece, isFlour, notes, stock, updatedAt
recipes/{id}       name, description, durations[{label, minutes}], items[{ingredientId, percent, reason, active?}],
                   baseFlour, yieldCount, yieldLabel, pricePerPiece, createdAt, updatedAt
tests/{recipeId}/{id}  flourWeight, lines[...snapshot], totalWeight, totalCost, piecesMade, notes, createdAt
production/{id}    recipeId, recipeName, yieldLabel, flourWeight, expectedPieces, piecesMade, pricePerPiece,
                   lines[...snapshot], totalCost, notes, stockDeducted, createdAt, sales/{id}{qty, at}
settings           currency
```

## One-time Firebase setup

1. Create a project at <https://console.firebase.google.com>.
2. **Authentication → Sign-in method**: enable **Email/Password**.
3. **Authentication → Users → Add user**: create the admin's email and password. This is the only login.
4. **Authentication → Settings → User actions**: turn off **Enable create (sign-up)** so nobody else can register.
5. **Realtime Database → Create database**.
6. Put the admin email in `database.rules.json` in place of both `ADMIN_EMAIL_HERE`. These rules get deployed with the site, and only that account can read or write. Deploying stops with an error if the placeholder is still there.
7. **Project settings → General → Your apps → Add app → Web**: copy the config values.
8. Put your project ID in `.firebaserc` in place of `your-firebase-project-id`.

## Run locally

```sh
cp .env.example .env.local   # then fill in the values from step 7
yarn install
yarn dev
```

Node 24+ is recommended. On Node 22, `.yarnrc` skips an engine check for a Firebase module this app doesn't use.

## Deploy to Firebase Hosting

```sh
npx firebase-tools login      # first time only
yarn deploy                   # builds, then deploys the site and database rules
yarn deploy:hosting           # site only
yarn deploy:rules             # database rules only
```

The site is served at `https://<project-id>.web.app` and `https://<project-id>.firebaseapp.com`. Firebase authorises both domains for sign-in automatically. The build reads the Firebase config from `.env.local`, so fill that in before deploying.

To deploy automatically on every push to GitHub, run `npx firebase-tools init hosting:github`. It creates the service account secret and the workflow for you. Add the `VITE_FIREBASE_*` values as repository variables, and pass them to the build step as `env`.

The Firebase web config is not a secret. It ends up in the browser anyway. The database rules and the turned-off sign-up are what keep the data private.
