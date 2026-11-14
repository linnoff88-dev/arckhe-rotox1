# Epic 4: Admin Module - Operations

**Status:** Ready for Development
**Priority:** P1 - Important
**Estimated Stories:** 4

## Goal

Fornecer painel web para administradores gerenciarem usuários, pedidos, finanças e configurações do sistema.

## Dependencies

- Epic 1: Foundation & Core Infrastructure
- Epic 2: Client Module (for order data)
- Epic 3: Driver Module (for driver data)

## Success Criteria

- [ ] Dashboard com métricas em tempo real
- [ ] Gestão de usuários com aprovação de drivers
- [ ] Visualização e gestão de pedidos
- [ ] Controle financeiro e relatórios

---

## Stories

### Story 4.1: Admin Authentication & Dashboard

**Priority:** P1
**Estimate:** Medium

**As an** admin,
**I want** a secure login and overview dashboard,
**so that** I can monitor platform operations.

**Acceptance Criteria:**
1. Login separado para admins com 2FA opcional
2. Dashboard com métricas: pedidos hoje, entregas ativas, receita, drivers online
3. Gráficos de tendência (últimos 7/30 dias)
4. Alertas de problemas (pedidos stuck, reclamações)

**Technical Notes:**
- Next.js 14 App Router para admin panel
- Middleware de auth verificando role ADMIN
- 2FA opcional com TOTP (speakeasy)
- Métricas:
  - Pedidos hoje: COUNT WHERE created_at = today
  - Entregas ativas: COUNT WHERE status IN (COLLECTING, DELIVERING)
  - Receita: SUM(platform_fee) WHERE paid_at = today
  - Drivers online: Redis SCARD drivers:online
- Charts: recharts ou tremor
- WebSocket para updates em tempo real

**Dependencies:** Epic 1 complete

---

### Story 4.2: User Management

**Priority:** P1
**Estimate:** Medium

**As an** admin,
**I want** to manage clients, drivers and carriers,
**so that** I can control platform access.

**Acceptance Criteria:**
1. Lista de usuários com busca e filtros
2. Detalhes do usuário com histórico
3. Aprovar/rejeitar drivers (visualizar documentos)
4. Bloquear/desbloquear usuários
5. Log de ações administrativas

**Technical Notes:**
- Endpoints:
  - GET /admin/users?role=&status=&search=
  - GET /admin/users/:id
  - PUT /admin/users/:id/status
  - PUT /admin/drivers/:id/approve
  - PUT /admin/drivers/:id/reject
- Presigned URLs para visualizar documentos
- Audit log table: admin_actions (admin_id, action, target_id, details, created_at)
- Paginação server-side com cursor
- Filtros: role, status, date_range

**Dependencies:** Story 4.1

---

### Story 4.3: Order Management

**Priority:** P1
**Estimate:** Medium

**As an** admin,
**I want** to view and manage all orders,
**so that** I can resolve issues and ensure quality.

**Acceptance Criteria:**
1. Lista de pedidos com filtros (status, data, região)
2. Visualização em mapa de pedidos ativos
3. Detalhes do pedido com timeline completa
4. Ações: cancelar, reembolsar, reatribuir driver
5. Comunicação com cliente/driver (chat interno)

**Technical Notes:**
- Endpoints:
  - GET /admin/orders?status=&date_from=&date_to=&region=
  - GET /admin/orders/:id
  - POST /admin/orders/:id/cancel
  - POST /admin/orders/:id/refund
  - POST /admin/orders/:id/reassign
- Mapa: Google Maps com markers coloridos por status
- Timeline: array de status changes com timestamps
- Chat: tabela order_messages (order_id, sender_type, sender_id, message, created_at)
- Refund via Mercado Pago API

**Dependencies:** Story 4.2, Epic 2, Epic 3

---

### Story 4.4: Financial Control & Reports

**Priority:** P1
**Estimate:** Medium

**As an** admin,
**I want** to manage finances and generate reports,
**so that** I can control revenue and payouts.

**Acceptance Criteria:**
1. Dashboard financeiro: receita, comissões, repasses pendentes
2. Lista de transações com filtros
3. Processamento de repasses para drivers
4. Relatórios exportáveis (CSV, PDF)
5. Configuração de taxas e comissões por categoria/região

**Technical Notes:**
- Endpoints:
  - GET /admin/finance/dashboard
  - GET /admin/finance/transactions
  - POST /admin/finance/payouts/process
  - GET /admin/finance/reports/export?format=csv|pdf
  - GET/PUT /admin/settings/pricing
- Métricas:
  - Receita: SUM(price) WHERE status = DELIVERED
  - Comissões: SUM(platform_fee)
  - Repasses pendentes: SUM(driver_earning) WHERE payout_status = PENDING
- Payout batch processing via BullMQ
- Pricing config em tabela settings ou JSON
- PDF generation: puppeteer ou pdfkit

**Dependencies:** Story 4.3

---

## Definition of Done (Epic Level)

- [ ] Todas as 4 stories completadas
- [ ] Admin panel deployado e funcional
- [ ] Aprovação de drivers funcionando
- [ ] Relatórios financeiros validados
- [ ] Audit log registrando todas ações
