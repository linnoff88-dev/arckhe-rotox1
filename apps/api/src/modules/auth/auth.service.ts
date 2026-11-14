import { hash, compare } from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma, UserRole, UserStatus } from '@rotax1/database';
import { config } from '../../common/config/index.js';
import {
  InvalidCredentialsError,
  EmailAlreadyExistsError,
  InvalidTokenError,
  UserNotActiveError,
} from './auth.errors.js';
import type { RegisterInput, LoginInput } from './auth.schema.js';

interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class AuthService {
  private readonly BCRYPT_ROUNDS = 12;
  private readonly ACCESS_TOKEN_EXPIRY = '15m';
  private readonly REFRESH_TOKEN_EXPIRY = '7d';

  async register(input: RegisterInput): Promise<AuthTokens> {
    // Check if email exists
    const existingUser = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (existingUser) {
      throw new EmailAlreadyExistsError();
    }

    // Hash password
    const passwordHash = await hash(input.password, this.BCRYPT_ROUNDS);

    // Determine initial status
    const role = input.role as UserRole;
    const status = role === UserRole.DRIVER ? UserStatus.PENDING : UserStatus.ACTIVE;

    // Create user with profile
    const user = await prisma.user.create({
      data: {
        email: input.email,
        phone: input.phone,
        passwordHash,
        role,
        status,
        ...(role === UserRole.CLIENT && {
          client: {
            create: { name: input.name },
          },
        }),
        ...(role === UserRole.DRIVER && {
          driver: {
            create: {
              name: input.name,
              document: '',
              vehicleType: 'MOTO',
            },
          },
        }),
      },
    });

    return this.generateTokens(user);
  }

  async login(input: LoginInput): Promise<AuthTokens> {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
    });

    if (!user) {
      throw new InvalidCredentialsError();
    }

    const passwordValid = await compare(input.password, user.passwordHash);
    if (!passwordValid) {
      throw new InvalidCredentialsError();
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UserNotActiveError();
    }

    return this.generateTokens(user);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = jwt.verify(refreshToken, config.jwt.refreshSecret) as TokenPayload;

      const user = await prisma.user.findUnique({
        where: { id: payload.userId },
      });

      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new InvalidTokenError();
      }

      return this.generateTokens(user);
    } catch {
      throw new InvalidTokenError();
    }
  }

  private generateTokens(user: { id: string; email: string; role: UserRole }): AuthTokens {
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, config.jwt.secret, {
      expiresIn: this.ACCESS_TOKEN_EXPIRY,
    });

    const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: this.REFRESH_TOKEN_EXPIRY,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: 900, // 15 minutes in seconds
    };
  }
}

export const authService = new AuthService();
