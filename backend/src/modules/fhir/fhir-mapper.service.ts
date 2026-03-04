// src/modules/fhir/fhir-mapper.service.ts
/**
 * FHIR Mapper Service — Converts VIDA domain models to HL7 FHIR R4 resources
 */
import { v4 as uuidv4 } from 'uuid';
import type {
  FHIRPatient,
  FHIRConsent,
  FHIRAuditEvent,
  FHIRBundle,
  FHIRAllergyIntolerance,
  FHIRCondition,
  FHIRMedicationStatement,
} from './fhir-types';

const FHIR_BASE = process.env.FHIR_BASE_URL || 'https://vida.mx/fhir';
const SYSTEM_CURP = 'urn:oid:2.16.840.1.113883.4.629'; // CURP OID

class FHIRMapperService {
  /**
   * Map VIDA User to FHIR Patient
   */
  mapPatient(user: {
    id: string;
    name: string;
    email: string;
    curp: string;
    dateOfBirth?: Date | null;
    sex?: string | null;
    phone?: string | null;
    updatedAt: Date;
  }): FHIRPatient {
    const telecom: FHIRPatient['telecom'] = [
      { system: 'email', value: user.email, use: 'home' },
    ];
    if (user.phone) {
      telecom.push({ system: 'phone', value: user.phone, use: 'mobile' });
    }

    return {
      resourceType: 'Patient',
      id: user.id,
      meta: {
        lastUpdated: user.updatedAt.toISOString(),
        profile: ['http://hl7.org/fhir/StructureDefinition/Patient'],
      },
      identifier: [
        { system: SYSTEM_CURP, value: user.curp },
        { system: `${FHIR_BASE}/identifier/vida-id`, value: user.id },
      ],
      active: true,
      name: [{ use: 'official', text: user.name }],
      gender: this.mapGender(user.sex),
      birthDate: user.dateOfBirth?.toISOString().split('T')[0],
      telecom,
    };
  }

