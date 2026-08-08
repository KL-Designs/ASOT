'use client'

import React, { useContext, createContext, useState, useEffect } from 'react'


export interface AuthProps {
    token: string

    isConnected: boolean
    isColdStart: boolean

    user: User | null
    theme: 'light' | 'dark' | 'system'

    server: {
        status: string
        message: string
        version: string
        uptime: number
    } | null

    Login: (username: string, password: string) => Promise<string>
    Logout: () => void

    ChangeTheme: (theme: AuthProps['theme']) => void

    CheckConnection: () => void
}