export function parseExpiryDate(raw: unknown): Date | null {
  if (!raw) return null;
  if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
  if (typeof raw !== 'string') return null;

  const normalized = raw.replace(/(\d+)(st|nd|rd|th)/gi, '$1').trim();
  const parsed = new Date(normalized);
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const dayMonthYear = normalized.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!dayMonthYear) return null;

  const [, day, month, year] = dayMonthYear;
  const fullYear = year.length === 2 ? `20${year}` : year;
  const fallback = new Date(`${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

export function countExpiringSoonContracts(
  contracts: Array<{ expiry?: unknown }>,
  now: Date = new Date()
): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return contracts.filter((contract) => {
    const expiryDate = parseExpiryDate(contract.expiry);
    if (!expiryDate) return false;

    const normalizedExpiry = new Date(expiryDate.getFullYear(), expiryDate.getMonth(), expiryDate.getDate());
    const daysUntilExpiry = Math.ceil((normalizedExpiry.getTime() - today.getTime()) / 86400000);
    return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
  }).length;
}

export function buildPortfolioAuditSummary(
  contracts: Array<{ riskLevel?: string; status?: string; expiry?: unknown }>,
  now: Date = new Date()
): string {
  const totalContracts = contracts.length;
  if (totalContracts === 0) {
    return 'Portfolio is empty. Upload a contract to generate a live audit.';
  }

  const highRisk = contracts.filter((contract) => contract.riskLevel === 'High Risk').length;
  const reviewRequired = contracts.filter((contract) => contract.status === 'Review Required').length;
  const expiringSoon = countExpiringSoonContracts(contracts, now);

  const findings: string[] = [];
  if (highRisk > 0) findings.push(`${highRisk} high-priority risk${highRisk === 1 ? '' : 's'}`);
  if (reviewRequired > 0) findings.push(`${reviewRequired} document${reviewRequired === 1 ? '' : 's'} awaiting review`);
  if (expiringSoon > 0) findings.push(`${expiringSoon} contract${expiringSoon === 1 ? '' : 's'} expiring within 30 days`);

  if (findings.length > 0) {
    return `${findings.join(', ')} across ${totalContracts} document${totalContracts === 1 ? '' : 's'}.`;
  }

  return `No critical portfolio alerts across ${totalContracts} document${totalContracts === 1 ? '' : 's'}. No contracts are due within the next 30 days.`;
}
