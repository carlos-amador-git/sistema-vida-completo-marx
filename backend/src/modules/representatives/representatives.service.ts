// src/modules/representatives/representatives.service.ts
import { Representative } from '@prisma/client';
import { encryptionV2 } from '../../common/services/encryption-v2.service';

import { prisma } from '../../common/prisma';

interface RepresentativeInput {
  name: string;
  phone: string;
  email?: string;
  relation: string;
  priority?: number;
  isDonorSpokesperson?: boolean;
  notifyOnEmergency?: boolean;
  notifyOnAccess?: boolean;
}

interface RepresentativeResponse {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  relation: string;
  priority: number;
  isDonorSpokesperson: boolean;
  notifyOnEmergency: boolean;
  notifyOnAccess: boolean;
  createdAt: Date;
  updatedAt: Date;
}

class RepresentativesService {
  /**
   * Lista todos los representantes del usuario
   */
  async listRepresentatives(userId: string): Promise<RepresentativeResponse[]> {
    const representatives = await prisma.representative.findMany({
      where: { userId },
      orderBy: { priority: 'asc' },
    });
    
    return representatives.map(this.formatRepresentative);
  }
  
  /**
   * Obtiene un representante por ID
   */
  async getRepresentative(userId: string, repId: string): Promise<RepresentativeResponse | null> {
    const representative = await prisma.representative.findFirst({
      where: { id: repId, userId },
    });
    
    return representative ? this.formatRepresentative(representative) : null;
  }
  
  /**
   * Crea un nuevo representante
   */
  async createRepresentative(userId: string, input: RepresentativeInput): Promise<RepresentativeResponse> {
    // Obtener la prioridad más alta actual
    const highestPriority = await prisma.representative.findFirst({
      where: { userId },
      orderBy: { priority: 'desc' },
      select: { priority: true },
    });
    
    const nextPriority = input.priority ?? ((highestPriority?.priority ?? 0) + 1);
    
    const representative = await prisma.representative.create({
      data: {
        userId,
        name: input.name,
        phone: input.phone,
        email: input.email,
        relation: input.relation,
        priority: nextPriority,
        isDonorSpokesperson: input.isDonorSpokesperson ?? false,
        notifyOnEmergency: input.notifyOnEmergency ?? true,
        notifyOnAccess: input.notifyOnAccess ?? true,
        // Campos cifrados V2
        nameEnc: encryptionV2.encryptField(input.name),
        phoneEnc: encryptionV2.encryptField(input.phone),
        emailEnc: input.email ? encryptionV2.encryptField(input.email) : null,
      },
    });
    
    return this.formatRepresentative(representative);
  }
  
  /**
   * Actualiza un representante
   */
  async updateRepresentative(
    userId: string, 
    repId: string, 
    input: Partial<RepresentativeInput>
  ): Promise<RepresentativeResponse | null> {
    const existing = await prisma.representative.findFirst({
      where: { id: repId, userId },
    });
    
    if (!existing) {
      return null;
    }
    
    const finalName = input.name ?? existing.name;
    const finalPhone = input.phone ?? existing.phone;
    const finalEmail = input.email !== undefined ? input.email : existing.email;

    const representative = await prisma.representative.update({
      where: { id: repId },
      data: {
        name: finalName,
        phone: finalPhone,
        email: finalEmail,
        relation: input.relation ?? existing.relation,
        priority: input.priority ?? existing.priority,
        isDonorSpokesperson: input.isDonorSpokesperson ?? existing.isDonorSpokesperson,
        notifyOnEmergency: input.notifyOnEmergency ?? existing.notifyOnEmergency,
        notifyOnAccess: input.notifyOnAccess ?? existing.notifyOnAccess,
        // Campos cifrados V2
        nameEnc: encryptionV2.encryptField(finalName),
        phoneEnc: encryptionV2.encryptField(finalPhone),
        emailEnc: finalEmail ? encryptionV2.encryptField(finalEmail) : null,
      },
    });
    
    return this.formatRepresentative(representative);
  }
  
  /**
   * Elimina un representante
   */
  async deleteRepresentative(userId: string, repId: string): Promise<boolean> {
    const existing = await prisma.representative.findFirst({
      where: { id: repId, userId },
    });
    
    if (!existing) {
      return false;
    }
    
    await prisma.representative.delete({
      where: { id: repId },
    });
    
    return true;
  }
  
  /**
   * Reordena las prioridades de los representantes
   */
  async reorderPriorities(userId: string, orderedIds: string[]): Promise<RepresentativeResponse[]> {
    // Verificar que todos los IDs pertenecen al usuario
    const existing = await prisma.representative.findMany({
      where: { userId },
      select: { id: true },
    });
    
    const existingIds = new Set(existing.map(r => r.id));
    const validIds = orderedIds.filter(id => existingIds.has(id));
    
    // Actualizar prioridades
    const updates = validIds.map((id, index) => 
      prisma.representative.update({
        where: { id },
        data: { priority: index + 1 },
      })
    );
    
    await prisma.$transaction(updates);
    
    return this.listRepresentatives(userId);
  }
  
  /**
   * Establece el portavoz de donación
   */
  async setDonorSpokesperson(userId: string, repId: string): Promise<RepresentativeResponse | null> {
    const existing = await prisma.representative.findFirst({
      where: { id: repId, userId },
    });
    
    if (!existing) {
      return null;
    }
    
    // Quitar el flag de todos los demás
    await prisma.representative.updateMany({
      where: { userId, id: { not: repId } },
      data: { isDonorSpokesperson: false },
    });
    
    // Establecer el nuevo portavoz
    const representative = await prisma.representative.update({
      where: { id: repId },
      data: { isDonorSpokesperson: true },
    });
    
    return this.formatRepresentative(representative);
  }
  
  /**
   * Formatea un representante para la respuesta
   */
  private formatRepresentative(rep: Representative): RepresentativeResponse {
    return {
      id: rep.id,
      name: rep.name,
      phone: rep.phone,
      email: rep.email,
      relation: rep.relation,
      priority: rep.priority,
      isDonorSpokesperson: rep.isDonorSpokesperson,
      notifyOnEmergency: rep.notifyOnEmergency,
      notifyOnAccess: rep.notifyOnAccess,
      createdAt: rep.createdAt,
      updatedAt: rep.updatedAt,
    };
  }
}

export const representativesService = new RepresentativesService();
export default representativesService;
