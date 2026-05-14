# Security Specification - ContractAI

## 1. Data Invariants
- A `Contract` must belong to a valid `User` (`ownerId`).
- Only the `owner` of a `Contract` can read, update, or delete it.
- `Insight` and `ActionItem` sub-collections are strictly tied to their parent `Contract`. Access is inherited from the parent `Contract` ownership.
- Users cannot modify their `id` or `email` after creation.
- Contracts cannot change their `ownerId` after creation.
- `createdAt` timestamps are immutable.
- `updatedAt` must be set to the server time on every update.
- Document IDs must follow strict formatting rules (alphanumeric, max length).

## 2. The "Dirty Dozen" Payloads (Red Team Test Cases)

| ID | Attack Type | Target Path | Payload | Expected Result |
|----|-------------|-------------|---------|-----------------|
| T1 | Identity Spoofing | `/contracts/new_id` | `{"ownerId": "victim_uid", "name": "Hack"}` | PERMISSION_DENIED |
| T2 | Shadow Update | `/contracts/my_id` | `{"ownerId": "attacker_uid"}` | PERMISSION_DENIED |
| T3 | Immutable Violation | `/contracts/my_id` | `{"createdAt": "2020-01-01T00:00:00Z"}` | PERMISSION_DENIED |
| T4 | Privilege Escalation | `/users/my_id` | `{"role": "admin"}` | PERMISSION_DENIED |
| T5 | Orphaned Write | `/contracts/id1/insights/i1` | `{"contractId": "id2"}` | PERMISSION_DENIED |
| T6 | ID Poisoning | `/contracts/LONG_ID_1MB...` | `{...}` | PERMISSION_DENIED |
| T7 | Value Poisoning | `/contracts/my_id` | `{"overallRiskScore": "high"}` (should be number) | PERMISSION_DENIED |
| T8 | PII Leak | `/users/victim_id` | `get()` | PERMISSION_DENIED |
| T9 | Global Read | `/contracts` | `list` (without filter) | PERMISSION_DENIED |
| T10 | System Field Modification | `/contracts/my_id` | `{"status": "Review Complete"}` (without proper action check) | PERMISSION_DENIED |
| T11 | Cross-User Subcollection Write | `/contracts/victim_contract/insights/new` | `{...}` | PERMISSION_DENIED |
| T12 | Unverified Email Access | `/contracts/my_id` | `get()` (with unverified email) | PERMISSION_DENIED |

## 3. Test Runner (Draft)
A `firestore.rules.test.ts` will be implemented to programmatically verify these cases.
