import {
  APIGatewayAuthorizerResult,
  APIGatewayTokenAuthorizerEvent,
  PolicyDocument,
  Statement,
} from 'aws-lambda';
import { verifyToken, decodeToken } from '../services/jwtService';
import { createClient } from 'jwks-rsa';
import jwt from 'jsonwebtoken';

/**
 * JWT Authorizer Lambda
 * Validates tokens for both local and Entra authentication
 *
 * For local auth: Validates JWT signed with JWT_SECRET
 * For Entra auth: Validates JWT from Azure Entra ID using JWKS
 */

interface EntraTokenPayload {
  oid?: string; // Azure Object ID
  email?: string;
  preferred_username?: string;
  roles?: string[];
}

/**
 * Create JWKS client for Entra ID token validation
 */
function getJwksClient() {
  const entraAuthority = process.env.ENTRA_AUTHORITY;
  if (!entraAuthority) {
    throw new Error('ENTRA_AUTHORITY not configured');
  }

  const jwksUri = `${entraAuthority}/discovery/v2.0/keys`;

  return createClient({
    jwksUri,
    cache: true,
    cacheMaxAge: 600000, // 10 minutes
    rateLimit: true,
    jwksRequestsPerMinute: 10,
  });
}

/**
 * Verify Entra ID token
 */
async function verifyEntraToken(token: string): Promise<EntraTokenPayload> {
  const entraClientId = process.env.ENTRA_CLIENT_ID;
  const entraAuthority = process.env.ENTRA_AUTHORITY;

  if (!entraClientId || !entraAuthority) {
    throw new Error('Entra configuration missing');
  }

  const client = getJwksClient();

  // Decode token to get key ID
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
    throw new Error('Invalid token format');
  }

  // Get signing key
  const key = await client.getSigningKey(decoded.header.kid);
  const signingKey = key.getPublicKey();

  // Verify token
  const payload = jwt.verify(token, signingKey, {
    audience: entraClientId,
    issuer: `${entraAuthority}/v2.0`,
    algorithms: ['RS256'],
  }) as EntraTokenPayload;

  return payload;
}

/**
 * Generate IAM policy document
 */
function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, string | number | boolean>
): APIGatewayAuthorizerResult {
  const statement: Statement = {
    Action: 'execute-api:Invoke',
    Effect: effect,
    Resource: resource,
  };

  const policyDocument: PolicyDocument = {
    Version: '2012-10-17',
    Statement: [statement],
  };

  return {
    principalId,
    policyDocument,
    context,
  };
}

export async function handler(
  event: APIGatewayTokenAuthorizerEvent
): Promise<APIGatewayAuthorizerResult> {
  console.log('Authorizer invoked:', JSON.stringify(event, null, 2));

  try {
    // Extract token from Authorization header
    const token = event.authorizationToken?.replace('Bearer ', '').trim();
    if (!token) {
      throw new Error('No token provided');
    }

    // Decode token to determine auth provider
    const decoded = decodeToken(token);

    // Try local JWT validation first
    try {
      const payload = verifyToken(token);

      console.log('Local JWT validated:', payload);

      // Generate policy with user context
      return generatePolicy(
        payload.userId.toString(),
        'Allow',
        event.methodArn,
        {
          userId: payload.userId,
          email: payload.email,
          role: payload.role,
          authProvider: payload.authProvider,
        }
      );
    } catch (localError) {
      console.log('Local JWT validation failed, trying Entra:', localError);

      // If local validation fails, try Entra
      const entraPayload = await verifyEntraToken(token);

      console.log('Entra token validated:', entraPayload);

      // Look up user by Entra OID
      // Note: This requires database access - would need to be implemented
      // For now, we'll return a basic context

      return generatePolicy(
        entraPayload.oid || entraPayload.email || 'unknown',
        'Allow',
        event.methodArn,
        {
          entraOid: entraPayload.oid || '',
          email: entraPayload.email || entraPayload.preferred_username || '',
          authProvider: 'entra',
          // role would need to be fetched from database
        }
      );
    }
  } catch (error: any) {
    console.error('Authorization failed:', error);

    // Return deny policy
    return generatePolicy(
      'unauthorized',
      'Deny',
      event.methodArn
    );
  }
}
