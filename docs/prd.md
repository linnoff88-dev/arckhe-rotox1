# Rotax1 - Product Requirements Document (PRD)

**Version:** 1.0
**Status:** Draft
**Author:** PM Agent (BMAD)
**Date:** 2026-01-23

---

## 1. Goals and Background Context

### 1.1 Goals

- Criar uma plataforma digital de coleta e entrega focada em última milha
- Conectar clientes, entregadores autônomos e transportadoras em um ecossistema logístico
- Facilitar entregas locais e regionais com rastreamento em tempo real
- Gerar renda para entregadores autônomos (MEI)
- Oferecer solução logística acessível para PMEs e pequenos negócios
- Iniciar com nichos específicos: medicamentos veterinários e alimentos congelados
- Validar modelo de negócio em cidade piloto antes de escalar

### 1.2 Background Context

O mercado de logística de última milha no Brasil cresce aproximadamente 23% ao ano, com investimentos previstos de R$ 124,3 bilhões até 2026. Apesar disso, 63% dos consumidores abandonam carrinhos quando a entrega ultrapassa 3 dias, revelando uma demanda não atendida por entregas rápidas e confiáveis.

Os players dominantes (Loggi, Rappi, iFood) focam em grandes volumes e mercados genéricos, deixando nichos específicos como medicamentos veterinários e alimentos congelados subatendidos. Com 167,6 milhões de pets no Brasil e 285.000+ empresas no setor pet (49% PMEs), existe uma oportunidade clara para uma plataforma especializada que ofereça SLA garantido e integração com sistemas de clínicas e pet shops.

O Rotax1 posiciona-se como um marketplace logístico regional, começando com foco em nichos de alta recorrência e baixa concorrência direta, para depois expandir geograficamente e em categorias.

### 1.3 Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-01-23 | 1.0 | Initial PRD creation | PM Agent |

---

## 2. Requirements

### 2.1 Functional Requirements

**Módulo Cliente:**
- FR1: O sistema deve permitir cadastro e login de clientes (pessoa física e jurídica) com validação de email/telefone
- FR2: O sistema deve permitir criação de pedidos com endereço de coleta, entrega, descrição do item e urgência
- FR3: O sistema deve calcular automaticamente valor e prazo estimado baseado em distância e tipo de entrega
- FR4: O sistema deve oferecer pagamento via Pix e cartão de crédito/débito
- FR5: O sistema deve exibir rastreamento em tempo real da entrega com mapa
- FR6: O sistema deve permitir que clientes avaliem entregadores após a entrega (1-5 estrelas + comentário)
- FR7: O sistema deve manter histórico completo de pedidos do cliente
- FR8: O sistema deve enviar notificações (push/SMS) sobre status do pedido

**Módulo Entregador:**
- FR9: O sistema deve permitir cadastro de entregadores com upload de documentos (CNH, documento do veículo, foto)
- FR10: O sistema deve exigir aprovação manual de entregadores pelo admin antes de ativação
- FR11: O sistema deve capturar geolocalização do entregador quando disponível para entregas
- FR12: O sistema deve exibir pedidos disponíveis na região do entregador
- FR13: O sistema deve permitir que entregador aceite ou recuse pedidos
- FR14: O sistema deve exibir rota otimizada para coleta e entrega (integração Google Maps)
- FR15: O sistema deve permitir que entregador confirme coleta e entrega com foto/assinatura
- FR16: O sistema deve exibir dashboard de ganhos (diário, semanal, mensal)
- FR17: O sistema deve processar repasse financeiro para entregadores (semanal)

**Módulo Transportadora:**
- FR18: O sistema deve permitir cadastro de transportadoras com CNPJ e documentação
- FR19: O sistema deve permitir gestão de frota (cadastro de veículos e motoristas)
- FR20: O sistema deve direcionar pedidos de maior volume para transportadoras
- FR21: O sistema deve permitir que transportadoras definam áreas de atuação e capacidade

**Módulo Admin:**
- FR22: O sistema deve permitir aprovação/rejeição de cadastros de entregadores e transportadoras
- FR23: O sistema deve exibir dashboard de pedidos em tempo real (pendentes, em andamento, concluídos)
- FR24: O sistema deve permitir gestão de pedidos (cancelamento, reembolso, reassignment)
- FR25: O sistema deve exibir controle financeiro (receitas, comissões, repasses)
- FR26: O sistema deve gerar relatórios e métricas (entregas/dia, tempo médio, avaliações)
- FR27: O sistema deve permitir configuração de taxas e comissões por região/categoria
- FR28: O sistema deve permitir gestão de usuários (clientes, entregadores, admins)

