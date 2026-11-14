# Epic 2: Client Module - Order Flow

**Status:** Ready for Development
**Priority:** P0 - Critical Path
**Estimated Stories:** 5

## Goal

Implementar o fluxo completo do cliente desde criação de pedido até rastreamento, incluindo cálculo de preço, pagamento e notificações.

## Dependencies

- Epic 1: Foundation & Core Infrastructure (must be complete)

## Success Criteria

- [ ] Cliente pode criar pedido com endereços
- [ ] Cálculo automático de preço e distância
- [ ] Pagamento via Pix funcional
- [ ] Rastreamento em tempo real no mapa
- [ ] Histórico de pedidos com avaliações

---

## Stories

### Story 2.1: Client Profile Management

**Priority:** P1
**Estimate:** Small

**As a** client,
**I want** to manage my profile and saved addresses,
**so that** I can create orders faster.

**Acceptance Criteria:**
1. Endpoints CRUD para perfil do cliente
2. Gestão de endereços salvos (múltiplos)
3. Validação de CEP e geocoding
4. Upload de foto de perfil (S3)
5. Testes de integração

**Technical Notes:**
- Endpoints: GET/PUT /clients/me, CRUD /clients/addresses
- Google Maps Geocoding API para validar endereços
- Cloudflare R2 para storage (S3-compatible)
- Multer para upload de arquivos
- Cache de geocoding em Redis (24h TTL)

**Dependencies:** Epic 1 complete

---

### Story 2.2: Order Creation Flow

**Priority:** P0
**Estimate:** Medium

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

**Technical Notes:**
- Fórmula de preço: base + (km * taxa_km) + (urgency_multiplier)
  - Base: R$ 5.00
  - Taxa/km: R$ 2.50 (STANDARD), R$ 3.50 (EXPRESS)
  - Veterinário: +10%
  - Congelados: +20%
- Google Maps Distance Matrix API
- Zod schema para validação
- Transação de banco para criar order + payment

**Dependencies:** Story 2.1

---

### Story 2.3: Payment Integration (Pix)

**Priority:** P0
**Estimate:** Medium

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

**Technical Notes:**
- Mercado Pago SDK: mercadopago
- Endpoint: POST /payments/pix
- Webhook: POST /webhooks/mercadopago
- BullMQ job para timeout de pagamento
- Idempotency key para evitar duplicação
- Credenciais sandbox em .env

**Dependencies:** Story 2.2

---

### Story 2.4: Real-time Order Tracking

**Priority:** P0
**Estimate:** Medium

**As a** client,
**I want** to track my delivery in real-time on a map,
**so that** I know exactly where my order is.

**Acceptance Criteria:**
1. WebSocket connection para updates de localização
2. Endpoint GET /orders/:id/tracking
3. Atualização de posição a cada 10 segundos
4. Estados visuais: searching, driver_assigned, collecting, delivering, delivered
5. ETA dinâmico baseado em tráfego

**Technical Notes:**
- Socket.IO com namespace /tracking
- Redis Pub/Sub para broadcast de localização
- Room por order_id
- Client se inscreve em: `tracking:${orderId}`
- Driver publica em: `driver:${driverId}:location`
- Google Maps Directions API para ETA

**Dependencies:** Story 2.3

---

### Story 2.5: Order History & Ratings

**Priority:** P1
**Estimate:** Small

**As a** client,
**I want** to view my order history and rate drivers,
**so that** I can track my deliveries and provide feedback.

**Acceptance Criteria:**
1. Endpoint GET /orders com paginação e filtros
2. Detalhes do pedido com timeline de status
3. Endpoint POST /orders/:id/rating (1-5 estrelas + comentário)
4. Média de avaliação atualizada no perfil do driver
5. Notificação push ao driver sobre nova avaliação

**Technical Notes:**
- Paginação cursor-based (created_at)
- Filtros: status, date_range, category
- Trigger no banco para atualizar rating_avg
- FCM para push notification
- Só permitir rating após status DELIVERED

**Dependencies:** Story 2.4

---

## Definition of Done (Epic Level)

- [ ] Todas as 5 stories completadas
- [ ] Fluxo completo testado end-to-end
- [ ] Integração Mercado Pago validada em sandbox
- [ ] WebSocket tracking funcionando
- [ ] Deploy em staging com dados de teste
