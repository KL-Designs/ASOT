import nextConfig from 'eslint-config-next'
import tseslint from 'typescript-eslint'

const eslintConfig = [
    { ignores: ['.old/**'] },
    ...nextConfig,
    {
        plugins: { '@typescript-eslint': tseslint.plugin },
        rules: {
            'react/no-unescaped-entities': 'off',
            'react-hooks/set-state-in-effect': 'off',
            'react-hooks/immutability': 'off',
            'react-hooks/static-components': 'off',
            'react-hooks/refs': 'off',
            '@next/next/no-img-element': 'off',
            'jsx-a11y/alt-text': 'off',
        },
    },
]

export default eslintConfig
