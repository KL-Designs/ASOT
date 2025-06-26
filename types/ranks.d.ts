export { }

declare global {

    interface BilletCategory {
        id: number
        name: string

        billets: Billet[]
    }


    interface Billet {
        id: number
        name: string
        
        billets: Billet[]
    }


    interface Rank {
        id: number
        name: string
        points: never
    }

}