  /**
   * Map VIDA AdvanceDirective to FHIR Consent
   */
  mapConsent(directive: {
    id: string;
    userId: string;
    type?: string | null;
    status: string;
    acceptsCPR?: boolean | null;
    acceptsIntubation?: boolean | null;
    content?: string | null;
    validatedAt?: Date | null;
    updatedAt: Date;
  }): FHIRConsent {
    const actions = [];
    if (directive.acceptsCPR === false) {
      actions.push({
        coding: [{ system: 'http://snomed.info/sct', code: '89666000', display: 'CPR' }],
        text: 'Do Not Resuscitate',
      });
    }
    if (directive.acceptsIntubation === false) {
      actions.push({
        coding: [{ system: 'http://snomed.info/sct', code: '232674004', display: 'Endotracheal intubation' }],
        text: 'Do Not Intubate',
      });
    }

    return {
      resourceType: 'Consent',
      id: directive.id,
      meta: {
        lastUpdated: directive.updatedAt.toISOString(),
        profile: ['http://hl7.org/fhir/StructureDefinition/Consent'],
      },
      status: this.mapDirectiveStatus(directive.status),
      scope: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/consentscope', code: 'adr', display: 'Advanced Care Directive' }],
      },
      category: [{
        coding: [{ system: 'http://loinc.org', code: '75781-5', display: 'Advance directive' }],
      }],
      patient: { reference: `Patient/${directive.userId}` },
      dateTime: directive.validatedAt?.toISOString() || directive.updatedAt.toISOString(),
      policy: [{ uri: 'https://www.diputados.gob.mx/LeyesBiblio/pdf/LGSP.pdf' }],
      provision: actions.length > 0 ? {
        type: 'deny',
        action: actions,
      } : undefined,
    };
  }

  /**
   * Map VIDA AuditLog to FHIR AuditEvent
   */
  mapAuditEvent(log: {
    id: string;
    userId?: string | null;
    actorType: string;
    actorName?: string | null;
    action: string;
    resource: string;
    resourceId?: string | null;
    ipAddress?: string | null;
    createdAt: Date;
  }): FHIRAuditEvent {
    return {
      resourceType: 'AuditEvent',
      id: log.id,
      meta: {
        lastUpdated: log.createdAt.toISOString(),
        profile: ['http://hl7.org/fhir/StructureDefinition/AuditEvent'],
      },
      type: { system: 'http://dicom.nema.org/resources/ontology/DCM', code: '110112', display: 'Query' },
      subtype: [{
        system: `${FHIR_BASE}/audit-action`,
        code: log.action,
        display: log.action,
      }],
      action: this.mapAuditAction(log.action),
      recorded: log.createdAt.toISOString(),
      outcome: '0',
      agent: [{
        type: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/extra-security-role-type', code: log.actorType.toLowerCase() }],
        },
        who: log.userId ? { reference: `Patient/${log.userId}` } : undefined,
        name: log.actorName || undefined,
        requestor: true,
        network: log.ipAddress ? { address: log.ipAddress, type: '2' } : undefined,
      }],
      source: {
        site: 'VIDA Platform',
        observer: { reference: `Device/vida-system` },
      },
      entity: log.resourceId ? [{
        what: { reference: `${log.resource}/${log.resourceId}` },
        type: { system: 'http://terminology.hl7.org/CodeSystem/audit-entity-type', code: '2', display: 'System Object' },
      }] : undefined,
    };
  }

  /**
   * Map allergies to FHIR AllergyIntolerance resources
   */
  mapAllergies(patientId: string, allergies: string[]): FHIRAllergyIntolerance[] {
    return allergies.map((allergy, i) => ({
      resourceType: 'AllergyIntolerance' as const,
      id: `${patientId}-allergy-${i}`,
      meta: { lastUpdated: new Date().toISOString() },
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active', display: 'Active' }],
      },
      verificationStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: 'confirmed', display: 'Confirmed' }],
      },
      code: { coding: [{ system: 'http://snomed.info/sct', code: 'unknown', display: allergy }], text: allergy },
      patient: { reference: `Patient/${patientId}` },
    }));
  }

  /**
   * Map conditions to FHIR Condition resources
   */
  mapConditions(patientId: string, conditions: string[]): FHIRCondition[] {
    return conditions.map((condition, i) => ({
      resourceType: 'Condition' as const,
      id: `${patientId}-condition-${i}`,
      meta: { lastUpdated: new Date().toISOString() },
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active', display: 'Active' }],
      },
      code: { coding: [{ system: 'http://snomed.info/sct', code: 'unknown', display: condition }], text: condition },
      subject: { reference: `Patient/${patientId}` },
    }));
  }

  /**
   * Map medications to FHIR MedicationStatement resources
   */
  mapMedications(patientId: string, medications: string[]): FHIRMedicationStatement[] {
    return medications.map((med, i) => ({
      resourceType: 'MedicationStatement' as const,
      id: `${patientId}-med-${i}`,
      meta: { lastUpdated: new Date().toISOString() },
      status: 'active' as const,
      medicationCodeableConcept: { coding: [{ system: 'http://www.whocc.no/atc', code: 'unknown', display: med }], text: med },
      subject: { reference: `Patient/${patientId}` },
    }));
  }

  /**
   * Create a FHIR Bundle from multiple resources
   */
  createBundle(resources: any[], type: 'searchset' | 'collection' = 'searchset'): FHIRBundle {
    return {
      resourceType: 'Bundle',
      id: uuidv4(),
      meta: { lastUpdated: new Date().toISOString() },
      type,
      total: resources.length,
      entry: resources.map(resource => ({
        fullUrl: `${FHIR_BASE}/${resource.resourceType}/${resource.id}`,
        resource,
      })),
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private mapGender(sex?: string | null): 'male' | 'female' | 'other' | 'unknown' {
    if (!sex) return 'unknown';
    if (sex.toUpperCase() === 'H' || sex.toUpperCase() === 'M') return sex.toUpperCase() === 'H' ? 'male' : 'female';
    return 'other';
  }

  private mapDirectiveStatus(status: string): FHIRConsent['status'] {
    const map: Record<string, FHIRConsent['status']> = {
      ACTIVE: 'active',
      DRAFT: 'draft',
      REVOKED: 'inactive',
      EXPIRED: 'inactive',
    };
    return map[status] || 'draft';
  }

  private mapAuditAction(action: string): 'C' | 'R' | 'U' | 'D' | 'E' {
    if (action.includes('CREATE') || action.includes('REGISTER')) return 'C';
    if (action.includes('READ') || action.includes('ACCESS') || action.includes('VIEW')) return 'R';
    if (action.includes('UPDATE') || action.includes('EDIT')) return 'U';
    if (action.includes('DELETE') || action.includes('REMOVE')) return 'D';
    return 'E';
  }
}

export const fhirMapper = new FHIRMapperService();
