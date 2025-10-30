/**
 * Security middleware for rate limiting and headers
 */

/**
 * Add security headers to response
 */
export function addSecurityHeaders(response: any): any {
  // Determine allowed origin based on environment
  const allowedOrigin = process.env.ENVIRONMENT === 'local'
    ? 'http://localhost:3000'
    : process.env.FRONTEND_URL || 'https://mail.dev.submanagementgroup.com';

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    ...(response.headers || {}),
  };

  return {
    ...response,
    headers,
  };
}

/**
 * Handle errors and return standardized response
 */
export function handleError(error: any): { statusCode: number; body: string } {
  console.error('Request error:', error);

  const statusCode = error.statusCode || 500;
  const message = error.message || 'Internal server error';

  return addSecurityHeaders({
    statusCode,
    body: JSON.stringify({
      error: error.name || 'Error',
      message,
    }),
  });
}

/**
 * Success response helper
 */
export function successResponse<T>(data: T, statusCode: number = 200): { statusCode: number; body: string } {
  return addSecurityHeaders({
    statusCode,
    body: JSON.stringify({
      success: true,
      data,
    }),
  });
}
