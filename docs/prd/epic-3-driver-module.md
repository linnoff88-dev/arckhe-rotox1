# Epic 3: Driver Module - Delivery Flow

**Status:** Ready for Development
**Priority:** P0 - Critical Path
**Estimated Stories:** 5

## Goal

Permitir que entregadores se cadastrem, sejam aprovados, visualizem pedidos disponíveis, aceitem entregas e completem o fluxo com confirmação.

## Dependencies

- Epic 1: Foundation & Core Infrastructure
- Epic 2: Client Module (Story 2.2 - Order Creation)

## Success Criteria

- [ ] Driver pode se cadastrar com documentos
- [ ] Admin pode aprovar/rejeitar drivers
- [ ] Driver vê pedidos disponíveis na região
- [ ] Driver pode aceitar e completar entregas
- [ ] Dashboard de ganhos funcional

---

## Stories

### Story 3.1: Driver Registration & Document Upload

**Priority:** P0
**Estimate:** Medium

**As a** driver,
**I want** to register and upload my documents,
**so that** I can be approved to make deliveries.

**Acceptance Criteria:**
1. Formulário de cadastro específico para driver
2. Upload de documentos: CNH, documento do veículo, foto de perfil
3. Validação de tipo e tamanho de arquivo
4. Status: PENDING_APPROVAL após cadastro
5. Armazenamento seguro em S3 com URLs assinadas

**Technical Notes:**
- Endpoint: POST /auth/register (role: DRIVER)
- Endpoint: POST /drivers/documents
- Aceitar: JPG, PNG, PDF (max 5MB)
- Cloudflare R2 com presigned URLs (1h expiry)
- Campos obrigatórios: name, cpf, cnh, vehicle_type, vehicle_plate
- Notificar admin sobre novo cadastro (BullMQ)

**Dependencies:** Epic 1 complete

---

### Story 3.2: Driver Availability & Geolocation

**Priority:** P0
**Estimate:** Medium

**As a** driver,
**I want** to toggle my availability and share my location,
**so that** I can receive delivery requests.

**Acceptance Criteria:**
1. Toggle online/offline no app
2. Captura de geolocalização em background (quando online)
3. Atualização de posição a cada 30 segundos (quando online)
4. Armazenamento em Redis para queries rápidas
5. Respeito à bateria (otimização de GPS)

**Technical Notes:**
- Endpoint: PUT /drivers/availability { is_online: boolean }
- Endpoint: PUT /drivers/location { lat, lng }
- Redis key: `drivers:online:{driver_id}` com TTL 60s
- Redis GEO: `drivers:locations` para queries espaciais
- Mobile: expo-location com background task
- Heartbeat para detectar drivers offline

**Dependencies:** Story 3.1

---

### Story 3.3: Order Matching & Acceptance

**Priority:** P0
**Estimate:** Medium

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

**Technical Notes:**
- Endpoint: GET /drivers/available-orders
- Endpoint: POST /orders/:id/accept
- Query PostGIS: ST_DWithin(pickup_location, driver_location, 5000)
- Redis lock para evitar race condition no aceite
- BullMQ job para matching quando order status = SEARCHING_DRIVER
- FCM notification com payload do pedido

**Dependencies:** Story 3.2, Epic 2 Story 2.3

---

### Story 3.4: Delivery Navigation & Confirmation

**Priority:** P0
**Estimate:** Medium

**As a** driver,
**I want** navigation to pickup and delivery locations,
**so that** I can complete deliveries efficiently.

**Acceptance Criteria:**
1. Integração com Google Maps para navegação turn-by-turn
2. Botão "Iniciar Navegação" abre app de mapas externo
3. Confirmação de coleta com foto obrigatória
4. Confirmação de entrega com foto + assinatura digital (opcional)
5. Atualização automática de status em cada etapa

**Technical Notes:**
- Deep link para Google Maps: `google.navigation:q=${lat},${lng}`
- Endpoints:
  - POST /orders/:id/start-pickup
  - POST /orders/:id/confirm-pickup (with photo)
  - POST /orders/:id/start-delivery
  - POST /orders/:id/confirm-delivery (with photo)
- Upload de fotos para R2
- WebSocket emit para cliente a cada mudança de status
- Signature pad: react-native-signature-canvas

**Dependencies:** Story 3.3

---

### Story 3.5: Driver Earnings Dashboard

**Priority:** P1
**Estimate:** Small

**As a** driver,
**I want** to see my earnings and delivery history,
**so that** I can track my income.

**Acceptance Criteria:**
1. Dashboard com ganhos: hoje, semana, mês
2. Lista de entregas realizadas com valores
3. Gráfico de ganhos por dia/semana
4. Informações de próximo repasse
5. Exportação de relatório (PDF)

**Technical Notes:**
- Endpoint: GET /drivers/earnings?period=day|week|month
- Endpoint: GET /drivers/deliveries (paginado)
- Endpoint: GET /drivers/earnings/export (PDF)
- Cálculo: SUM(driver_earning) WHERE delivered_at IN period
- Gráfico: dados agregados por dia
- PDF: @react-pdf/renderer ou similar

**Dependencies:** Story 3.4

---

## Definition of Done (Epic Level)

- [ ] Todas as 5 stories completadas
- [ ] Fluxo driver completo testado
- [ ] Geolocalização funcionando em background
- [ ] Matching em tempo real validado
- [ ] Dashboard de ganhos com dados reais
