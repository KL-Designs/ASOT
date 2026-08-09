import Crypto from 'crypto'

export function GenerateToken(bytes?: number): string {
    return Crypto.randomBytes(bytes || 64).toString('base64url')
}