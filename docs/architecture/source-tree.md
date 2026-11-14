# Rotax1 - Source Tree

```
rotax1/
├── apps/
│   ├── api/                          # Fastify API
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/             # Authentication
│   │   │   │   │   ├── auth.controller.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── auth.routes.ts
│   │   │   │   │   └── auth.schema.ts
│   │   │   │   ├── clients/          # Client management
│   │   │   │   ├── drivers/          # Driver management
│   │   │   │   ├── orders/           # Order lifecycle
│   │   │   │   ├── payments/         # Payment processing
│   │   │   │   └── admin/            # Admin operations
│   │   │   ├── common/
│   │   │   │   ├── middlewares/      # Auth, error handling
│   │   │   │   ├── plugins/          # Fastify plugins
│   │   │   │   └── errors/           # Custom error classes
│   │   │   ├── jobs/                 # BullMQ workers
│   │   │   │   ├── notifications.job.ts
│   │   │   │   ├── matching.job.ts
│   │   │   │   └── payouts.job.ts
│   │   │   ├── websocket/            # Socket.IO handlers
│   │   │   │   ├── tracking.gateway.ts
│   │   │   │   └── notifications.gateway.ts
│   │   │   ├── app.ts
│   │   │   └── server.ts
│   │   ├── tests/
│   │   └── package.json
│   │
│   ├── mobile/                       # React Native (Expo)
│   │   ├── src/
│   │   │   ├── app/                  # Expo Router pages
│   │   │   │   ├── (client)/         # Client screens
│   │   │   │   ├── (driver)/         # Driver screens
│   │   │   │   └── (auth)/           # Auth screens
│   │   │   ├── components/           # Shared components
│   │   │   ├── hooks/                # Custom hooks
│   │   │   ├── services/             # API clients
│   │   │   ├── stores/               # Zustand stores
│   │   │   └── utils/                # Utilities
│   │   └── package.json
│   │
│   ├── web/                          # Next.js Client Portal
│   │   ├── src/
│   │   │   ├── app/                  # App Router pages
│   │   │   ├── components/
│   │   │   └── lib/
│   │   └── package.json
│   │
│   └── admin/                        # Next.js Admin Panel
│       ├── src/
│       │   ├── app/
│       │   ├── components/
│       │   └── lib/
│       └── package.json
│
├── packages/
│   ├── database/                     # Prisma package
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   └── package.json
│   │
│   ├── shared/                       # Shared code
│   │   ├── src/
│   │   │   ├── types/                # TypeScript types
│   │   │   ├── validators/           # Zod schemas
│   │   │   ├── constants/            # Shared constants
│   │   │   └── utils/                # Helper functions
│   │   └── package.json
│   │
│   └── ui/                           # Shared UI components
│       ├── src/components/
│       └── package.json
│
├── infrastructure/
│   ├── docker/
│   │   ├── docker-compose.yml        # Local development
│   │   └── docker-compose.prod.yml
│   └── scripts/
│
├── docs/                             # Documentation
│   ├── prd.md
│   ├── architecture.md
│   ├── architecture/
│   │   ├── coding-standards.md
│   │   ├── tech-stack.md
│   │   └── source-tree.md
│   └── stories/
│
├── .github/workflows/                # CI/CD
│   ├── ci.yml
│   └── deploy.yml
│
├── package.json                      # Root package
├── pnpm-workspace.yaml               # Workspace config
├── turbo.json                        # Turborepo config
├── .env.example
└── README.md
```

## Module Structure Pattern

Each API module follows this structure:

```
modules/{module-name}/
├── {module}.controller.ts    # Route handlers
├── {module}.service.ts       # Business logic
├── {module}.repository.ts    # Data access
├── {module}.routes.ts        # Route definitions
├── {module}.schema.ts        # Zod schemas
├── {module}.types.ts         # TypeScript types
└── {module}.spec.ts          # Tests
```

## Mobile App Structure

```
app/
├── (auth)/
│   ├── login.tsx
│   └── register.tsx
├── (client)/
│   ├── _layout.tsx
│   ├── index.tsx             # Home
│   ├── new-order.tsx
│   ├── tracking/[id].tsx
│   └── history.tsx
├── (driver)/
│   ├── _layout.tsx
│   ├── index.tsx             # Available orders
│   ├── delivery/[id].tsx
│   └── earnings.tsx
└── _layout.tsx               # Root layout
```
