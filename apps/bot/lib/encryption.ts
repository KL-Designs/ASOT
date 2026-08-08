import Crypto from 'node:crypto'

export function GenerateToken(bytes?: number): string {
    return Crypto.randomBytes(bytes || 64).toString('base64url')
}