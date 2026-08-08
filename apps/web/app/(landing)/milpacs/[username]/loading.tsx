"use client"

import TacticalLoader from "@/components/tactical-loader"
import { useParams } from "next/navigation"

export default function Loading() {
    const { username } = useParams<{ username: string }>()
    const display = username ? decodeURIComponent(username).toUpperCase() : "PERSONNEL"
    return <TacticalLoader label={`LOADING ${display}`} />
}
