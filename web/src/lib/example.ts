import { createContext, useContext } from 'react'

// The open piece is the example: a real piece recorded from start to finish, there for anyone to look through.
// Nothing on it can be changed and nothing calls a model, so a screen shows what was recorded and turns off the rest.
export const ExampleContext = createContext(false)

export const useExample = () => useContext(ExampleContext)

export const RECORDED = 'This is the example piece, recorded from a real painting, so it can’t be changed here. Start a piece of your own to try it.'
