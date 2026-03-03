// src/modules/payments/services/invoice.service.ts
import { logger } from '../../../common/services/logger.service';
import { InvoiceStatus } from '@prisma/client';
import config from '../../../config';
import type {
  InvoiceDTO,
  FiscalDataDTO,
  SaveFiscalDataInput,
  GenerateInvoiceInput,
} from '../types/payments.types';

import { prisma } from '../../../common/prisma';

// Cliente HTTP para Facturama
async function facturamaRequest(
  endpoint: string,
  method: 'GET' | 'POST' | 'DELETE' = 'GET',
  body?: object
): Promise<{ data?: unknown; error?: string }> {
  const auth = Buffer.from(
    `${config.facturama.username}:${config.facturama.password}`
  ).toString('base64');

  try {
    const response = await fetch(`${config.facturama.apiUrl}${endpoint}`, {
      method,
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return { error: (errorData as { Message?: string }).Message || `Error ${response.status}` };
    }

    const data = await response.json();
    return { data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Error de conexión' };
  }
}

export const invoiceService = {
  /**
   * Obtener datos fiscales del usuario
   */
  async getUserFiscalData(userId: string): Promise<FiscalDataDTO | null> {
    const fiscalData = await prisma.fiscalData.findUnique({
      where: { userId },
    });

    if (!fiscalData) return null;

    return {
      id: fiscalData.id,
      rfc: fiscalData.rfc,
      razonSocial: fiscalData.razonSocial,
      regimenFiscal: fiscalData.regimenFiscal,
      usoCFDI: fiscalData.usoCFDI,
      codigoPostal: fiscalData.codigoPostal,
      calle: fiscalData.calle,
      numExterior: fiscalData.numExterior,
      numInterior: fiscalData.numInterior,
      colonia: fiscalData.colonia,
      municipio: fiscalData.municipio,
      estado: fiscalData.estado,
      emailFacturacion: fiscalData.emailFacturacion,
      createdAt: fiscalData.createdAt,
    };
  },

  /**
   * Guardar/actualizar datos fiscales
   */
  async saveFiscalData(userId: string, input: SaveFiscalDataInput): Promise<FiscalDataDTO> {
    // Validar RFC
    const rfcRegex = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
    if (!rfcRegex.test(input.rfc.toUpperCase())) {
      throw new Error('RFC inválido');
    }

    // Crear o actualizar cliente en Facturama
    let facturamaClientId: string | null = null;

    const existingFiscalData = await prisma.fiscalData.findUnique({
      where: { userId },
    });

    const facturamaClient = {
      Id: existingFiscalData?.facturamaClientId || undefined,
      Rfc: input.rfc.toUpperCase(),
      Name: input.razonSocial,
      FiscalRegime: input.regimenFiscal,
      CfdiUse: input.usoCFDI || 'G03',
      TaxZipCode: input.codigoPostal,
      Email: input.emailFacturacion,
      Address: input.calle
        ? {
            Street: input.calle,
            ExteriorNumber: input.numExterior,
            InteriorNumber: input.numInterior,
            Neighborhood: input.colonia,
            Municipality: input.municipio,
            State: input.estado,
            ZipCode: input.codigoPostal,
            Country: 'MEX',
          }
        : undefined,
    };

    if (config.facturama.username && config.facturama.password) {
      const endpoint = existingFiscalData?.facturamaClientId
        ? `/Client/${existingFiscalData.facturamaClientId}`
        : '/Client';
      const method = existingFiscalData?.facturamaClientId ? 'POST' : 'POST';

      const result = await facturamaRequest(endpoint, method, facturamaClient);

      if (!result.error && result.data) {
        facturamaClientId = (result.data as { Id: string }).Id;
      }
    }

    // Guardar en BD
    const fiscalData = await prisma.fiscalData.upsert({
      where: { userId },
      update: {
        rfc: input.rfc.toUpperCase(),
        razonSocial: input.razonSocial,
        regimenFiscal: input.regimenFiscal,
        usoCFDI: input.usoCFDI || 'G03',
        codigoPostal: input.codigoPostal,
        calle: input.calle,
        numExterior: input.numExterior,
        numInterior: input.numInterior,
        colonia: input.colonia,
        municipio: input.municipio,
        estado: input.estado,
        emailFacturacion: input.emailFacturacion,
        facturamaClientId,
      },
      create: {
        userId,
        rfc: input.rfc.toUpperCase(),
        razonSocial: input.razonSocial,
        regimenFiscal: input.regimenFiscal,
        usoCFDI: input.usoCFDI || 'G03',
        codigoPostal: input.codigoPostal,
        calle: input.calle,
        numExterior: input.numExterior,
        numInterior: input.numInterior,
        colonia: input.colonia,
        municipio: input.municipio,
        estado: input.estado,
        emailFacturacion: input.emailFacturacion,
        facturamaClientId,
      },
    });

    return {
      id: fiscalData.id,
      rfc: fiscalData.rfc,
      razonSocial: fiscalData.razonSocial,
      regimenFiscal: fiscalData.regimenFiscal,
      usoCFDI: fiscalData.usoCFDI,
      codigoPostal: fiscalData.codigoPostal,
      calle: fiscalData.calle,
      numExterior: fiscalData.numExterior,
      numInterior: fiscalData.numInterior,
      colonia: fiscalData.colonia,
      municipio: fiscalData.municipio,
      estado: fiscalData.estado,
      emailFacturacion: fiscalData.emailFacturacion,
      createdAt: fiscalData.createdAt,
    };
  },

  /**
   * Obtener facturas del usuario
   */
  async getUserInvoices(
    userId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ invoices: InvoiceDTO[]; total: number }> {
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 20,
        skip: options?.offset || 0,
      }),
      prisma.invoice.count({ where: { userId } }),
    ]);

    return {
      invoices: invoices.map(this.formatInvoice),
      total,
    };
  },

  /**
   * Generar factura CFDI para un pago
   */
  async generateInvoice(userId: string, input: GenerateInvoiceInput): Promise<InvoiceDTO> {
    // Verificar que el pago existe y pertenece al usuario
    const payment = await prisma.payment.findFirst({
      where: { id: input.paymentId, userId, status: 'SUCCEEDED' },
    });

    if (!payment) {
      throw new Error('Pago no encontrado o no está completado');
    }

    // Verificar que no existe ya una factura para este pago
    const existingInvoice = await prisma.invoice.findUnique({
      where: { paymentId: input.paymentId },
    });

    if (existingInvoice && existingInvoice.status === InvoiceStatus.ISSUED) {
      throw new Error('Ya existe una factura para este pago');
    }

    // Obtener datos fiscales del usuario
    const fiscalData = await prisma.fiscalData.findUnique({
      where: { userId },
    });

    if (!fiscalData) {
      throw new Error('Debes registrar tus datos fiscales antes de facturar');
    }

    const amount = Number(payment.amount);
    const subtotal = amount / 1.16; // IVA incluido
    const iva = amount - subtotal;

    // Crear registro de factura pendiente
    const invoice = await prisma.invoice.upsert({
      where: { paymentId: input.paymentId },
      update: {
        fiscalDataId: fiscalData.id,
        subtotal,
        iva,
        total: amount,
        status: InvoiceStatus.PENDING,
      },
      create: {
        userId,
        paymentId: input.paymentId,
        fiscalDataId: fiscalData.id,
        subtotal,
        iva,
        total: amount,
        status: InvoiceStatus.PENDING,
      },
    });

    // Intentar timbrar en Facturama
    if (config.facturama.username && config.facturama.password && config.facturama.emisorRfc) {
      try {
        const cfdiData = {
          Serie: 'SV',
          Currency: 'MXN',
          ExpeditionPlace: config.facturama.expeditionZip,
          PaymentConditions: 'CONTADO',
          CfdiType: 'I', // Ingreso
          PaymentForm: payment.paymentMethod === 'CARD' ? '04' : '01', // 04=Tarjeta, 01=Efectivo
          PaymentMethod: 'PUE', // Pago en una sola exhibición
          Receiver: {
            Rfc: fiscalData.rfc,
            Name: fiscalData.razonSocial,
            CfdiUse: fiscalData.usoCFDI,
            FiscalRegime: fiscalData.regimenFiscal,
            TaxZipCode: fiscalData.codigoPostal,
          },
          Items: [
            {
              ProductCode: '81112101', // Servicios de software
              IdentificationNumber: payment.id,
              Description: payment.description || 'Suscripción Sistema VIDA',
              Unit: 'Servicio',
              UnitCode: 'E48',
              UnitPrice: subtotal.toFixed(2),
              Quantity: 1,
              Subtotal: subtotal.toFixed(2),
              TaxObject: '02', // Sí objeto de impuesto
              Taxes: [
                {
                  Total: iva.toFixed(2),
                  Name: 'IVA',
                  Base: subtotal.toFixed(2),
                  Rate: 0.16,
                  IsRetention: false,
                },
              ],
              Total: amount.toFixed(2),
            },
          ],
        };

        const result = await facturamaRequest('/3/cfdis', 'POST', cfdiData);

        if (result.error) {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: {
              status: InvoiceStatus.ERROR,
              errorMessage: result.error,
            },
          });
          throw new Error(`Error al timbrar factura: ${result.error}`);
        }

        const cfdiResult = result.data as {
          Id: string;
          Complement: { TaxStamp: { Uuid: string } };
          Serie: string;
          Folio: string;
        };

        // Obtener URLs de descarga
        const xmlUrl = `${config.facturama.apiUrl}/cfdi/xml/issuedLite/${cfdiResult.Id}`;
        const pdfUrl = `${config.facturama.apiUrl}/cfdi/pdf/issuedLite/${cfdiResult.Id}`;

        // Actualizar factura con datos del CFDI
        const updatedInvoice = await prisma.invoice.update({
          where: { id: invoice.id },
          data: {
            facturamaInvoiceId: cfdiResult.Id,
            uuid: cfdiResult.Complement?.TaxStamp?.Uuid,
            serie: cfdiResult.Serie,
            folio: cfdiResult.Folio,
            xmlUrl,
            pdfUrl,
            status: InvoiceStatus.ISSUED,
            issuedAt: new Date(),
          },
        });

        // Enviar por email
        if (fiscalData.emailFacturacion) {
          await facturamaRequest(`/cfdi/mail/issuedLite/${cfdiResult.Id}`, 'POST', {
            Email: fiscalData.emailFacturacion,
          });

          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { status: InvoiceStatus.SENT },
          });
        }

        return this.formatInvoice(updatedInvoice);
      } catch (error) {
        logger.error('Error timbrando factura:', error);
        throw error;
      }
    } else {
      // Facturama no configurado, dejar en pendiente
      return this.formatInvoice(invoice);
    }
  },

  /**
   * Cancelar factura
   */
  async cancelInvoice(invoiceId: string, userId?: string): Promise<InvoiceDTO> {
    const where: { id: string; userId?: string } = { id: invoiceId };
    if (userId) where.userId = userId;

    const invoice = await prisma.invoice.findFirst({ where });

    if (!invoice) {
      throw new Error('Factura no encontrada');
    }

    if (invoice.status !== InvoiceStatus.ISSUED && invoice.status !== InvoiceStatus.SENT) {
      throw new Error('Solo se pueden cancelar facturas emitidas');
    }

    // Cancelar en Facturama
    if (invoice.facturamaInvoiceId) {
      const result = await facturamaRequest(
        `/cfdi/issuedLite/${invoice.facturamaInvoiceId}?motive=02`, // 02 = Comprobante emitido con errores con relación
        'DELETE'
      );

      if (result.error) {
        throw new Error(`Error al cancelar factura: ${result.error}`);
      }
    }

    // Actualizar en BD
    const updated = await prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        status: InvoiceStatus.CANCELLED,
        cancelledAt: new Date(),
      },
    });

    return this.formatInvoice(updated);
  },

  /**
   * Reenviar factura por email
   */
  async resendInvoice(invoiceId: string, userId: string): Promise<void> {
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, userId },
      include: { fiscalData: true },
    });

    if (!invoice || !invoice.facturamaInvoiceId) {
      throw new Error('Factura no encontrada o no timbrada');
    }

    const email = invoice.fiscalData?.emailFacturacion;
    if (!email) {
      throw new Error('No hay email de facturación registrado');
    }

    const result = await facturamaRequest(
      `/cfdi/mail/issuedLite/${invoice.facturamaInvoiceId}`,
      'POST',
      { Email: email }
    );

    if (result.error) {
      throw new Error(`Error al enviar factura: ${result.error}`);
    }
  },

  // ==================== ADMIN ====================

  /**
   * Listar todas las facturas (admin)
   */
  async getAllInvoices(options?: {
    limit?: number;
    offset?: number;
    status?: InvoiceStatus;
    from?: Date;
    to?: Date;
  }): Promise<{ invoices: InvoiceDTO[]; total: number }> {
    const where: Record<string, unknown> = {};

    if (options?.status) where.status = options.status;
    if (options?.from || options?.to) {
      where.createdAt = {};
      if (options.from) (where.createdAt as Record<string, Date>).gte = options.from;
      if (options.to) (where.createdAt as Record<string, Date>).lte = options.to;
    }

    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: options?.limit || 50,
        skip: options?.offset || 0,
        include: {
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      prisma.invoice.count({ where }),
    ]);

    return {
      invoices: invoices.map(this.formatInvoice),
      total,
    };
  },

  // ==================== HELPERS ====================

  formatInvoice(invoice: {
    id: string;
    paymentId: string;
    uuid: string | null;
    serie: string | null;
    folio: string | null;
    subtotal: { toString(): string };
    iva: { toString(): string };
    total: { toString(): string };
    xmlUrl: string | null;
    pdfUrl: string | null;
    status: InvoiceStatus;
    issuedAt: Date | null;
    createdAt: Date;
  }): InvoiceDTO {
    return {
      id: invoice.id,
      paymentId: invoice.paymentId,
      uuid: invoice.uuid,
      serie: invoice.serie,
      folio: invoice.folio,
      subtotal: Number(invoice.subtotal),
      iva: Number(invoice.iva),
      total: Number(invoice.total),
      xmlUrl: invoice.xmlUrl,
      pdfUrl: invoice.pdfUrl,
      status: invoice.status,
      issuedAt: invoice.issuedAt,
      createdAt: invoice.createdAt,
    };
  },
};
