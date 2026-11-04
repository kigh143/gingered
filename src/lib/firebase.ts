import { initializeApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getDatabase, type Database } from 'firebase/database'

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

/** False until the VITE_FIREBASE_* variables are set (see README). */
export const firebaseConfigured = Boolean(config.apiKey && config.databaseURL && config.projectId)

const app = firebaseConfigured ? initializeApp(config) : undefined

// The app shows a setup screen and never touches these when Firebase isn't configured.
export const auth = (app ? getAuth(app) : undefined) as Auth
export const db = (app ? getDatabase(app) : undefined) as Database
