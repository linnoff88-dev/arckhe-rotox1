# Story 1.1: Project Setup & Monorepo Structure

**Epic:** 1 - Foundation & Core Infrastructure
**Status:** Ready for Development
**Priority:** P0 - Critical Path
**Estimate:** Small (2-4 hours)

---

## User Story

**As a** developer,
**I want** a properly configured monorepo with all necessary tooling,
**so that** I can start developing features with consistent patterns.

---

## Acceptance Criteria

- [ ] 1. Monorepo criado com pnpm workspaces
- [ ] 2. ESLint + Prettier configurados com regras compartilhadas
- [ ] 3. TypeScript configurado em todos os packages
- [ ] 4. Scripts de build, dev e test funcionais
- [ ] 5. README com instruções de setup
- [ ] 6. .env.example com variáveis necessárias

---

## Technical Implementation

### 1. Initialize Monorepo

```bash
# Create root package.json
pnpm init

# Create workspace config
```

**pnpm-workspace.yaml:**
```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

### 2. Create Directory Structure

```
rotax1/
├── apps/
│   ├── api/
│   ├── mobile/
│   ├── web/
│   └── admin/
├── packages/
│   ├── database/
│   ├── shared/
│   └── ui/
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.base.json
├── .eslintrc.js
├── .prettierrc
├── .env.example
└── package.json
```

### 3. Root package.json

```json
{
  "name": "rotax1",
  "private": true,
  "scripts": {
    "dev": "turbo run dev",
    "build": "turbo run build",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "clean": "turbo run clean && rm -rf node_modules",
    "db:migrate": "pnpm --filter database migrate",
    "db:seed": "pnpm --filter database seed"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "eslint": "^8.55.0",
    "prettier": "^3.1.0",
    "turbo": "^1.11.0",
    "typescript": "^5.3.0"
  },
  "engines": {
    "node": ">=20.0.0",
    "pnpm": ">=8.0.0"
  },
  "packageManager": "pnpm@8.12.0"
}
```

### 4. Turbo Config

**turbo.json:**
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "test": {
      "dependsOn": ["build"]
    },
    "clean": {
      "cache": false
    }
  }
}
```

### 5. TypeScript Base Config

**tsconfig.base.json:**
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### 6. ESLint Config

**.eslintrc.js:**
```javascript
module.exports = {
  root: true,
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier'
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  env: {
    node: true,
    es2022: true
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }]
  },
  ignorePatterns: ['node_modules', 'dist', '.next', '.turbo']
};
```

### 7. Prettier Config

**.prettierrc:**
```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### 8. Environment Variables

**.env.example:**
```bash
# Database (Supabase or Railway)
DATABASE_URL="postgresql://postgres:password@localhost:5432/rotax1"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="your-super-secret-key-change-in-production"
JWT_EXPIRES_IN="15m"
REFRESH_TOKEN_EXPIRES_IN="7d"

# Google Maps
GOOGLE_MAPS_API_KEY="your-google-maps-api-key"

# Mercado Pago
MERCADO_PAGO_ACCESS_TOKEN="your-mercado-pago-access-token"
MERCADO_PAGO_WEBHOOK_SECRET="your-webhook-secret"

# Firebase (FCM)
FIREBASE_PROJECT_ID="your-firebase-project-id"
FIREBASE_PRIVATE_KEY="your-firebase-private-key"
FIREBASE_CLIENT_EMAIL="your-firebase-client-email"

# Storage (Cloudflare R2 or Supabase)
STORAGE_ENDPOINT="https://your-account.r2.cloudflarestorage.com"
STORAGE_ACCESS_KEY="your-access-key"
STORAGE_SECRET_KEY="your-secret-key"
STORAGE_BUCKET="rotax1"

# App
NODE_ENV="development"
PORT="3000"
API_URL="http://localhost:3000"
```

### 9. API Package Setup

**apps/api/package.json:**
```json
{
  "name": "@rotax1/api",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "lint": "eslint src/",
    "test": "vitest"
  },
  "dependencies": {
    "@rotax1/database": "workspace:*",
    "@rotax1/shared": "workspace:*",
    "fastify": "^4.25.0",
    "@fastify/cors": "^8.4.0",
    "@fastify/swagger": "^8.12.0",
    "@fastify/swagger-ui": "^2.0.0",
    "pino": "^8.17.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.10.0",
    "tsx": "^4.6.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

### 10. Database Package Setup

**packages/database/package.json:**
```json
{
  "name": "@rotax1/database",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "generate": "prisma generate",
    "migrate": "prisma migrate dev",
    "migrate:prod": "prisma migrate deploy",
    "seed": "tsx prisma/seed.ts",
    "studio": "prisma studio"
  },
  "dependencies": {
    "@prisma/client": "^5.7.0"
  },
  "devDependencies": {
    "prisma": "^5.7.0",
    "tsx": "^4.6.0",
    "typescript": "^5.3.0"
  }
}
```

### 11. Shared Package Setup

**packages/shared/package.json:**
```json
{
  "name": "@rotax1/shared",
  "version": "0.0.1",
  "private": true,
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "lint": "eslint src/"
  },
  "dependencies": {
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

---

## Definition of Done

- [ ] All directories created according to structure
- [ ] pnpm install runs without errors
- [ ] pnpm build completes successfully
- [ ] pnpm lint runs without errors
- [ ] TypeScript compiles without errors
- [ ] README.md with setup instructions exists
- [ ] .env.example contains all required variables
- [ ] Git repository initialized with .gitignore

---

## Dev Notes

### Supabase Integration

Se usar Supabase, a DATABASE_URL será no formato:
```
postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres
```

Para habilitar PostGIS no Supabase:
1. Acesse o dashboard do Supabase
2. Vá em Database → Extensions
3. Busque "postgis" e habilite

### Commands para começar

```bash
# Clone e setup
git clone git@github.com:inematds/RotaX1.git
cd RotaX1

# Install dependencies
pnpm install

# Copy env file
cp .env.example .env

# Start development
pnpm dev
```

---

## Files to Create

1. `package.json` (root)
2. `pnpm-workspace.yaml`
3. `turbo.json`
4. `tsconfig.base.json`
5. `.eslintrc.js`
6. `.prettierrc`
7. `.env.example`
8. `.gitignore` (update existing)
9. `README.md` (update existing)
10. `apps/api/package.json`
11. `apps/api/tsconfig.json`
12. `apps/api/src/server.ts` (basic hello world)
13. `packages/database/package.json`
14. `packages/database/tsconfig.json`
15. `packages/shared/package.json`
16. `packages/shared/tsconfig.json`
17. `packages/shared/src/index.ts`
