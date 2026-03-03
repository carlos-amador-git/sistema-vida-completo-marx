// src/modules/auth/webauthn.service.ts
import { logger } from '../../common/services/logger.service';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
} from '@simplewebauthn/types';
import config from '../../config';

import { prisma } from '../../common/prisma';

// Configuración del RP (Relying Party)
const rpName = 'Sistema VIDA';
const rpID = config.env === 'production' ? 'mdconsultoria-ti.org' : 'localhost';
const CHALLENGE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const origin = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://vida.mdconsultoria-ti.org',
  'https://app.vida.mdconsultoria-ti.org'
];

export class WebAuthnService {
  /**
   * Genera opciones para registrar una nueva credencial biométrica
   */
  async generateRegistrationOptions(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { webauthnCredentials: true },
    });

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    // Obtener credenciales existentes para excluirlas
    const excludeCredentials = user.webauthnCredentials.map((cred) => ({
      id: cred.credentialId,
      type: 'public-key' as const,
      transports: cred.transports as AuthenticatorTransportFuture[],
    }));

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(user.id),
      userName: user.email,
      userDisplayName: user.name,
      attestationType: 'none', // No necesitamos verificar el fabricante del dispositivo
      excludeCredentials,
      authenticatorSelection: {
        // Preferir autenticadores de plataforma (Face ID, Windows Hello, etc.)
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
      timeout: 60000,
    });

    // Guardar el challenge con TTL para verificación posterior
    await prisma.user.update({
      where: { id: userId },
      data: {
        webauthnChallenge: options.challenge,
        webauthnChallengeExpires: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });

    return options;
  }

  /**
   * Verifica y guarda una nueva credencial biométrica
   */
  async verifyRegistration(
    userId: string,
    response: RegistrationResponseJSON,
    deviceName?: string
  ): Promise<{ success: boolean; credentialId: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.webauthnChallenge) {
      throw new Error('Usuario no encontrado o challenge inválido');
    }

    // LOW-03: Verify challenge has not expired
    if (user.webauthnChallengeExpires && user.webauthnChallengeExpires < new Date()) {
      await prisma.user.update({
        where: { id: userId },
        data: { webauthnChallenge: null, webauthnChallengeExpires: null },
      });
      throw new Error('Challenge expirado. Intente de nuevo.');
    }

    let verification: VerifiedRegistrationResponse;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge: user.webauthnChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch (error) {
      logger.error('Error verificando registro WebAuthn:', error);
      throw new Error('Verificación de credencial fallida');
    }

    const { verified, registrationInfo } = verification;

    if (!verified || !registrationInfo) {
      throw new Error('Verificación de credencial fallida');
    }

    // Guardar la credencial
    const { credential } = registrationInfo;

    // Convertir Uint8Array a base64 string para credentialId
    const credentialIdBase64 = Buffer.from(credential.id).toString('base64url');

    await prisma.webAuthnCredential.create({
      data: {
        userId,
        credentialId: credentialIdBase64,
        credentialPublicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        deviceType: registrationInfo.credentialDeviceType,
        deviceName: deviceName || this.detectDeviceName(response),
        transports: response.response.transports || [],
      },
    });

    // Limpiar el challenge
    await prisma.user.update({
      where: { id: userId },
      data: { webauthnChallenge: null, webauthnChallengeExpires: null },
    });

    return { success: true, credentialId: credentialIdBase64 };
  }

  /**
   * Genera opciones para autenticación biométrica
   */
  async generateAuthenticationOptions(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      include: { webauthnCredentials: true },
    });

    if (!user) {
      throw new Error('Usuario no encontrado');
    }

    if (user.webauthnCredentials.length === 0) {
      throw new Error('No hay credenciales biométricas registradas');
    }

    const allowCredentials = user.webauthnCredentials.map((cred) => ({
      id: cred.credentialId,
      type: 'public-key' as const,
      transports: cred.transports as AuthenticatorTransportFuture[],
    }));

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'required',
      timeout: 60000,
    });

    // Guardar el challenge con TTL
    await prisma.user.update({
      where: { id: user.id },
      data: {
        webauthnChallenge: options.challenge,
        webauthnChallengeExpires: new Date(Date.now() + CHALLENGE_TTL_MS),
      },
    });

    return { options, userId: user.id };
  }

  /**
   * Verifica la autenticación biométrica
   */
  async verifyAuthentication(
    userId: string,
    response: AuthenticationResponseJSON
  ): Promise<{ verified: boolean; user: { id: string; email: string; name: string } }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { webauthnCredentials: true },
    });

    if (!user || !user.webauthnChallenge) {
      throw new Error('Usuario no encontrado o challenge inválido');
    }

    // LOW-03: Verify challenge has not expired
    if (user.webauthnChallengeExpires && user.webauthnChallengeExpires < new Date()) {
      await prisma.user.update({
        where: { id: userId },
        data: { webauthnChallenge: null, webauthnChallengeExpires: null },
      });
      throw new Error('Challenge expirado. Intente de nuevo.');
    }

    // Buscar la credencial usada
    const credentialIdBase64 = response.id;
    const credential = user.webauthnCredentials.find(
      (c) => c.credentialId === credentialIdBase64
    );

    if (!credential) {
      throw new Error('Credencial no encontrada');
    }

    let verification: VerifiedAuthenticationResponse;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge: user.webauthnChallenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: credential.credentialId,
          publicKey: new Uint8Array(credential.credentialPublicKey),
          counter: Number(credential.counter),
          transports: credential.transports as AuthenticatorTransportFuture[],
        },
      });
    } catch (error) {
      logger.error('Error verificando autenticación WebAuthn:', error);
      throw new Error('Autenticación biométrica fallida');
    }

    const { verified, authenticationInfo } = verification;

    if (!verified) {
      throw new Error('Autenticación biométrica fallida');
    }

    // Actualizar el contador y última utilización
    await prisma.webAuthnCredential.update({
      where: { id: credential.id },
      data: {
        counter: BigInt(authenticationInfo.newCounter),
        lastUsedAt: new Date(),
      },
    });

    // Limpiar el challenge
    await prisma.user.update({
      where: { id: userId },
      data: { webauthnChallenge: null, webauthnChallengeExpires: null },
    });

    return {
      verified: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  /**
   * Lista las credenciales biométricas de un usuario
   */
  async listCredentials(userId: string) {
    const credentials = await prisma.webAuthnCredential.findMany({
      where: { userId },
      select: {
        id: true,
        deviceName: true,
        deviceType: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return credentials;
  }

  /**
   * Elimina una credencial biométrica
   */
  async deleteCredential(userId: string, credentialId: string) {
    const credential = await prisma.webAuthnCredential.findFirst({
      where: { id: credentialId, userId },
    });

    if (!credential) {
      throw new Error('Credencial no encontrada');
    }

    await prisma.webAuthnCredential.delete({
      where: { id: credentialId },
    });

    return { success: true };
  }

  /**
   * Detecta el nombre del dispositivo basado en el User-Agent o tipo de autenticador
   */
  private detectDeviceName(response: RegistrationResponseJSON): string {
    const transports = response.response.transports || [];

    if (transports.includes('internal')) {
      // Es un autenticador de plataforma (Face ID, Windows Hello, etc.)
      return 'Dispositivo biométrico';
    } else if (transports.includes('usb')) {
      return 'Llave de seguridad USB';
    } else if (transports.includes('nfc')) {
      return 'Llave de seguridad NFC';
    } else if (transports.includes('ble')) {
      return 'Llave de seguridad Bluetooth';
    }

    return 'Dispositivo desconocido';
  }
}

export const webAuthnService = new WebAuthnService();
