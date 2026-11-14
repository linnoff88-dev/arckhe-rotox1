# Epic 1: Foundation & Core Infrastructure

**Status:** Ready for Development
**Priority:** P0 - Critical Path
**Estimated Stories:** 4

## Goal

Estabelecer a base técnica do projeto incluindo setup do monorepo, autenticação JWT, modelos de dados core e API health check. Ao final deste épico, teremos um sistema deployável com login funcional.

## Dependencies

- None (first epic)

## Success Criteria

- [ ] Monorepo funcional com pnpm workspaces
- [ ] Banco de dados PostgreSQL + PostGIS configurado
- [ ] Sistema de autenticação JWT funcionando
- [ ] API com health check deployada em staging
- [ ] Documentação Swagger disponível

---

## Stories

### Story 1.1: Project Setup & Monorepo Structure

**Priority:** P0
**Estimate:** Small

**As a** developer,
**I want** a properly configured monorepo with all necessary tooling,
**so that** I can start developing features with consistent patterns.

**Acceptance Criteria:**
1. Monorepo criado com pnpm workspaces
2. ESLint + Prettier configurados com regras compartilhadas
3. TypeScript configurado em todos os packages
4. Scripts de build, dev e test funcionais
5. README com instruções de setup
6. .env.example com variáveis necessárias

**Technical Notes:**
- Use pnpm 8.x com workspace protocol
- Estrutura: apps/ (api, mobile, web, admin) + packages/ (database, shared, ui)
- Turborepo para builds paralelos
- Base tsconfig com paths aliases

**Dependencies:** None

---

### Story 1.2: Database Setup & Core Models

**Priority:** P0
**Estimate:** Small

**As a** developer,
**I want** database schema with core entities,
**so that** I can persist and query application data.

**Acceptance Criteria:**
1. PostgreSQL + PostGIS configurado (Docker Compose)
2. Prisma schema com models: User, Client, Driver, Order, Vehicle
3. Migrations iniciais criadas e aplicadas
4. Seed script com dados de teste
5. Conexão testada e documentada

**Technical Notes:**
- PostgreSQL 16 com PostGIS 3.4
- Prisma 5.x com generator client
- Usar GEOGRAPHY type para coordenadas
- Criar índices espaciais (GIST)
- Seed com 5 usuários de cada tipo

**Dependencies:** Story 1.1

**Reference:** Ver schema completo em `docs/architecture.md` seção 9

---

### Story 1.3: Authentication System

**Priority:** P0
**Estimate:** Medium

**As a** user (client or driver),
**I want** to register and login securely,
**so that** I can access the platform features.

**Acceptance Criteria:**
1. Endpoints: POST /auth/register, POST /auth/login, POST /auth/refresh
2. JWT access token (15min) + refresh token (7 days)
3. Senhas hasheadas com bcrypt (cost 12)
4. Validação de email único
5. Roles: CLIENT, DRIVER, ADMIN
6. Middleware de autenticação funcional
7. Testes unitários para auth service

**Technical Notes:**
- JWT com jsonwebtoken package
- Refresh tokens armazenados em Redis
- Zod schemas para validação de input
- Custom error classes (AuthError, ValidationError)
- Rate limiting: 10 req/min em /auth/*

**Dependencies:** Story 1.1, Story 1.2

---

### Story 1.4: API Base Structure & Health Check

**Priority:** P0
**Estimate:** Small

**As a** developer,
**I want** a well-structured API with documentation,
**so that** I can develop and test endpoints efficiently.

**Acceptance Criteria:**
1. Fastify configurado com error handling global
2. Swagger/OpenAPI documentation auto-gerada
3. Health check endpoint: GET /health
4. Rate limiting configurado (100 req/min por IP)
5. CORS configurado para origens permitidas
6. Logger estruturado (pino)
7. Deploy funcional em ambiente de staging

**Technical Notes:**
- Fastify 4.x com @fastify/swagger
- Pino logger com pretty print em dev
- @fastify/rate-limit para throttling
- @fastify/cors com whitelist
- Railway para deploy de staging

**Dependencies:** Story 1.1, Story 1.2, Story 1.3

---

## Definition of Done (Epic Level)

- [ ] Todas as 4 stories completadas
- [ ] Testes passando (>70% coverage)
- [ ] Code review aprovado
- [ ] Deploy em staging funcionando
- [ ] Documentação atualizada
