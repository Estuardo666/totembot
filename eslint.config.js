// @ts-check
import noOnlyTests from "eslint-plugin-no-only-tests";
import tseslint from "typescript-eslint";

const infraOnlyImports = [
  "@whiskeysockets/baileys",
  "@prisma/client",
  "fastify",
  "pm2",
  "node:fs",
  "fs",
];

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "prisma/generated/**",
      // Config de PM2: CommonJS puro, fuera de cualquier tsconfig y nunca importado por src.
      "ecosystem.config.cjs",
    ],
  },
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "no-console": "error",
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/domain/**/*.ts", "src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            ...infraOnlyImports.map((name) => ({
              name,
              message: "domain/application must not depend on infrastructure or I/O libraries.",
            })),
            {
              name: "process",
              message: "domain/application must not read process.env directly.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["tests/**/*.ts"],
    plugins: { "no-only-tests": noOnlyTests },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "no-only-tests/no-only-tests": "error",
    },
  },
  {
    files: ["eslint.config.js", "vitest.config.ts", "prisma.config.ts"],
    ...tseslint.configs.disableTypeChecked,
  },
);
