// src/__tests__/integration/directive-fhir.vitest.ts
/**
 * Integration tests — Directive creation → FHIR mapping
 *
 * Covers:
 * - Directive → FHIR Consent resource with correct SNOMED codes
 * - Patient profile → FHIR Patient resource with CURP identifier
 * - Full patient bundle — all resources present
 * - Allergy, condition, and medication mapping to clinical FHIR resources
 *
 * Strategy: these tests exercise the pure mapping logic of fhirMapper directly
 * (no HTTP layer, no database).  The mapper is a stateless class that transforms
 * VIDA domain objects into HL7 FHIR R4 structures.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// MODULE MOCKS
// ─────────────────────────────────────────────────────────────────────────────

// uuid — deterministic IDs for bundle assertions
let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: vi.fn(() => `bundle-uuid-${++uuidCounter}`),
}));

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTS (after mocks)
// ─────────────────────────────────────────────────────────────────────────────

import { fhirMapper } from '../../modules/fhir/fhir-mapper.service';

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────

const MOCK_DATE = new Date('2026-03-04T10:00:00.000Z');
const MOCK_PATIENT_ID = 'patient-uuid-001';
const MOCK_DIRECTIVE_ID = 'directive-uuid-001';

const mockUser = {
  id: MOCK_PATIENT_ID,
  name: 'Ana García López',
  email: 'ana@example.com',
  curp: 'GALA850615MDFRCN01',
  dateOfBirth: new Date('1985-06-15'),
  sex: 'M',
  phone: '+525512345678',
  updatedAt: MOCK_DATE,
};

const mockDirectiveActiveCPRDNI = {
  id: MOCK_DIRECTIVE_ID,
  userId: MOCK_PATIENT_ID,
  type: 'NOTARIZED_DOCUMENT',
  status: 'ACTIVE',
  acceptsCPR: false,
  acceptsIntubation: false,
  content: 'Directiva notarial',
  validatedAt: MOCK_DATE,
  updatedAt: MOCK_DATE,
};

const mockDirectiveDraft = {
  id: 'directive-draft-001',
  userId: MOCK_PATIENT_ID,
  type: null,
  status: 'DRAFT',
  acceptsCPR: null,
  acceptsIntubation: null,
  content: null,
  validatedAt: null,
  updatedAt: MOCK_DATE,
};

const mockDirectiveActive = {
  ...mockDirectiveActiveCPRDNI,
  acceptsCPR: true,
  acceptsIntubation: true,
};

// ─────────────────────────────────────────────────────────────────────────────
// TESTS
// ─────────────────────────────────────────────────────────────────────────────

describe('FHIRMapper — directive → FHIR Consent', () => {
  beforeEach(() => {
    uuidCounter = 0;
  });

  // ── Basic structure ───────────────────────────────────────────────────────

  it('returns resourceType "Consent"', () => {
    const consent = fhirMapper.mapConsent(mockDirectiveActiveCPRDNI);
    expect(consent.resourceType).toBe('Consent');
  });

  it('uses the directive id as the FHIR resource id', () => {
    const consent = fhirMapper.mapConsent(mockDirectiveActiveCPRDNI);
    expect(consent.id).toBe(MOCK_DIRECTIVE_ID);
  });

  it('references the patient via Patient/{userId}', () => {
    const consent = fhirMapper.mapConsent(mockDirectiveActiveCPRDNI);
    expect(consent.patient.reference).toBe(`Patient/${MOCK_PATIENT_ID}`);
  });

  it('includes the advance directive scope code (adr)', () => {
    const consent = fhirMapper.mapConsent(mockDirectiveActiveCPRDNI);
    expect(consent.scope.coding[0].code).toBe('adr');
  });

  it('includes LOINC category code 75781-5 (Advance directive)', () => {
    const consent = fhirMapper.mapConsent(mockDirectiveActiveCPRDNI);
    expect(consent.category[0].coding[0].code).toBe('75781-5');
  });

  it('includes Mexican legal policy reference (LGSP)', () => {
    const consent = fhirMapper.mapConsent(mockDirectiveActiveCPRDNI);
    expect(consent.policy?.[0].uri).toContain('LGSP');
  });

  // ── Status mapping ────────────────────────────────────────────────────────

  it('maps ACTIVE directive to "active" FHIR status', () => {
    const consent = fhirMapper.mapConsent(mockDirectiveActiveCPRDNI);
    expect(consent.status).toBe('active');
  });

  it('maps DRAFT directive to "draft" FHIR status', () => {
    const consent = fhirMapper.mapConsent(mockDirectiveDraft);
    expect(consent.status).toBe('draft');
  });

  it('maps unknown status to "draft" as safe default', () => {
    const consent = fhirMapper.mapConsent({ ...mockDirectiveActiveCPRDNI, status: 'UNKNOWN_STATUS' });
    expect(consent.status).toBe('draft');
  });

  // ── SNOMED codes for DNR / DNI ────────────────────────────────────────────

  it('adds CPR SNOMED code 89666000 when acceptsCPR is false', () => {
    const consent = fhirMapper.mapConsent(mockDirectiveActiveCPRDNI);
    const cprAction = consent.provision?.action?.find(
      (a) => a.coding[0].code === '89666000'
    );
    expect(cprAction).toBeDefined();
    expect(cprAction!.text).toBe('Do Not Resuscitate');
  });

  it('adds intubation SNOMED code 232674004 when acceptsIntubation is false', () => {
    const consent = fhirMapper.mapConsent(mockDirectiveActiveCPRDNI);
    const intubationAction = consent.provision?.action?.find(
      (a) => a.coding[0].code === '232674004'
    );
    expect(intubationAction).toBeDefined();
    expect(intubationAction!.text).toBe('Do Not Intubate');
  });

  it('sets provision type to "deny" when any refusal action exists', () => {
    const consent = fhirMapper.mapConsent(mockDirectiveActiveCPRDNI);
    expect(consent.provision?.type).toBe('deny');
  });

  it('omits provision block when patient accepts all interventions', () => {
    const consent = fhirMapper.mapConsent(mockDirectiveActive);
    expect(consent.provision).toBeUndefined();
  });

  it('includes both SNOMED codes when patient refuses both CPR and intubation', () => {
    const consent = fhirMapper.mapConsent(mockDirectiveActiveCPRDNI);
    expect(consent.provision?.action).toHaveLength(2);
  });

  it('adds only CPR code when patient refuses CPR but accepts intubation', () => {
    const consent = fhirMapper.mapConsent({
      ...mockDirectiveActiveCPRDNI,
      acceptsCPR: false,
      acceptsIntubation: true,
    });
    expect(consent.provision?.action).toHaveLength(1);
    expect(consent.provision?.action![0].coding[0].code).toBe('89666000');
  });

  it('uses validatedAt as dateTime when available', () => {
    const consent = fhirMapper.mapConsent(mockDirectiveActiveCPRDNI);
    expect(consent.dateTime).toBe(MOCK_DATE.toISOString());
  });

  it('falls back to updatedAt as dateTime when validatedAt is null', () => {
    const consent = fhirMapper.mapConsent(mockDirectiveDraft);
    expect(consent.dateTime).toBe(MOCK_DATE.toISOString());
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('FHIRMapper — patient profile → FHIR Patient', () => {
  it('returns resourceType "Patient"', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    expect(patient.resourceType).toBe('Patient');
  });

  it('uses the user id as the FHIR resource id', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    expect(patient.id).toBe(MOCK_PATIENT_ID);
  });

  // ── CURP identifier ───────────────────────────────────────────────────────

  it('includes CURP identifier with official OID', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    const curpIdentifier = patient.identifier.find(
      (id) => id.system === 'urn:oid:2.16.840.1.113883.4.629'
    );
    expect(curpIdentifier).toBeDefined();
    expect(curpIdentifier!.value).toBe('GALA850615MDFRCN01');
  });

  it('includes VIDA internal ID as second identifier', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    const vidaId = patient.identifier.find((id) => id.system.includes('vida-id'));
    expect(vidaId).toBeDefined();
    expect(vidaId!.value).toBe(MOCK_PATIENT_ID);
  });

  // ── Demographics ──────────────────────────────────────────────────────────

  it('maps sex "M" (femenino) to FHIR gender "female"', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    expect(patient.gender).toBe('female');
  });

  it('maps sex "H" (masculino) to FHIR gender "male"', () => {
    const patient = fhirMapper.mapPatient({ ...mockUser, sex: 'H' });
    expect(patient.gender).toBe('male');
  });

  it('maps null sex to FHIR gender "unknown"', () => {
    const patient = fhirMapper.mapPatient({ ...mockUser, sex: null });
    expect(patient.gender).toBe('unknown');
  });

  it('formats birthDate as YYYY-MM-DD string', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    expect(patient.birthDate).toBe('1985-06-15');
  });

  it('omits birthDate when dateOfBirth is null', () => {
    const patient = fhirMapper.mapPatient({ ...mockUser, dateOfBirth: null });
    expect(patient.birthDate).toBeUndefined();
  });

  it('includes email in telecom list', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    const emailContact = patient.telecom?.find((t) => t.system === 'email');
    expect(emailContact?.value).toBe('ana@example.com');
  });

  it('includes phone in telecom list when provided', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    const phoneContact = patient.telecom?.find((t) => t.system === 'phone');
    expect(phoneContact?.value).toBe('+525512345678');
  });

  it('omits phone from telecom when null', () => {
    const patient = fhirMapper.mapPatient({ ...mockUser, phone: null });
    const phoneContact = patient.telecom?.find((t) => t.system === 'phone');
    expect(phoneContact).toBeUndefined();
  });

  it('uses "official" name use and full name text', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    expect(patient.name[0].use).toBe('official');
    expect(patient.name[0].text).toBe('Ana García López');
  });

  it('sets active to true', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    expect(patient.active).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('FHIRMapper — full patient bundle', () => {
  it('createBundle returns resourceType "Bundle"', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    const bundle = fhirMapper.createBundle([patient]);
    expect(bundle.resourceType).toBe('Bundle');
  });

  it('bundle total matches number of resources provided', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    const consent = fhirMapper.mapConsent(mockDirectiveActiveCPRDNI);
    const bundle = fhirMapper.createBundle([patient, consent]);
    expect(bundle.total).toBe(2);
  });

  it('bundle entry count matches resources provided', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    const consent = fhirMapper.mapConsent(mockDirectiveActiveCPRDNI);
    const bundle = fhirMapper.createBundle([patient, consent]);
    expect(bundle.entry).toHaveLength(2);
  });

  it('each entry contains a fullUrl', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    const bundle = fhirMapper.createBundle([patient]);
    expect(bundle.entry![0].fullUrl).toBeDefined();
    expect(bundle.entry![0].fullUrl).toContain('Patient');
  });

  it('each entry contains the resource itself', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    const bundle = fhirMapper.createBundle([patient]);
    expect((bundle.entry![0].resource as any).resourceType).toBe('Patient');
  });

  it('full patient bundle contains Patient + Consent + allergies + conditions + medications', () => {
    const patient = fhirMapper.mapPatient(mockUser);
    const consent = fhirMapper.mapConsent(mockDirectiveActiveCPRDNI);
    const allergies = fhirMapper.mapAllergies(MOCK_PATIENT_ID, ['Penicilina']);
    const conditions = fhirMapper.mapConditions(MOCK_PATIENT_ID, ['Diabetes tipo 2']);
    const medications = fhirMapper.mapMedications(MOCK_PATIENT_ID, ['Metformina 500mg']);

    const allResources = [patient, consent, ...allergies, ...conditions, ...medications];
    const bundle = fhirMapper.createBundle(allResources, 'collection');

    const types = bundle.entry!.map((e) => (e.resource as any).resourceType);
    expect(types).toContain('Patient');
    expect(types).toContain('Consent');
    expect(types).toContain('AllergyIntolerance');
    expect(types).toContain('Condition');
    expect(types).toContain('MedicationStatement');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('FHIRMapper — allergy / condition / medication mapping', () => {
  const ALLERGIES = ['Penicilina', 'Mariscos', 'Látex'];
  const CONDITIONS = ['Diabetes tipo 2', 'Hipertensión arterial'];
  const MEDICATIONS = ['Metformina 500mg', 'Enalapril 10mg'];

  // ── AllergyIntolerance ────────────────────────────────────────────────────

  it('creates one AllergyIntolerance resource per allergy', () => {
    const result = fhirMapper.mapAllergies(MOCK_PATIENT_ID, ALLERGIES);
    expect(result).toHaveLength(3);
  });

  it('each AllergyIntolerance has resourceType "AllergyIntolerance"', () => {
    const result = fhirMapper.mapAllergies(MOCK_PATIENT_ID, ALLERGIES);
    result.forEach((a) => expect(a.resourceType).toBe('AllergyIntolerance'));
  });

  it('uses SNOMED CT as the coding system for allergies', () => {
    const result = fhirMapper.mapAllergies(MOCK_PATIENT_ID, ['Penicilina']);
    expect(result[0].code.coding[0].system).toBe('http://snomed.info/sct');
  });

  it('sets the allergy display text to the allergy name', () => {
    const result = fhirMapper.mapAllergies(MOCK_PATIENT_ID, ['Penicilina']);
    expect(result[0].code.coding[0].display).toBe('Penicilina');
    expect(result[0].code.text).toBe('Penicilina');
  });

  it('references the patient in each AllergyIntolerance', () => {
    const result = fhirMapper.mapAllergies(MOCK_PATIENT_ID, ['Penicilina']);
    expect(result[0].patient.reference).toBe(`Patient/${MOCK_PATIENT_ID}`);
  });

  it('sets clinicalStatus to "active" for all allergies', () => {
    const result = fhirMapper.mapAllergies(MOCK_PATIENT_ID, ['Penicilina']);
    expect(result[0].clinicalStatus.coding[0].code).toBe('active');
  });

  it('sets verificationStatus to "confirmed" for all allergies', () => {
    const result = fhirMapper.mapAllergies(MOCK_PATIENT_ID, ['Penicilina']);
    expect(result[0].verificationStatus.coding[0].code).toBe('confirmed');
  });

  it('returns empty array when no allergies', () => {
    const result = fhirMapper.mapAllergies(MOCK_PATIENT_ID, []);
    expect(result).toHaveLength(0);
  });

  // ── Condition ─────────────────────────────────────────────────────────────

  it('creates one Condition resource per condition', () => {
    const result = fhirMapper.mapConditions(MOCK_PATIENT_ID, CONDITIONS);
    expect(result).toHaveLength(2);
  });

  it('each Condition has resourceType "Condition"', () => {
    const result = fhirMapper.mapConditions(MOCK_PATIENT_ID, CONDITIONS);
    result.forEach((c) => expect(c.resourceType).toBe('Condition'));
  });

  it('uses SNOMED CT as coding system for conditions', () => {
    const result = fhirMapper.mapConditions(MOCK_PATIENT_ID, ['Diabetes tipo 2']);
    expect(result[0].code.coding[0].system).toBe('http://snomed.info/sct');
  });

  it('sets the condition display text to the condition name', () => {
    const result = fhirMapper.mapConditions(MOCK_PATIENT_ID, ['Diabetes tipo 2']);
    expect(result[0].code.coding[0].display).toBe('Diabetes tipo 2');
    expect(result[0].code.text).toBe('Diabetes tipo 2');
  });

  it('references the patient as "subject" in each Condition', () => {
    const result = fhirMapper.mapConditions(MOCK_PATIENT_ID, ['Diabetes tipo 2']);
    expect(result[0].subject.reference).toBe(`Patient/${MOCK_PATIENT_ID}`);
  });

  it('sets clinicalStatus to "active" for each condition', () => {
    const result = fhirMapper.mapConditions(MOCK_PATIENT_ID, ['Diabetes tipo 2']);
    expect(result[0].clinicalStatus.coding[0].code).toBe('active');
  });

  it('returns empty array when no conditions', () => {
    const result = fhirMapper.mapConditions(MOCK_PATIENT_ID, []);
    expect(result).toHaveLength(0);
  });

  // ── MedicationStatement ───────────────────────────────────────────────────

  it('creates one MedicationStatement resource per medication', () => {
    const result = fhirMapper.mapMedications(MOCK_PATIENT_ID, MEDICATIONS);
    expect(result).toHaveLength(2);
  });

  it('each MedicationStatement has resourceType "MedicationStatement"', () => {
    const result = fhirMapper.mapMedications(MOCK_PATIENT_ID, MEDICATIONS);
    result.forEach((m) => expect(m.resourceType).toBe('MedicationStatement'));
  });

  it('uses ATC coding system for medications', () => {
    const result = fhirMapper.mapMedications(MOCK_PATIENT_ID, ['Metformina 500mg']);
    expect(result[0].medicationCodeableConcept.coding[0].system).toBe('http://www.whocc.no/atc');
  });

  it('sets the medication display text to the medication name', () => {
    const result = fhirMapper.mapMedications(MOCK_PATIENT_ID, ['Metformina 500mg']);
    expect(result[0].medicationCodeableConcept.coding[0].display).toBe('Metformina 500mg');
    expect(result[0].medicationCodeableConcept.text).toBe('Metformina 500mg');
  });

  it('sets medication status to "active"', () => {
    const result = fhirMapper.mapMedications(MOCK_PATIENT_ID, ['Metformina 500mg']);
    expect(result[0].status).toBe('active');
  });

  it('references the patient as "subject" in each MedicationStatement', () => {
    const result = fhirMapper.mapMedications(MOCK_PATIENT_ID, ['Metformina 500mg']);
    expect(result[0].subject.reference).toBe(`Patient/${MOCK_PATIENT_ID}`);
  });

  it('returns empty array when no medications', () => {
    const result = fhirMapper.mapMedications(MOCK_PATIENT_ID, []);
    expect(result).toHaveLength(0);
  });
});
