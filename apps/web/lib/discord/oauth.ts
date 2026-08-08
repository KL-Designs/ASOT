export function ExchangeToken(code: string): Promise<OAuth> {
    return new Promise((resolve, reject) => {

        fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: process.env.DISCORD_CLIENT_ID!,
                client_secret: process.env.DISCORD_CLIENT_SECRET!,
                code: code as string,
                redirect_uri: process.env.NEXT_PUBLIC_BASEURL! + process.env.DISCORD_REDIRECT_URI!,
            })
        })
            .then(res => res.json())
            .then(data => {
                if (data.error) return reject(data)
                resolve(data)
            })

    })
}

export function GetUser(oauth: OAuth): Promise<OAuthUserResponse> {
    return new Promise((resolve, reject) => {

        fetch('https://discord.com/api/users/@me', {
            headers: {
                authorization: `${oauth?.token_type} ${oauth?.access_token}`
            }
        })
            .then(res => res.json())
            .then(data => {
                if (!data.id) return reject(data)
                resolve(data)
            })

    })
}