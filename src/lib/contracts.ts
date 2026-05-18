export interface ComparisonContractSource {
  id: string;
  expiry?: string | null;
  expiryDate?: string | null;
  riskLevel?: string | null;
  [key: string]: unknown;
}

export function normalizeComparisonContract(data: ComparisonContractSource) {
  return {
    ...data,
    expiry: data.expiry || data.expiryDate,
    risk: data.riskLevel,
  };
}

export function getContractOwnerId(contractData: { ownerId?: string | null; userId?: string | null } | undefined) {
  return contractData?.ownerId || contractData?.userId || null;
}
