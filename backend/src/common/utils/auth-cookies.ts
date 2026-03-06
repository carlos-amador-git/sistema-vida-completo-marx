// src/common/utils/auth-cookies.ts
/**
 * httpOnly cookie helpers for token management.
 *
 * Both access and refresh tokens are stored in httpOnly, Secure, SameSite cookies.
 */
import { Response, Request } from 'express';
import config from '../../config';

const ACCESS_TOKEN_COOKIE = 'accessToken';
const REFRESH_TOKEN_COOKIE = 'vida_refresh_token';
const ADMIN_ACCESS_TOKEN_COOKIE = 'vida_admin_access_token';
const ADMIN_REFRESH_TOKEN_COOKIE = 'vida_admin_refresh_token';
const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const isProduction = config.env === 'production';
const cookieDomainFromConfig = config.cookieDomain || '';
const sameSiteValue: 'lax' | 'strict' | 'none' = isProduction ? 'lax' : 'lax';

// In production, don't use cookie domain by default (browser handles it automatically)
// Only use cookie domain if explicitly set AND it's a different domain entirely
const frontendDomain = config.frontendUrl.replace(/^https?:\/\//, '').replace(/^www\./, '');
const cookieDomainConfigured = cookieDomainFromConfig.replace(/^\./, '').replace(/^www\./, '');

// Check if cookie domain is a parent domain of frontend (e.g., .mdconsultoria-ti.org is parent of vida.mdconsultoria-ti.org)
const isParentDomain = cookieDomainConfigured && frontendDomain.endsWith('.' + cookieDomainConfigured);

// Only use domain if it's a completely different domain (not a parent/subdomain relationship)
const cookieDomain = cookieDomainConfigured && !isParentDomain && cookieDomainConfigured !== frontendDomain
  ? cookieDomainFromConfig 
  : undefined;

// Log cookie config in production for debugging
if (isProduction) {
  console.log('[COOKIE_DEBUG] Production cookie config:', { 
    cookieDomain: cookieDomain || '(none)',
    cookieDomainFromConfig,
    frontendDomain,
    cookieDomainConfigured,
    isProduction, 
    sameSite: sameSiteValue 
  });
}

// Helper to build cookie options
const getCookieOptions = (path: string = '/') => ({
  httpOnly: true,
  secure: isProduction,
  sameSite: sameSiteValue,
  domain: cookieDomain,
  path,
});

// ==================== COMBINED AUTH COOKIES ====================

/**
 * Sets both access and refresh tokens as httpOnly cookies.
 */
export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...getCookieOptions('/'),
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
  });

  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...getCookieOptions('/api/v1/auth'),
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  });
}

/**
 * Clears both access and refresh token cookies.
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, {
    ...getCookieOptions('/'),
  });
  res.clearCookie(REFRESH_TOKEN_COOKIE, {
    ...getCookieOptions('/api/v1/auth'),
  });
}

// ==================== USER AUTH COOKIES ====================

/**
 * Sets the refresh token as an httpOnly cookie.
 */
export function setRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'lax' : 'lax',
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
    sameSite: isProduction ? 'lax' : 'lax',
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
 * Sets the admin access token as an httpOnly cookie.
 */
export function setAdminAccessTokenCookie(res: Response, accessToken: string): void {
  res.cookie(ADMIN_ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: ACCESS_TOKEN_MAX_AGE_MS,
    path: '/api/v1/admin',
  });
}

/**
 * Clears the admin access token cookie.
 */
export function clearAdminAccessTokenCookie(res: Response): void {
  res.clearCookie(ADMIN_ACCESS_TOKEN_COOKIE, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/api/v1/admin',
  });
}

/**
 * Sets the admin refresh token as an httpOnly cookie.
 */
export function setAdminRefreshTokenCookie(res: Response, refreshToken: string): void {
  res.cookie(ADMIN_REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
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
    sameSite: 'strict',
    path: '/api/v1/admin/auth',
  });
}

/**
 * Extracts admin refresh token from cookie or request body (backward compatibility).
 */
export function getAdminRefreshToken(req: Request): string | undefined {
  return req.cookies?.[ADMIN_REFRESH_TOKEN_COOKIE] || req.body?.refreshToken;
}

/**
 * Extracts admin access token from cookie.
 */
export function getAdminAccessToken(req: Request): string | undefined {
  return req.cookies?.[ADMIN_ACCESS_TOKEN_COOKIE];
}
