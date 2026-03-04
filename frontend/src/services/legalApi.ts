// src/services/legalApi.ts
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

// Standalone axios instance (no auth required — public endpoint)
const publicApi = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: false,
});

// ─── Types mirroring backend privacy-notice.ts ───────────────────────────────

export interface DataCategory {
  category: string;
  items: string[];
  sensitive: boolean;
}

export interface Purpose {
  id: string;
  title: string;
  description: string;
  legalBasis: string;
  required: boolean;
}

export interface Transfer {
  recipient: string;
  country: string;
  purpose: string;
  legalBasis: string;
}

export interface ArcoRights {
  description: string;
  contactEmail: string;
  contactAddress: string;
  responseDeadlineDays: number;
  requiredInfo: string[];
  procedure: string[];
}

export interface ConsentInfo {
  mechanism: string;
  sensitiveDataConsent: string;
  minorDataPolicy: string;
}

export interface RevocationInfo {
  mechanism: string;
  procedure: string[];
  effects: string;
  contactEmail: string;
}

export interface CookieInfo {
  essentialCookies: string[];
  analyticalCookies: string[];
  marketingCookies: boolean;
  thirdPartyTracking: boolean;
  optOutMechanism: string;
}

export interface ChangesPolicy {
  notificationMechanism: string[];
  consentRequired: boolean;
  archiveLocation: string;
}

export interface PrivacyNotice {
  version: string;
  effectiveDate: string;
  lastUpdated: string;
  responsibleParty: {
    name: string;
    legalName: string;
    address: string;
    email: string;
    phone: string;
    website: string;
  };
  sections: {
    dataCollected: DataCategory[];
    purposes: Purpose[];
    transfers: Transfer[];
    arcoRights: ArcoRights;
    consent: ConsentInfo;
    revocation: RevocationInfo;
    cookies: CookieInfo;
    changes: ChangesPolicy;
    securityMeasures: string;
    dataRetention: string;
    inapeContactInfo: string;
  };
}

export interface PrivacyNoticeSimplified {
  version: string;
  effectiveDate: string;
  responsibleParty: { name: string; email: string };
  summary: {
    whoWeAre: string;
    dataCollected: string;
    whyWeUseIt: string;
    whoWeShareWith: string;
    yourRights: string;
    sensitiveData: string;
  };
  fullNoticeUrl: string;
}

// ─── API calls ───────────────────────────────────────────────────────────────

export const legalApi = {
  getPrivacyNotice: async (): Promise<PrivacyNotice | null> => {
    try {
      const { data } = await publicApi.get('/legal/privacy-notice');
      return data.data as PrivacyNotice;
    } catch {
      return null;
    }
  },

  getPrivacyNoticeSimplified: async (): Promise<PrivacyNoticeSimplified | null> => {
    try {
      const { data } = await publicApi.get('/legal/privacy-notice/simplified');
      return data.data as PrivacyNoticeSimplified;
    } catch {
      return null;
    }
  },
};
