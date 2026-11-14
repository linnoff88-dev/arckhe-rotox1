# Rotax1 - Coding Standards

## Languages & Runtimes

- **TypeScript:** 5.3+ (strict mode enabled)
- **Node.js:** 20 LTS
- **React Native:** 0.73+ with Expo SDK 50+

## Style & Linting

- ESLint with Airbnb base config
- Prettier for formatting
- Run `pnpm lint` before commits

## Naming Conventions

| Element | Convention | Example |
|---------|------------|---------|
| Files | kebab-case | `order-service.ts` |
| Classes | PascalCase | `OrderService` |
| Functions | camelCase | `createOrder` |
| Constants | UPPER_SNAKE | `MAX_RETRY_COUNT` |
| DB Tables | snake_case | `order_items` |
| API Routes | kebab-case | `/orders/:id/accept` |
| React Components | PascalCase | `OrderCard.tsx` |

## Critical Rules

1. **Never use `any`** - Use `unknown` and type guards instead
2. **Always use Zod** - Validate all external inputs (API, webhooks)
3. **Repository pattern** - Never call Prisma directly from controllers/services
4. **Async/await only** - No callbacks, no `.then()` chains
5. **Custom errors** - Always throw typed errors, never generic `Error`
6. **Use logger** - Never `console.log` in production code
7. **Config service** - Access secrets via `config.get('KEY')`, never `process.env` directly

## File Organization

- Keep files small (< 300 lines)
- One class/component per file
- Co-locate tests: `order-service.spec.ts` next to `order-service.ts`
- Group by feature/module, not by type

## TypeScript Guidelines

```typescript
// DO: Use explicit return types
function getUser(id: string): Promise<User> { ... }

// DON'T: Implicit any
function getUser(id) { ... }

// DO: Use type guards
function isUser(obj: unknown): obj is User {
  return typeof obj === 'object' && obj !== null && 'id' in obj;
}

// DO: Use enums for fixed values
enum OrderStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED'
}

// DON'T: Magic strings
if (order.status === 'PENDING') { ... }
```

## Error Handling

```typescript
// DO: Custom error classes
throw new OrderNotFoundError(orderId);

// DON'T: Generic errors
throw new Error('Order not found');

// DO: Catch and rethrow with context
try {
  await paymentService.process(order);
} catch (error) {
  throw new PaymentFailedError(orderId, error);
}
```

## Testing

- Test file naming: `*.spec.ts`
- Use Vitest for unit/integration tests
- Mock external dependencies
- Follow AAA pattern: Arrange, Act, Assert
- Minimum 70% coverage for new code
