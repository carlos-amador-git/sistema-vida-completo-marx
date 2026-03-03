// src/services/consentApi.ts
import api from './api';

export interface PolicyVersion {
  id: string;
  version: string;
  content: string;
  summary: string | null;
  publishedAt: string;
}

export interface ConsentStatus {
  hasAcceptedCurrentPolicy: boolean;
  currentPolicyVersion: string | null;
  currentPolicyId: string | null;
}

export interface ConsentRecord {
  id: string;
  policyVersionId: string;
  acceptedAt: string;
  scope: string[];
  revokedAt: string | null;
  policyVersion: {
    version: string;
    publishedAt: string;
    summary: string | null;
  };
}

export const consentApi = {
  getActivePolicy: async (): Promise<PolicyVersion | null> => {
    try {
      const { data } = await api.get('/consent/policy');
      return data.data;
    } catch {
      return null;
    }
  },

  acceptPolicy: async (policyVersionId: string, scope: string[] = ['essential']) => {
    const { data } = await api.post('/consent/accept', { policyVersionId, scope });
    return data.data;
  },

  getConsentStatus: async (): Promise<ConsentStatus> => {
    const { data } = await api.get('/consent/status');
    return data.data;
  },

  getConsentHistory: async (): Promise<ConsentRecord[]> => {
    const { data } = await api.get('/consent/history');
    return data.data;
  },
};
