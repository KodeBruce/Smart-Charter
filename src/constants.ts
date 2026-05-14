export interface Contract {
  id: number;
  name: string;
  description: string;
  counterparty: string;
  value: string;
  expiry: string;
  startDate: string;
  category: 'Vendor' | 'HR' | 'M&A' | 'Real Estate' | 'Legal';
  risk: string;
  jurisdiction?: string;
  summary?: string;
}

export const MOCK_CONTRACTS: Contract[] = [
  { id: 1, name: 'MSA - Nexus Global Ventures', description: 'Master Services Agreement', counterparty: 'Nexus Global Ventures', value: '$450,000', expiry: 'Oct 24, 2025', startDate: 'Oct 24, 2022', category: 'Vendor', risk: 'Medium Risk', jurisdiction: 'Delaware, US' },
  { id: 2, name: 'Lease - HQ Tower A', description: 'Real Estate Agreement', counterparty: 'Metropolis Realty', value: '$1,200,000', expiry: 'Jan 12, 2030', startDate: 'Jan 12, 2024', category: 'Real Estate', risk: 'Low Risk', jurisdiction: 'New York, US' },
  { id: 3, name: 'NDA - Project Phoenix', description: 'Confidentiality Agreement', counterparty: 'Stellar Dynamics', value: '—', expiry: 'Jun 05, 2024', startDate: 'Jun 05, 2023', category: 'M&A', risk: 'High Risk', jurisdiction: 'California, US' },
  { id: 4, name: 'SaaS Subscription - AWS', description: 'Cloud Infrastructure', counterparty: 'Amazon Web Services', value: '$240,000', expiry: 'Dec 31, 2024', startDate: 'Jan 01, 2024', category: 'Vendor', risk: 'Low Risk', jurisdiction: 'Ireland' },
  { id: 5, name: 'Procurement - Steel Source', description: 'Supply Agreement', counterparty: 'Global Forge Inc.', value: '$3,450,000', expiry: 'Mar 15, 2026', startDate: 'Mar 15, 2023', category: 'Vendor', risk: 'Medium Risk', jurisdiction: 'Texas, US' },
  { id: 6, name: 'Employment - Alice Chen', description: 'Terms of Employment', counterparty: 'Alice Chen', value: '$140,000/yr', expiry: 'Indefinite', startDate: 'May 01, 2024', category: 'HR', risk: 'Low Risk', jurisdiction: 'South Africa' },
  { id: 7, name: 'Consulting - Bob Smith', description: 'Professional Services', counterparty: ' Bob Smith', value: '$80/hr', expiry: 'Aug 30, 2024', startDate: 'Feb 01, 2024', category: 'HR', risk: 'Medium Risk', jurisdiction: 'United Kingdom' },
];