**Geral:**
- FR29: O sistema deve suportar múltiplas categorias de entrega (veterinário, congelados, geral)
- FR30: O sistema deve implementar sistema de matching inteligente (entregador mais próximo/melhor avaliado)

### 2.2 Non-Functional Requirements

- NFR1: O sistema deve estar disponível 99.5% do tempo (uptime SLA)
- NFR2: O sistema deve responder a requisições em menos de 500ms (P95)
- NFR3: O sistema deve suportar 1.000 usuários simultâneos no MVP
- NFR4: O sistema deve escalar horizontalmente para suportar crescimento
- NFR5: O sistema deve estar em conformidade com LGPD (consentimento, anonimização, direito ao esquecimento)
- NFR6: O sistema deve usar HTTPS em todas as comunicações
- NFR7: O sistema deve armazenar senhas com hash bcrypt (custo mínimo 12)
- NFR8: O sistema deve implementar rate limiting para prevenir abuso
- NFR9: O sistema deve ter backup diário do banco de dados
- NFR10: O sistema deve funcionar em dispositivos móveis (iOS e Android) e web
- NFR11: A localização dos entregadores deve atualizar a cada 10 segundos durante entrega ativa
- NFR12: O sistema deve processar pagamentos via gateway confiável (Mercado Pago ou similar)

---

## 3. User Interface Design Goals

### 3.1 Overall UX Vision

Interface limpa, intuitiva e focada em eficiência. O cliente deve conseguir criar um pedido em menos de 60 segundos. O entregador deve visualizar e aceitar entregas com um único toque. Priorizar velocidade de interação sobre estética elaborada.

### 3.2 Key Interaction Paradigms

- **Cliente:** Fluxo wizard para criação de pedido (passo a passo guiado)
- **Entregador:** Lista de cards com pedidos disponíveis, swipe para aceitar/recusar
- **Admin:** Dashboard com métricas em cards e tabelas para gestão
- **Mapa:** Componente central para visualização de entregas e rastreamento

### 3.3 Core Screens and Views

**App Cliente:**
1. Login/Cadastro
2. Home (novo pedido + histórico recente)
3. Criação de Pedido (wizard 4 etapas)
4. Rastreamento em Tempo Real (mapa)
5. Histórico de Pedidos
6. Avaliação do Entregador
7. Perfil e Configurações

**App Entregador:**
1. Login/Cadastro com Upload de Docs
2. Home (toggle online/offline + pedidos disponíveis)
3. Detalhes do Pedido (aceitar/recusar)
4. Navegação (mapa com rota)
5. Confirmação de Coleta/Entrega (foto)
6. Dashboard de Ganhos
7. Perfil e Documentos

**Admin Panel:**
1. Dashboard Principal (métricas)
2. Gestão de Pedidos
3. Gestão de Entregadores (aprovação)
4. Gestão de Transportadoras
5. Controle Financeiro
6. Relatórios
7. Configurações

### 3.4 Accessibility

WCAG AA - Contraste adequado, labels em formulários, navegação por teclado no admin panel.

### 3.5 Branding

