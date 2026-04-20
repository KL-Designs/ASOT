import nextConfig from 'eslint-config-next'
import tseslint from 'typescript-eslint'

export default [
    ...nextConfig,
    {
        plugins: { '@typescript-eslint': tseslint.plugin },
        rules: {
            'react/jsx-key': 'error',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-expressions': 'warn',
        },
    },
]
