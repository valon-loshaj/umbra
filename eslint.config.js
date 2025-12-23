import globals from 'globals'
import tseslint from 'typescript-eslint'
import stylistic from '@stylistic/eslint-plugin'
import importX from 'eslint-plugin-import-x'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
	{ ignores: ['node_modules', 'dist', '.vite', '**/*.js'] },

	{
		files: ['**/*.{ts,tsx}'],
		extends: [
			...tseslint.configs.recommended,
			stylistic.configs.customize({
				indent: 'tab',
				quotes: 'single',
				semi: false,
				jsx: true,
				braceStyle: '1tbs',
			}),
		],
		plugins: {
			'import-x': importX,
			'react-hooks': reactHooks,
		},
		languageOptions: {
			ecmaVersion: 'latest',
			sourceType: 'module',
			globals: {
				...globals.browser,
				...globals.node,
			},
			parserOptions: {
				ecmaFeatures: { jsx: true },
			},
		},
		settings: {
			'import-x/resolver': {
				typescript: true,
				node: true,
			},
		},
		rules: {
			// React hooks - catches missing deps, rules of hooks violations
			...reactHooks.configs.recommended.rules,

			// Stylistic overrides (customize() handles most defaults)
			'@stylistic/comma-dangle': ['error', 'always-multiline'],
			'@stylistic/jsx-quotes': ['error', 'prefer-double'],
			'@stylistic/arrow-parens': ['error', 'always'],
			'@stylistic/object-curly-spacing': ['error', 'always'],
			'@stylistic/no-multiple-empty-lines': ['error', { max: 1, maxEOF: 0 }],

			// Import organization
			'import-x/order': ['error', {
				groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
				'newlines-between': 'always',
				alphabetize: { order: 'asc', caseInsensitive: true },
			}],
			'import-x/no-duplicates': 'error',
		},
	},
)