- **Cores primárias:** Azul (#1E3A8A) e Laranja (#F97316) conforme logo Rotax1
- **Fonte:** Sans-serif moderna (Inter ou similar)
- **Ícones:** Outline style, consistentes
- **Logo:** Usar versões light/dark conforme fundo

### 3.6 Target Device and Platforms

- **Cliente:** Mobile-first (React Native para iOS/Android) + Web responsivo
- **Entregador:** Mobile only (React Native para iOS/Android)
- **Admin:** Web responsivo (desktop-first)

---

## 4. Technical Assumptions

### 4.1 Repository Structure

**Monorepo** usando pnpm workspaces:
```
rotax1/
├── apps/
│   ├── mobile/          # React Native (cliente + entregador)
│   ├── web/             # Next.js (cliente web)
│   └── admin/           # Next.js (admin panel)
├── packages/
│   ├── api/             # Node.js + Express/Fastify
│   ├── database/        # Prisma schemas + migrations
│   ├── shared/          # Types, utils compartilhados
│   └── ui/              # Componentes UI compartilhados
└── infrastructure/      # Docker, configs
```

### 4.2 Service Architecture

**Monolith Modular** para o MVP:
- API única com módulos bem separados (clients, drivers, orders, payments, admin)
- Fácil de desenvolver e deployar
- Migração para microserviços quando necessário (pós-validação)

### 4.3 Testing Requirements

- **Unit Tests:** Jest para lógica de negócio (coverage mínimo 70%)
- **Integration Tests:** Supertest para endpoints da API
- **E2E Tests:** Detox para fluxos críticos do mobile (pós-MVP)
- **Manual Testing:** Endpoints documentados no Swagger para QA manual

### 4.4 Additional Technical Assumptions

- **Linguagem Backend:** TypeScript + Node.js (v20+)
- **Framework Backend:** Fastify (performance) ou Express (simplicidade)
- **Banco de Dados:** PostgreSQL 15+ com PostGIS para queries geoespaciais
- **ORM:** Prisma
- **Cache:** Redis para sessões e dados frequentes
- **Fila:** BullMQ para processamento assíncrono (notificações, repasses)
- **Storage:** AWS S3 ou Cloudflare R2 para fotos e documentos
- **Maps:** Google Maps API (geolocalização, rotas, geocoding)
- **Pagamentos:** Mercado Pago API (Pix, cartão)
- **Push Notifications:** Firebase Cloud Messaging (FCM)
- **Hosting:** Railway ou Render para MVP (fácil, baixo custo)
- **Mobile:** React Native com Expo para desenvolvimento rápido
- **Web:** Next.js 14+ com App Router
- **State Management:** Zustand (mobile) + React Query (data fetching)
- **Auth:** JWT + Refresh Tokens, OAuth opcional (Google)

---

## 5. Epic List

### Epic 1: Foundation & Core Infrastructure
**Goal:** Estabelecer projeto, autenticação e estrutura base da API com health check funcional.

### Epic 2: Client Module - Order Flow
**Goal:** Permitir que clientes criem pedidos, paguem e acompanhem entregas em tempo real.

### Epic 3: Driver Module - Delivery Flow
**Goal:** Permitir que entregadores se cadastrem, aceitem pedidos e realizem entregas com navegação.

### Epic 4: Admin Module - Operations
**Goal:** Fornecer painel administrativo para gestão de usuários, pedidos e financeiro.

### Epic 5: Carrier Module (Phase 2)
**Goal:** Integrar transportadoras para pedidos de maior volume.

---

## 6. Epic Details

### Epic 1: Foundation & Core Infrastructure

**Goal:** Estabelecer a base técnica do projeto incluindo setup do monorepo, autenticação JWT, modelos de dados core e API health check. Ao final deste épico, teremos um sistema deployável com login funcional.

#### Story 1.1: Project Setup & Monorepo Structure
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

#### Story 1.2: Database Setup & Core Models
**As a** developer,
**I want** database schema with core entities,
**so that** I can persist and query application data.

**Acceptance Criteria:**
1. PostgreSQL + PostGIS configurado (Docker Compose)
2. Prisma schema com models: User, Client, Driver, Order, Vehicle
3. Migrations iniciais criadas e aplicadas
4. Seed script com dados de teste
5. Conexão testada e documentada

#### Story 1.3: Authentication System
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

#### Story 1.4: API Base Structure & Health Check
**As a** developer,
**I want** a well-structured API with documentation,
**so that** I can develop and test endpoints efficiently.

**Acceptance Criteria:**
1. Fastify/Express configurado com error handling global
2. Swagger/OpenAPI documentation auto-gerada
3. Health check endpoint: GET /health
4. Rate limiting configurado (100 req/min por IP)
5. CORS configurado para origens permitidas
6. Logger estruturado (pino)
7. Deploy funcional em ambiente de staging

---

### Epic 2: Client Module - Order Flow

**Goal:** Implementar o fluxo completo do cliente desde criação de pedido até rastreamento, incluindo cálculo de preço, pagamento e notificações.

#### Story 2.1: Client Profile Management
**As a** client,
**I want** to manage my profile and saved addresses,
**so that** I can create orders faster.

**Acceptance Criteria:**
1. Endpoints CRUD para perfil do cliente
2. Gestão de endereços salvos (múltiplos)
3. Validação de CEP e geocoding
4. Upload de foto de perfil (S3)
5. Testes de integração

#### Story 2.2: Order Creation Flow
**As a** client,
**I want** to create a delivery order with pickup and delivery addresses,
**so that** I can request a delivery service.

**Acceptance Criteria:**
1. Endpoint POST /orders com validação completa
2. Campos: pickup_address, delivery_address, description, category, urgency
3. Cálculo automático de distância (Google Maps Distance Matrix)
4. Cálculo de preço baseado em distância + categoria + urgência
5. Status inicial: PENDING_PAYMENT
6. Retorno com estimativa de tempo e preço

#### Story 2.3: Payment Integration (Pix)
**As a** client,
**I want** to pay for my order via Pix,
**so that** the delivery can be dispatched.

**Acceptance Criteria:**
1. Integração com Mercado Pago API
2. Geração de QR Code Pix
3. Webhook para confirmação de pagamento
4. Atualização de status: PENDING_PAYMENT → SEARCHING_DRIVER
5. Timeout de pagamento (30 min)
6. Testes com sandbox do Mercado Pago

#### Story 2.4: Real-time Order Tracking
**As a** client,
**I want** to track my delivery in real-time on a map,
**so that** I know exactly where my order is.

**Acceptance Criteria:**
1. WebSocket connection para updates de localização
2. Endpoint GET /orders/:id/tracking
3. Atualização de posição a cada 10 segundos
4. Estados visuais: searching, driver_assigned, collecting, delivering, delivered
5. ETA dinâmico baseado em tráfego

#### Story 2.5: Order History & Ratings
**As a** client,
**I want** to view my order history and rate drivers,
**so that** I can track my deliveries and provide feedback.

**Acceptance Criteria:**
1. Endpoint GET /orders com paginação e filtros
2. Detalhes do pedido com timeline de status
3. Endpoint POST /orders/:id/rating (1-5 estrelas + comentário)
4. Média de avaliação atualizada no perfil do driver
5. Notificação push ao driver sobre nova avaliação

---

### Epic 3: Driver Module - Delivery Flow

**Goal:** Permitir que entregadores se cadastrem, sejam aprovados, visualizem pedidos disponíveis, aceitem entregas e completem o fluxo com confirmação.

#### Story 3.1: Driver Registration & Document Upload
**As a** driver,
**I want** to register and upload my documents,
**so that** I can be approved to make deliveries.

**Acceptance Criteria:**
1. Formulário de cadastro específico para driver
2. Upload de documentos: CNH, documento do veículo, foto de perfil
3. Validação de tipo e tamanho de arquivo
4. Status: PENDING_APPROVAL após cadastro
5. Armazenamento seguro em S3 com URLs assinadas

#### Story 3.2: Driver Availability & Geolocation
**As a** driver,
**I want** to toggle my availability and share my location,
**so that** I can receive delivery requests.

**Acceptance Criteria:**
1. Toggle online/offline no app
2. Captura de geolocalização em background (quando online)
3. Atualização de posição a cada 30 segundos (quando online)
4. Armazenamento em Redis para queries rápidas
5. Respeito à bateria (otimização de GPS)

#### Story 3.3: Order Matching & Acceptance
**As a** driver,
**I want** to see available orders nearby and accept them,
**so that** I can earn money making deliveries.

**Acceptance Criteria:**
1. Lista de pedidos SEARCHING_DRIVER em raio de 5km
2. Ordenação por proximidade e valor
3. Detalhes do pedido: endereços, distância, valor, categoria
4. Botões aceitar/recusar com timeout (60s)
5. Matching: primeiro driver a aceitar ganha
6. Notificação push para novos pedidos na área

#### Story 3.4: Delivery Navigation & Confirmation
**As a** driver,
**I want** navigation to pickup and delivery locations,
**so that** I can complete deliveries efficiently.

**Acceptance Criteria:**
1. Integração com Google Maps para navegação turn-by-turn
2. Botão "Iniciar Navegação" abre app de mapas externo
3. Confirmação de coleta com foto obrigatória
4. Confirmação de entrega com foto + assinatura digital (opcional)
5. Atualização automática de status em cada etapa

#### Story 3.5: Driver Earnings Dashboard
**As a** driver,
**I want** to see my earnings and delivery history,
**so that** I can track my income.

**Acceptance Criteria:**
1. Dashboard com ganhos: hoje, semana, mês
2. Lista de entregas realizadas com valores
3. Gráfico de ganhos por dia/semana
4. Informações de próximo repasse
5. Exportação de relatório (PDF)

---

### Epic 4: Admin Module - Operations

**Goal:** Fornecer painel web para administradores gerenciarem usuários, pedidos, finanças e configurações do sistema.

#### Story 4.1: Admin Authentication & Dashboard
**As an** admin,
**I want** a secure login and overview dashboard,
**so that** I can monitor platform operations.

**Acceptance Criteria:**
1. Login separado para admins com 2FA opcional
2. Dashboard com métricas: pedidos hoje, entregas ativas, receita, drivers online
3. Gráficos de tendência (últimos 7/30 dias)
4. Alertas de problemas (pedidos stuck, reclamações)

#### Story 4.2: User Management
**As an** admin,
**I want** to manage clients, drivers and carriers,
**so that** I can control platform access.

**Acceptance Criteria:**
1. Lista de usuários com busca e filtros
2. Detalhes do usuário com histórico
3. Aprovar/rejeitar drivers (visualizar documentos)
4. Bloquear/desbloquear usuários
5. Log de ações administrativas

#### Story 4.3: Order Management
**As an** admin,
**I want** to view and manage all orders,
**so that** I can resolve issues and ensure quality.

**Acceptance Criteria:**
1. Lista de pedidos com filtros (status, data, região)
2. Visualização em mapa de pedidos ativos
3. Detalhes do pedido com timeline completa
4. Ações: cancelar, reembolsar, reatribuir driver
5. Comunicação com cliente/driver (chat interno)

#### Story 4.4: Financial Control & Reports
**As an** admin,
**I want** to manage finances and generate reports,
**so that** I can control revenue and payouts.

**Acceptance Criteria:**
1. Dashboard financeiro: receita, comissões, repasses pendentes
2. Lista de transações com filtros
3. Processamento de repasses para drivers
4. Relatórios exportáveis (CSV, PDF)
5. Configuração de taxas e comissões por categoria/região

---

### Epic 5: Carrier Module (Phase 2)

**Goal:** Expandir a plataforma para incluir transportadoras que podem atender pedidos de maior volume ou rotas específicas.

#### Story 5.1: Carrier Registration
**As a** carrier company,
**I want** to register my company on the platform,
**so that** I can receive delivery requests.

**Acceptance Criteria:**
1. Cadastro de empresa com CNPJ
2. Upload de documentação (contrato social, alvará)
3. Definição de áreas de atuação
4. Aprovação por admin

#### Story 5.2: Fleet Management
**As a** carrier,
**I want** to manage my vehicles and drivers,
**so that** I can assign deliveries to my team.

**Acceptance Criteria:**
1. CRUD de veículos (placa, tipo, capacidade)
2. CRUD de motoristas vinculados
3. Disponibilidade por veículo/motorista

#### Story 5.3: Carrier Order Flow
**As a** carrier,
**I want** to receive and manage bulk delivery requests,
**so that** I can fulfill larger orders.

**Acceptance Criteria:**
1. Recebimento de pedidos acima de X kg ou volume
2. Aceite/recusa com proposta de preço
3. Atribuição interna para motorista/veículo
4. Tracking unificado na plataforma

---

## 7. Checklist Results Report

*To be completed after PRD review with PO agent.*

---

## 8. Next Steps

### 8.1 UX Expert Prompt

```
Olá UX Expert! Preciso que você crie as especificações de frontend para o Rotax1
baseado neste PRD. Foque em:
1. Wireframes de baixa fidelidade para as telas core
2. User flows para os principais fluxos (criar pedido, aceitar entrega)
3. Especificações de componentes reutilizáveis
4. Guidelines de responsividade mobile-first
```

### 8.2 Architect Prompt

```
Olá Architect! Preciso que você crie a arquitetura técnica do Rotax1 baseado
neste PRD. Use as Technical Assumptions como ponto de partida e detalhe:
1. Diagrama de arquitetura do sistema
2. Schema completo do banco de dados
3. Especificação de APIs (endpoints, payloads)
4. Tech stack final com justificativas
5. Plano de deployment e infraestrutura
```
