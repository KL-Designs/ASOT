'use client'

import { useState, useEffect } from 'react'

export type Favourite = {
    id: string
    label: string
    href: string
    tabIndex?: number
}

const KEY = 'staff-dashboard-favourites'

export function useFavourites() {
    const [favourites, setFavourites] = useState<Favourite[]>([])

    useEffect(() => {
        try {
            const stored = localStorage.getItem(KEY)
            if (stored) setFavourites(JSON.parse(stored))
        } catch {}
    }, [])

    function save(next: Favourite[]) {
        setFavourites(next)
        try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
    }

    return {
        favourites,
        pin:      (fav: Favourite) => save([...favourites.filter(f => f.id !== fav.id), fav]),
        unpin:    (id: string)     => save(favourites.filter(f => f.id !== id)),
        isPinned: (id: string)     => favourites.some(f => f.id === id),
    }
}
