#!/usr/bin/env node
/**
 * i18n Translation Key Parity Audit
 * Compares ES and EN JSON locale files for missing keys and untranslated values.
 */

const fs = require('fs');
const path = require('path');

// Proper nouns / technical terms that are the same in both languages — not considered "untranslated"
const ALLOWED_SAME = new Set([
  'IMSS', 'ISSSTE', 'CURP', 'NOM-151', 'VIDA', 'Premium', 'Google Wallet',
  'Apple Wallet', 'Face ID', 'Touch ID', 'Windows Hello', 'NFC', 'QR', 'PDF',
  'OXXO', 'Stripe', 'RFC', 'INE', 'IFE', 'SAT', 'CDMX', 'MXN', 'USD',
  'CFDI', 'API', 'URL', 'OK', 'email', 'Email', 'PIN', 'SMS', 'WhatsApp',
  'iOS', 'Android', 'Web', 'ID', 'N/A', 'n/a', 'Beta', 'Alpha',
  // single-character or numeric strings
]);

/**
 * Flatten a nested object into dot-notation keys.
 * e.g. { a: { b: 'val' } } => { 'a.b': 'val' }
 */
function flatten(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value, fullKey));
    } else {
      result[fullKey] = typeof value === 'string' ? value : JSON.stringify(value);
    }
  }
  return result;
}

function isAllowedSame(value) {
  if (!value || typeof value !== 'string') return true;
  const trimmed = value.trim();
  // Single char or empty
  if (trimmed.length <= 1) return true;
  // Pure number
  if (/^\d+$/.test(trimmed)) return true;
  // Starts with {{ (interpolation variable only)
  if (/^\{\{[^}]+\}\}$/.test(trimmed)) return true;
  // Starts with http(s) — URLs
  if (/^https?:\/\//.test(trimmed)) return true;
  // Check known allowed terms
  if (ALLOWED_SAME.has(trimmed)) return true;
  // Contains only allowed proper nouns (check if every word is a known term)
  // e.g. "IMSS / ISSSTE"
  const words = trimmed.split(/[\s\/,;:]+/).filter(Boolean);
  if (words.every(w => ALLOWED_SAME.has(w))) return true;
  return false;
}

function compareLocales(esPath, enPath, namespace) {
  const issues = {
    missingInEN: [],
    missingInES: [],
    possiblyUntranslated: [],
  };

  let esData, enData;
  try {
    esData = JSON.parse(fs.readFileSync(esPath, 'utf8'));
  } catch (e) {
    issues.error = `Cannot read ES file: ${e.message}`;
    return issues;
  }
  try {
    enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  } catch (e) {
    issues.error = `Cannot read EN file: ${e.message}`;
    return issues;
  }

  const esFlat = flatten(esData);
  const enFlat = flatten(enData);

  const esKeys = new Set(Object.keys(esFlat));
  const enKeys = new Set(Object.keys(enFlat));

  // Keys in ES but not EN
  for (const key of esKeys) {
    if (!enKeys.has(key)) {
      issues.missingInEN.push({ key, esValue: esFlat[key] });
    }
  }

  // Keys in EN but not ES
  for (const key of enKeys) {
    if (!esKeys.has(key)) {
      issues.missingInES.push({ key, enValue: enFlat[key] });
    }
  }

  // Keys in both — check if value is identical (possible untranslated)
  for (const key of esKeys) {
    if (enKeys.has(key)) {
      const esVal = esFlat[key];
      const enVal = enFlat[key];
      if (esVal === enVal && !isAllowedSame(esVal)) {
        issues.possiblyUntranslated.push({ key, value: esVal });
      }
    }
  }

  return issues;
}

function runAudit(groups) {
  let totalIssues = 0;
  const report = [];

  for (const { label, namespaces } of groups) {
    report.push(`\n${'='.repeat(70)}`);
    report.push(`GROUP: ${label}`);
    report.push('='.repeat(70));

    for (const { ns, esFile, enFile } of namespaces) {
      const result = compareLocales(esFile, enFile, ns);

      const hasIssues =
        result.error ||
        result.missingInEN.length > 0 ||
        result.missingInES.length > 0 ||
        result.possiblyUntranslated.length > 0;

      if (!hasIssues) continue; // skip clean namespaces

      report.push(`\n  NAMESPACE: ${ns}`);
      report.push(`  ${'─'.repeat(50)}`);

      if (result.error) {
        report.push(`  ERROR: ${result.error}`);
        totalIssues++;
        continue;
      }

      if (result.missingInEN.length > 0) {
        report.push(`  [MISSING IN EN] (${result.missingInEN.length} keys):`);
        for (const { key, esValue } of result.missingInEN) {
          const preview = esValue.length > 60 ? esValue.substring(0, 60) + '…' : esValue;
          report.push(`    - "${key}" (ES: "${preview}")`);
        }
        totalIssues += result.missingInEN.length;
      }

      if (result.missingInES.length > 0) {
        report.push(`  [MISSING IN ES] (${result.missingInES.length} keys):`);
        for (const { key, enValue } of result.missingInES) {
          const preview = enValue.length > 60 ? enValue.substring(0, 60) + '…' : enValue;
          report.push(`    - "${key}" (EN: "${preview}")`);
        }
        totalIssues += result.missingInES.length;
      }

      if (result.possiblyUntranslated.length > 0) {
        report.push(`  [POSSIBLY UNTRANSLATED] (${result.possiblyUntranslated.length} keys):`);
        for (const { key, value } of result.possiblyUntranslated) {
          const preview = value.length > 60 ? value.substring(0, 60) + '…' : value;
          report.push(`    - "${key}" = "${preview}"`);
        }
        totalIssues += result.possiblyUntranslated.length;
      }
    }
  }

  report.push(`\n${'='.repeat(70)}`);
  if (totalIssues === 0) {
    report.push('RESULT: All locale files are perfectly paired — no issues found.');
  } else {
    report.push(`RESULT: ${totalIssues} total issue(s) found across all namespaces.`);
  }
  report.push('='.repeat(70));

  return report.join('\n');
}

// ─── Configuration ────────────────────────────────────────────────────────────

const FRONTEND_ES = '/Users/marxchavez/Projects/VIDA/sistema-vida-completo-marx/frontend/src/i18n/locales/es';
const FRONTEND_EN = '/Users/marxchavez/Projects/VIDA/sistema-vida-completo-marx/frontend/src/i18n/locales/en';
const BACKEND_ES  = '/Users/marxchavez/Projects/VIDA/sistema-vida-completo-marx/backend/src/common/i18n/locales/es';
const BACKEND_EN  = '/Users/marxchavez/Projects/VIDA/sistema-vida-completo-marx/backend/src/common/i18n/locales/en';

const groups = [
  {
    label: 'Frontend',
    namespaces: [
      'common', 'auth', 'dashboard', 'landing', 'profile',
      'directives', 'representatives', 'documents', 'emergency',
      'notifications', 'subscription', 'admin', 'extras',
    ].map(ns => ({
      ns,
      esFile: path.join(FRONTEND_ES, `${ns}.json`),
      enFile: path.join(FRONTEND_EN, `${ns}.json`),
    })),
  },
  {
    label: 'Backend',
    namespaces: ['api', 'validation', 'notifications', 'emails'].map(ns => ({
      ns,
      esFile: path.join(BACKEND_ES, `${ns}.json`),
      enFile: path.join(BACKEND_EN, `${ns}.json`),
    })),
  },
];

console.log(runAudit(groups));
