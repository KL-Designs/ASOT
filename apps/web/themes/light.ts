'use client'
import { createTheme } from '@mui/material/styles'
import { Inter, Montserrat } from "next/font/google"

export default createTheme({
    palette: {
        mode: 'light',
    },

    typography: {
        fontFamily: 'Inter, sans-serif',
    }
})