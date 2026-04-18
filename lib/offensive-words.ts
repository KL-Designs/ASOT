export const OFFENSIVE_WORDS = [
    // Racial slurs — n-word variants
    'nigger', 'nigga', 'n1gger', 'n1gga', 'nigg3r', 'nigg4', 'niqqa',
    'niqqer', 'n!gger', 'n!gga', 'nig', 'niga',

    // Racial slurs — other
    'chink', 'ch1nk', 'gook', 'kike', 'k1ke', 'spic', 'sp1c',
    'beaner', 'wetback', 'coon', 'cracker', 'honky', 'gringo',
    'zipperhead', 'raghead', 'sandnigger', 'towelhead', 'nip',
    'jap', 'paki', 'darkie', 'sambo', 'redskin', 'squaw', 'injun',

    // Homophobic / transphobic slurs
    'faggot', 'fagg0t', 'fag', 'f4g', 'dyke', 'tranny', 'shemale',
    'heshe', 'queer',

    // Ableist slurs
    'retard', 'ret4rd', 'r3tard', 'retarded', 'spastic', 'spaz',

    // General swear words
    'fuck', 'f4ck', 'fvck', 'fuk', 'fucker', 'fucked', 'fucking',
    'fking', 'fkn', 'shit', 'sh1t', 'shyt', 'ass', 'asshole',
    'bastard', 'damn', 'bitch', 'b1tch', 'b!tch',

    // Sexual / degrading
    'cunt', 'c0nt', 'slut', 'sl0t', 'whore', 'wh0re', 'skank',
    'cock', 'c0ck', 'dick', 'd1ck', 'penis', 'pussy', 'vagina',

    // Nazi / extremist
    'nazi', 'n4zi', 'heil', 'sieg', '1488', 'kkk',
]

export function containsOffensiveWord(name: string): boolean {
    const lower = name.toLowerCase()
    return OFFENSIVE_WORDS.some(w => lower.includes(w))
}
