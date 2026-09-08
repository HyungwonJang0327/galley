import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/.next/**', '**/coverage/**', '**/node_modules/**'],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      // @galley/ui는 공개 배럴(@galley/ui)로만 소비. src 딥 임포트 금지 (decisions/ui-package-boundary.md)
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@galley/ui/src', '@galley/ui/src/*'],
              message: '@galley/ui는 공개 배럴(@galley/ui)로만 임포트하세요. src 딥 임포트 금지.',
            },
          ],
        },
      ],
    },
  },
);
