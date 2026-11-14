# Epic 5: Carrier Module (Phase 2)

**Status:** Backlog - Future Development
**Priority:** P2 - Nice to Have
**Estimated Stories:** 3

## Goal

Expandir a plataforma para incluir transportadoras que podem atender pedidos de maior volume ou rotas específicas.

## Dependencies

- Epic 1-4 complete (full MVP)
- Validated demand for larger deliveries

## Success Criteria

- [ ] Transportadoras podem se cadastrar
- [ ] Gestão de frota funcional
- [ ] Pedidos grandes direcionados para transportadoras
- [ ] Integração com fluxo existente

---

## Stories

### Story 5.1: Carrier Registration

**Priority:** P2
**Estimate:** Medium

**As a** carrier company,
**I want** to register my company on the platform,
**so that** I can receive delivery requests.

**Acceptance Criteria:**
1. Cadastro de empresa com CNPJ
2. Upload de documentação (contrato social, alvará)
3. Definição de áreas de atuação
4. Aprovação por admin

**Technical Notes:**
- Model: Carrier (id, user_id, company_name, cnpj, documents[], regions[], status)
- Endpoints similar ao driver registration
- Admin approval flow
- Multi-region support com polygon ou lista de CEPs

**Dependencies:** MVP Complete (Epic 1-4)

---

### Story 5.2: Fleet Management

**Priority:** P2
**Estimate:** Medium

**As a** carrier,
**I want** to manage my vehicles and drivers,
**so that** I can assign deliveries to my team.

**Acceptance Criteria:**
1. CRUD de veículos (placa, tipo, capacidade)
2. CRUD de motoristas vinculados
3. Disponibilidade por veículo/motorista

**Technical Notes:**
- Models:
  - CarrierVehicle (id, carrier_id, plate, type, capacity_kg)
  - CarrierDriver (id, carrier_id, name, phone, assigned_vehicle_id)
- Dashboard para carrier gerenciar sua frota
- Calendário de disponibilidade

**Dependencies:** Story 5.1

---

### Story 5.3: Carrier Order Flow

**Priority:** P2
**Estimate:** Large

**As a** carrier,
**I want** to receive and manage bulk delivery requests,
**so that** I can fulfill larger orders.

**Acceptance Criteria:**
1. Recebimento de pedidos acima de X kg ou volume
2. Aceite/recusa com proposta de preço
3. Atribuição interna para motorista/veículo
4. Tracking unificado na plataforma

**Technical Notes:**
- Routing logic: if weight > 20kg OR volume = LARGE → route to carriers
- Bidding system ou fixed pricing
- Internal assignment workflow
- Same tracking interface for clients
- Payout to carrier account

**Dependencies:** Story 5.2

---

## Definition of Done (Epic Level)

- [ ] Todas as 3 stories completadas
- [ ] Fluxo carrier integrado ao sistema
- [ ] Pelo menos 2 transportadoras piloto
- [ ] Métricas separadas no admin dashboard

---

## Notes

Este épico é **Phase 2** e deve ser implementado apenas após validação do MVP com entregadores autônomos. A decisão de iniciar este épico depende de:

1. Demanda validada por entregas de maior volume
2. Parcerias com transportadoras locais confirmadas
3. MVP estável e funcionando
