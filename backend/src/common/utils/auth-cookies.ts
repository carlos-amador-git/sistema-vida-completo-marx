// src/common/utils/auth-cookies.ts
/**
 * httpOnly cookie helpers for refresh token management.
 *
 * Refresh tokens are stored in httpOnly, Secure, SameSite=Strict cookies.
 * Access tokens remain in response body (stored in-memory on frontend).
 */
import { Response, Request } from 'express';
import config from '../../config';

const REFRESH_TOKEN_COOKIE = 'vida_refresh_token';
const ADMIN_REFRESH_TOKEN_COOKIE = 'vida_admin_refresh_token';
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const isProduction = config.env === 'production';

// ==================== USER AUTH COOKIES ====================

/**
 * Sets the refresh token as an httpOnly cookie.
 */
export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
    path: '/api/v1/auth',
  });
}

/**
 * Clears the refresh token cookie.
 */
export function clearRefreshTokenCookie(res: Response): void {
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/api/v1/auth',
  });
}

/**
 * Extracts refresh token from cookie or request body (backward compatibility).
 */
export function getRefreshToken(req: Request): string | undefined {
  // Prefer cookie, fall back to body
  return req.cookies?.[REFRESH_TOKEN_COOKIE] || req.body?.refreshToken;
}

// ==================== ADMIN AUTH COOKIES ====================

/**
 * Sets the admin refresh token as an httpOnly cookie.
 */
export function setAdminRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(ADMIN_REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
    path: '/api/v1/admin/auth',
  });
}

/**
 * Clears the admin refresh token cookie.
 */
export function clearAdminRefreshTokenCookie(res: Response): void {
  res.clearCookie(ADMIN_REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    path: '/api/v1/admin/auth',
  });
}

/**
 * Extracts admin refresh token from cookie or request body (backward compatibility).
 */
export function getAdminRefreshToken(req: Request): string | undefined {
  return req.cookies?.[ADMIN_REFRESH_TOKEN_COOKIE] || req.body?.refreshToken;
}
