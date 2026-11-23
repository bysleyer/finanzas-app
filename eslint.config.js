// @ts-check
import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

/**
 * Reglas de capas: cada capa solo puede importar de las capas que están "debajo".
 *
 *   ui  →  data / sync  →  engine  →  domain
 *
 * Si alguien (o yo) rompe este orden, `npm run lint` falla.
 */
const layer = (/** @type {string} */ name, /** @type {string[]} */ forbidden) => ({
  files: [`src/${name}/**/*.{ts,tsx}`],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: forbidden.map((f) => ({
          group: [`**/${f}`, `**/${f}/**`],
          message: `La capa "${name}" no puede depender de "${f}". Ver ARCHITECTURE.md.`,
        })),
      },
    ],
  },
});

export default tseslint.config(
  { ignores: ['node_modules', 'dist', 'dev-dist'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    // Variables que empiezan con _ se ignoran a propósito (por ejemplo, al quitar un campo de un objeto).
    rules: { '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }] },
  },
  layer('domain', ['engine', 'data', 'sync', 'ui']),
  layer('engine', ['data', 'sync', 'ui']),
  layer('data', ['sync', 'ui']),
  layer('sync', ['ui']),
);
