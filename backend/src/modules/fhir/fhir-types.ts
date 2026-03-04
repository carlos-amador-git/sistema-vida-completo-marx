// src/modules/fhir/fhir-types.ts
/**
 * HL7 FHIR R4 Resource Types for VIDA System
 *
 * Maps VIDA's domain models to FHIR standard resources:
 * - Consent (advance directives)
 * - Patient (basic demographics)
 * - AuditEvent (access logging)
 * - AllergyIntolerance
 * - Condition (medical conditions)
 * - MedicationStatement
 */

// ─── Base FHIR Types ────────────────────────────────────────────────────────

interface FHIRMeta {
  versionId?: string;
  lastUpdated: string;
  profile?: string[];
}

interface FHIRIdentifier {
  system: string;
  value: string;
}

interface FHIRCoding {
  system: string;
  code: string;
  display?: string;
}

interface FHIRCodeableConcept {
  coding: FHIRCoding[];
  text?: string;
}

interface FHIRReference {
  reference: string;
  display?: string;
}

interface FHIRPeriod {
  start?: string;
  end?: string;
}

// ─── Patient Resource ───────────────────────────────────────────────────────

export interface FHIRPatient {
  resourceType: 'Patient';
  id: string;
  meta: FHIRMeta;
  identifier: FHIRIdentifier[];
  active: boolean;
  name: Array<{
    use: 'official';
    text: string;
  }>;
  gender?: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  telecom?: Array<{
    system: 'phone' | 'email';
    value: string;
    use: 'home' | 'work' | 'mobile';
  }>;
}

// ─── Consent Resource (Advance Directives) ──────────────────────────────────

export interface FHIRConsent {
  resourceType: 'Consent';
  id: string;
  meta: FHIRMeta;
  status: 'draft' | 'proposed' | 'active' | 'rejected' | 'inactive' | 'entered-in-error';
  scope: FHIRCodeableConcept;
  category: FHIRCodeableConcept[];
  patient: FHIRReference;
  dateTime: string;
  performer?: FHIRReference[];
  organization?: FHIRReference[];
  policy?: Array<{
    authority?: string;
    uri?: string;
  }>;
  provision?: {
    type: 'deny' | 'permit';
    period?: FHIRPeriod;
    action?: FHIRCodeableConcept[];
    purpose?: FHIRCoding[];
    data?: Array<{
      meaning: 'instance' | 'related' | 'dependents' | 'authoredby';
      reference: FHIRReference;
    }>;
  };
}

// ─── AuditEvent Resource ────────────────────────────────────────────────────

export interface FHIRAuditEvent {
  resourceType: 'AuditEvent';
  id: string;
  meta: FHIRMeta;
  type: FHIRCoding;
  subtype?: FHIRCoding[];
  action: 'C' | 'R' | 'U' | 'D' | 'E'; // Create, Read, Update, Delete, Execute
  period?: FHIRPeriod;
  recorded: string;
  outcome: '0' | '4' | '8' | '12'; // Success, Minor failure, Serious failure, Major failure
  agent: Array<{
    type?: FHIRCodeableConcept;
    who?: FHIRReference;
    name?: string;
    requestor: boolean;
    network?: {
      address: string;
      type: '1' | '2'; // Machine name, IP address
    };
  }>;
  source: {
    site?: string;
    observer: FHIRReference;
    type?: FHIRCoding[];
  };
  entity?: Array<{
    what?: FHIRReference;
    type?: FHIRCoding;
    role?: FHIRCoding;
    name?: string;
    description?: string;
  }>;
}

// ─── AllergyIntolerance Resource ────────────────────────────────────────────

export interface FHIRAllergyIntolerance {
  resourceType: 'AllergyIntolerance';
  id: string;
  meta: FHIRMeta;
  clinicalStatus: FHIRCodeableConcept;
  verificationStatus: FHIRCodeableConcept;
  type?: 'allergy' | 'intolerance';
  category?: Array<'food' | 'medication' | 'environment' | 'biologic'>;
  code: FHIRCodeableConcept;
  patient: FHIRReference;
  recordedDate?: string;
}

// ─── Condition Resource ─────────────────────────────────────────────────────

export interface FHIRCondition {
  resourceType: 'Condition';
  id: string;
  meta: FHIRMeta;
  clinicalStatus: FHIRCodeableConcept;
  code: FHIRCodeableConcept;
  subject: FHIRReference;
  recordedDate?: string;
}

// ─── MedicationStatement Resource ───────────────────────────────────────────

export interface FHIRMedicationStatement {
  resourceType: 'MedicationStatement';
  id: string;
  meta: FHIRMeta;
  status: 'active' | 'completed' | 'entered-in-error' | 'intended' | 'stopped' | 'on-hold' | 'unknown' | 'not-taken';
  medicationCodeableConcept: FHIRCodeableConcept;
  subject: FHIRReference;
  dateAsserted?: string;
}

// ─── Bundle Resource ────────────────────────────────────────────────────────

export interface FHIRBundle {
  resourceType: 'Bundle';
  id: string;
  meta: FHIRMeta;
  type: 'searchset' | 'collection' | 'document' | 'transaction';
  total?: number;
  entry?: Array<{
    fullUrl?: string;
    resource: FHIRPatient | FHIRConsent | FHIRAuditEvent | FHIRAllergyIntolerance | FHIRCondition | FHIRMedicationStatement;
  }>;
}
