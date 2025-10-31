/**
 * Response helper utilities
 * Re-exports commonly used response functions for convenience
 */

export { validateInput, validateInputSafe } from './validation';
export { successResponse, handleError as errorResponseHandler, addSecurityHeaders } from '../middleware/security';

/**
 * Error response helper
 * @param message Error message
 * @param statusCode HTTP status code (default: 400)
 */
export function errorResponse(message: string, statusCode: number = 400): { statusCode: number; body: string; headers: Record<string, string> } {
  const { handleError } = require('../middleware/security');
  const error = new Error(message);
  (error as any).statusCode = statusCode;
  return handleError(error);
}
