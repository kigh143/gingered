import { createContext, useContext } from 'react'
import type { Ingredient, Recipe } from './types'

export interface AppData {
  ingredients: Record<string, Ingredient>
  recipes: Record<string, Recipe>
  currency: string
}

export const AppDataContext = createContext<AppData>({ ingredients: {}, recipes: {}, currency: '' })

export const useAppData = () => useContext(AppDataContext)

export function navigate(path: string) {
  window.location.hash = path
}
