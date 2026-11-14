# Rotax1 - Plataforma de Entregas Ãšltima Milha

<div align="center">

![Rotax1 Logo](doc/logo-Rotax1.png)

**Plataforma moderna de entregas sob demanda especializada em nichos verticais**

[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue.svg)](https://www.typescriptlang.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.25-green.svg)](https://www.fastify.io/)
[![Prisma](https://img.shields.io/badge/Prisma-5.7-purple.svg)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue.svg)](https://www.postgresql.org/)
[![License](https://img.shields.io/badge/License-Private-red.svg)]()

</div>

---

## VisÃ£o Geral

**Rotax1** Ã© uma plataforma de entregas Ãºltima milha que conecta clientes, entregadores e transportadoras em um ecossistema integrado. O diferencial Ã© a especializaÃ§Ã£o em nichos verticais com requisitos especÃ­ficos de manuseio e entrega.

### Nicho Inicial: Medicamentos VeterinÃ¡rios

O mercado pet brasileiro representa **R$ 52 bilhÃµes** com crescimento de 14% ao ano. ClÃ­nicas veterinÃ¡rias e pet shops enfrentam desafios Ãºnicos:

- Medicamentos que requerem temperatura controlada
- UrgÃªncia em entregas de emergÃªncia
- Necessidade de rastreamento em tempo real
- Conformidade com regulamentaÃ§Ãµes sanitÃ¡rias

### Problema Resolvido

1. **Para Clientes**: Dificuldade em obter entregas rÃ¡pidas e confiÃ¡veis para produtos veterinÃ¡rios
2. **Para Entregadores**: Falta de plataformas especializadas com demanda constante
3. **Para Transportadoras**: AusÃªncia de sistema integrado para receber demandas excedentes

---

## Arquitetura

### Stack TecnolÃ³gico

| Camada | Tecnologia |
|--------|------------|
| **Backend** | Node.js + Fastify + TypeScript |
| **Banco de Dados** | PostgreSQL + PostGIS (geolocalizaÃ§Ã£o) |
| **ORM** | Prisma |
| **Cache/Real-time** | Redis + Socket.IO |
| **Mobile** | React Native (Expo) |
| **Web (Cliente/Admin)** | Next.js 14 |
| **Pagamentos** | Mercado Pago (Pix) |
| **Mapas** | Google Maps API |
| **Push Notifications** | Firebase Cloud Messaging |

### Estrutura do Monorepo

```
rotax1/
â”œâ”€â”€ apps/
â”‚   â”œâ”€â”€ api/                 # API REST (Fastify)
â”‚   â”‚   â””â”€â”€ src/
â”‚   â”‚       â”œâ”€â”€ common/      # Config, errors, middlewares
â”‚   â”‚       â””â”€â”€ modules/     # MÃ³dulos de feature (auth, orders, etc.)
â”‚   â”œâ”€â”€ mobile/              # App React Native (Cliente + Entregador)
â”‚   â”œâ”€â”€ web/                 # Portal do Cliente (Next.js)
â”‚   â””â”€â”€ admin/               # Painel Administrativo (Next.js)
â”œâ”€â”€ packages/
â”‚   â”œâ”€â”€ database/            # Prisma schema e migraÃ§Ãµes
â”‚   â”œâ”€â”€ shared/              # Tipos e validaÃ§Ãµes compartilhados
â”‚   â””â”€â”€ ui/                  # Componentes UI compartilhados
â””â”€â”€ infrastructure/
    â””â”€â”€ docker/              # Docker Compose para dev local
```

---

## Funcionalidades Principais

### Para Clientes
- Cadastro e autenticaÃ§Ã£o via email/telefone
- SolicitaÃ§Ã£o de entregas com mÃºltiplos endereÃ§os
- CÃ¡lculo de preÃ§o em tempo real baseado em distÃ¢ncia
- Pagamento via Pix (integraÃ§Ã£o Mercado Pago)
- Rastreamento em tempo real do entregador
- HistÃ³rico de pedidos e avaliaÃ§Ãµes
- NotificaÃ§Ãµes push de status

### Para Entregadores
- Cadastro com validaÃ§Ã£o de documentos (CNH, veÃ­culo)
- VisualizaÃ§Ã£o de pedidos disponÃ­veis na regiÃ£o
- Aceite/rejeiÃ§Ã£o de corridas
- NavegaÃ§Ã£o integrada (Google Maps)
- ComprovaÃ§Ã£o de entrega com foto
- Dashboard de ganhos
- Toggle online/offline

### Para Administradores
- GestÃ£o de usuÃ¡rios (clientes, entregadores, transportadoras)
- AprovaÃ§Ã£o de cadastros de entregadores
- Monitoramento de pedidos em tempo real
- RelatÃ³rios financeiros e operacionais
- ConfiguraÃ§Ã£o de taxas e comissÃµes
- GestÃ£o de regiÃµes de atendimento

---

## Como Rodar o Projeto

### PrÃ©-requisitos

- Node.js 20+
- pnpm 8+
- Docker (para banco de dados local)

### Setup

```bash
# Clone o repositÃ³rio
git clone git@github.com:inematds/RotaX1.git
cd RotaX1

# Instale as dependÃªncias
pnpm install

# Configure as variÃ¡veis de ambiente
cp .env.example .env

# Inicie o banco de dados local
cd infrastructure/docker
docker-compose up -d
cd ../..

# Gere o cliente Prisma
pnpm db:generate

# Rode as migraÃ§Ãµes
pnpm db:migrate

# Popule o banco com dados de teste
pnpm db:seed

# Inicie o servidor de desenvolvimento
pnpm dev
```

### Comandos DisponÃ­veis

| Comando | DescriÃ§Ã£o |
|---------|-----------|
| `pnpm dev` | Inicia todos os apps em modo desenvolvimento |
| `pnpm build` | Compila todos os pacotes |
| `pnpm lint` | Executa o linter em todos os pacotes |
| `pnpm test` | Roda os testes |
| `pnpm db:generate` | Gera o cliente Prisma |
| `pnpm db:migrate` | Executa migraÃ§Ãµes do banco |
| `pnpm db:seed` | Popula o banco com dados de teste |
| `pnpm db:studio` | Abre o Prisma Studio |

---

## VariÃ¡veis de Ambiente

```bash
# Database (Supabase ou PostgreSQL local)
DATABASE_URL="postgresql://postgres:password@localhost:5432/rotax1"

# Redis
REDIS_URL="redis://localhost:6379"

# JWT
JWT_SECRET="sua-chave-secreta-minimo-32-caracteres"
JWT_REFRESH_SECRET="sua-chave-refresh-minimo-32-caracteres"

# Google Maps
GOOGLE_MAPS_API_KEY="sua-api-key"

# Mercado Pago
MERCADO_PAGO_ACCESS_TOKEN="seu-token"
MERCADO_PAGO_WEBHOOK_SECRET="seu-secret"

# Firebase
FIREBASE_PROJECT_ID="seu-projeto"
FIREBASE_PRIVATE_KEY="sua-chave"
FIREBASE_CLIENT_EMAIL="seu-email"
```

---

## API Endpoints

### AutenticaÃ§Ã£o

| MÃ©todo | Endpoint | DescriÃ§Ã£o |
|--------|----------|-----------|
| POST | `/auth/register` | Cadastro de novo usuÃ¡rio |
| POST | `/auth/login` | Login (retorna JWT) |
| POST | `/auth/refresh` | Renova access token |
| GET | `/auth/me` | Dados do usuÃ¡rio autenticado |

### Clientes

| MÃ©todo | Endpoint | DescriÃ§Ã£o |
|--------|----------|-----------|
| GET | `/clients/profile` | Perfil do cliente |
| PATCH | `/clients/profile` | Atualiza perfil |
| POST | `/clients/profile/photo` | Upload foto de perfil |
| GET | `/clients/addresses` | Lista endereÃ§os |
| POST | `/clients/addresses` | Adiciona endereÃ§o |
| PATCH | `/clients/addresses/:id` | Atualiza endereÃ§o |
| DELETE | `/clients/addresses/:id` | Remove endereÃ§o |

### FarmÃ¡cias

| MÃ©todo | Endpoint | DescriÃ§Ã£o |
|--------|----------|-----------|
| GET | `/pharmacies` | Busca farmÃ¡cias |
| GET | `/pharmacies/:id` | Detalhes da farmÃ¡cia |
| GET | `/pharmacies/nearby` | FarmÃ¡cias prÃ³ximas |

### Pedidos (Cliente)

| MÃ©todo | Endpoint | DescriÃ§Ã£o |
|--------|----------|-----------|
| POST | `/orders/calculate-price` | Calcula preÃ§o |
| POST | `/orders` | Cria pedido |
| GET | `/orders/:id` | Detalhes do pedido |
| GET | `/orders/:id/track` | Rastrear pedido |
| GET | `/orders/history` | HistÃ³rico de pedidos |
| POST | `/orders/:id/cancel` | Cancela pedido |
| POST | `/orders/:id/rate` | Avalia pedido |

### Motoristas

| MÃ©todo | Endpoint | DescriÃ§Ã£o |
|--------|----------|-----------|
| GET | `/drivers/profile` | Perfil do motorista |
| PATCH | `/drivers/profile` | Atualiza perfil |
| POST | `/drivers/documents` | Upload documento |
| POST | `/drivers/availability` | Toggle online/offline |
| POST | `/drivers/location` | Atualiza localizaÃ§Ã£o |
| GET | `/drivers/orders/available` | Pedidos disponÃ­veis |
| POST | `/drivers/orders/accept` | Aceita pedido |
| GET | `/drivers/orders/current` | Pedido atual |
| POST | `/drivers/orders/:id/pickup` | Confirma coleta |
| POST | `/drivers/orders/:id/deliver` | Confirma entrega |
| GET | `/drivers/earnings` | Ganhos |

### Admin

| MÃ©todo | Endpoint | DescriÃ§Ã£o |
|--------|----------|-----------|
| GET | `/admin/dashboard` | Dashboard KPIs |
| GET | `/admin/users` | Lista usuÃ¡rios |
| PATCH | `/admin/users/:id/status` | Bloqueia/desbloqueia |
| GET | `/admin/drivers/pending` | Motoristas pendentes |
| POST | `/admin/drivers/:id/approve` | Aprova/rejeita motorista |
| GET | `/admin/orders` | Lista pedidos |
| POST | `/admin/orders/:id/cancel` | Cancela pedido |
| POST | `/admin/orders/:id/reassign` | Reatribui motorista |
| GET | `/admin/financial/report` | RelatÃ³rio financeiro |
| GET | `/admin/financial/payouts` | Lista repasses |
| POST | `/admin/financial/payouts/process` | Processa repasses |

### Health Check

| MÃ©todo | Endpoint | DescriÃ§Ã£o |
|--------|----------|-----------|
| GET | `/health` | Status da API |
| GET | `/docs` | DocumentaÃ§Ã£o Swagger |

---

## Modelo de Dados

### Entidades Principais

```
User (usuÃ¡rio base)
â”œâ”€â”€ Client (cliente - solicita entregas)
â”œâ”€â”€ Driver (entregador - realiza entregas)
â”œâ”€â”€ Carrier (transportadora - recebe demanda excedente)
â””â”€â”€ Admin (administrador)

Order (pedido)
â”œâ”€â”€ pickup_address (endereÃ§o de coleta)
â”œâ”€â”€ delivery_address (endereÃ§o de entrega)
â”œâ”€â”€ status (PENDING_PAYMENT â†’ DELIVERED)
â”œâ”€â”€ Payment (pagamento via Pix)
â””â”€â”€ Rating (avaliaÃ§Ã£o pÃ³s-entrega)

Address (endereÃ§os salvos do cliente)
```

---

## Modelo de NegÃ³cio

### Comissionamento

| Tipo de Entrega | ComissÃ£o Plataforma | Ganho Entregador |
|-----------------|---------------------|------------------|
| Standard | 20% | 80% |
| Express | 20% | 80% |

### PrecificaÃ§Ã£o Base

- **Tarifa base**: R$ 5,00
- **Por km**: R$ 2,00
- **Multiplicador Express**: 1.5x
- **Taxa mÃ­nima**: R$ 8,00

---

## DocumentaÃ§Ã£o TÃ©cnica

| Documento | LocalizaÃ§Ã£o |
|-----------|-------------|
| PRD (Requisitos) | `docs/prd.md` |
| Arquitetura | `docs/architecture.md` |
| Coding Standards | `docs/architecture/coding-standards.md` |
| Tech Stack | `docs/architecture/tech-stack.md` |
| Stories (Ã‰picos) | `docs/prd/epic-*.md` |
| Stories (Detalhadas) | `docs/stories/story-*.md` |

---

## Roadmap

### Fase 1: MVP (Backend Completo âœ…)
- [x] Infraestrutura base (monorepo, DB, auth)
- [x] API Cliente (perfil, endereÃ§os, pedidos, pagamento, tracking)
- [x] API Entregador (cadastro, aceite, coleta, entrega, ganhos)
- [x] API Admin (dashboard, usuÃ¡rios, pedidos, financeiro)
- [ ] Frontend Mobile (React Native)
- [ ] Frontend Web Admin (Next.js)

### Fase 2: ExpansÃ£o
- [ ] MÃ³dulo de transportadoras (Epic 5 - stories prontas)
- [ ] IntegraÃ§Ã£o Mercado Pago (Pix real)
- [ ] Push notifications (Firebase)
- [ ] App iOS/Android nas lojas

### Fase 3: Escala
- [ ] ExpansÃ£o para outros nichos (congelados)
- [ ] API aberta para integraÃ§Ãµes
- [ ] Programa de fidelidade

---

## ContribuiÃ§Ã£o

Este Ã© um projeto privado. Para contribuir:

1. FaÃ§a um fork do repositÃ³rio
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanÃ§as (`git commit -m 'feat: Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

### ConvenÃ§Ãµes de Commit

Usamos [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` Nova funcionalidade
- `fix:` CorreÃ§Ã£o de bug
- `docs:` DocumentaÃ§Ã£o
- `refactor:` RefatoraÃ§Ã£o
- `test:` Testes
- `chore:` ManutenÃ§Ã£o

---

## LicenÃ§a

Projeto privado - Todos os direitos reservados.

---

## Contato

Para mais informaÃ§Ãµes sobre o projeto, entre em contato com a equipe de desenvolvimento.

---

Projeto adaptado da comunidade INEMA TDS - Marca Arckhe