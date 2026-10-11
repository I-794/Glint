// v33.2 — deliberately tiny: only catches unused imports/locals (knip covers
// unused files and dependencies). There is no style linting in this repo.
export default [
  { ignores: ['dist/**', 'node_modules/**', 'SnapShot-Pro-main/**', 'chrome-extension/**', 'dev-dist/**'] },
  {
    files: ['**/*.js', '**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    rules: {
      'no-unused-vars': ['error', { vars: 'all', args: 'none', caughtErrors: 'none', ignoreRestSiblings: true }]
    }
  }
];
