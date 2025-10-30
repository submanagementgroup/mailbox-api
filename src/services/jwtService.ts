import jwt from 'jsonwebtoken';

/**
 * JWT service for token generation and validation
 * Used for local authentication (CLIENT_USER role)
 */

export interface TokenPayload {
  userId: number;
  email: string;
  role: 'SYSTEM_ADMIN' | 'TEAM_MEMBER' | 'CLIENT_USER';
  authProvider: 'local' | 'entra';
}

/**
 * Generate JWT token for authenticated user
 * @param payload Token payload with user information
 * @param expiresIn Token expiration (default: 24h)
 * @returns Signed JWT token
 */
export function generateToken(payload: TokenPayload, expiresIn: string = '24h'): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  return jwt.sign(payload, secret, {
    expiresIn,
    algorithm: 'HS256',
    issuer: 'email-mfa-platform',
  });
}

/**
 * Verify and decode JWT token
 * @param token JWT token to verify
 * @returns Decoded token payload
 * @throws Error if token is invalid or expired
 */
export function verifyToken(token: string): TokenPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }

  try {
    const decoded = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: 'email-mfa-platform',
    });

    return decoded as TokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('Invalid token');
    }
    throw error;
  }
}

/**
 * Generate refresh token (longer expiration)
 * @param payload Token payload
 * @returns Refresh token with 7-day expiration
 */
export function generateRefreshToken(payload: TokenPayload): string {
  return generateToken(payload, '7d');
}

/**
 * Decode token without verification (for debugging)
 * @param token JWT token
 * @returns Decoded payload or null
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
}
