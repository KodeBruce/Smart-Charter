import React from 'react';
import { FileText, Search, ShieldAlert, Calendar, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import TopBar from '../components/TopBar';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';

function riskTone(level?: string) {
  if (level === 'High Risk') return 'text-error';
  if (level === 'Medium Risk') return 'text-warning';
  return 'text-success';
}

export default function Repository() {
  const navigate = useNavigate();
  const [contracts, setContracts] = React.useState<any[]>([]);
  const [search, setSearch] = React.useState('');
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    if (!auth.currentUser) return;

    const contractsQuery = query(
      collection(db, 'contracts'),
      where('ownerId', '==', auth.currentUser.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(contractsQuery, (snapshot) => {
      setContracts(snapshot.docs.map((contractDoc) => ({ id: contractDoc.id, ...contractDoc.data() })));
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'contracts');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredContracts = contracts.filter((contract) => {
    const haystack = `${contract.name || ''} ${contract.counterparty || ''} ${contract.status || ''}`.toLowerCase();
    return haystack.includes(search.toLowerCase());
  });

  return (
    <div className="flex h-full flex-col overflow-hidden bg-surface">
      <TopBar title="Repository" />
      <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <section className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-on-surface/35">Document Vault</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-on-surface">Live Repository</h1>
            <p className="mt-2 max-w-2xl text-sm text-on-surface/60">
              This view now reads directly from your authenticated contract collection instead of using placeholder content.
            </p>
          </div>

          <label className="flex items-center gap-3 rounded-xl border border-outline/10 bg-surface-container px-3 py-2 sm:min-w-[320px]">
            <Search className="h-4 w-4 text-on-surface/35" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search contracts, counterparties, or statuses"
              className="w-full bg-transparent text-sm text-on-surface outline-none placeholder:text-on-surface/30"
            />
          </label>
        </section>

        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/20 border-t-primary" />
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-outline/15 bg-surface-container-low px-6 py-16 text-center">
            <FileText className="mx-auto h-10 w-10 text-on-surface/20" />
            <p className="mt-4 text-sm font-semibold text-on-surface/65">
              {search ? 'No repository documents match your search.' : 'No documents have been added to the repository yet.'}
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-outline/10 bg-surface-container-low">
            <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_140px_160px_48px] gap-4 border-b border-outline/10 px-5 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-on-surface/35">
              <span>Document</span>
              <span>Counterparty</span>
              <span>Risk</span>
              <span>Updated</span>
              <span />
            </div>

            {filteredContracts.map((contract) => (
              <button
                key={contract.id}
                onClick={() => navigate(`/contract/${contract.id}`)}
                className="grid w-full grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_140px_160px_48px] gap-4 border-b border-outline/5 px-5 py-4 text-left transition-colors hover:bg-surface/50 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-on-surface">{contract.name || 'Untitled Contract'}</p>
                  <p className="mt-1 truncate text-[11px] text-on-surface/45">{contract.status || 'Unknown status'}</p>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm text-on-surface/70">{contract.counterparty || 'Not captured yet'}</p>
                </div>

                <div className="flex items-center gap-2">
                  <ShieldAlert className={`h-4 w-4 ${riskTone(contract.riskLevel)}`} />
                  <span className={`text-[11px] font-bold ${riskTone(contract.riskLevel)}`}>{contract.riskLevel || 'Low Risk'}</span>
                </div>

                <div className="flex items-center gap-2 text-[11px] text-on-surface/55">
                  <Calendar className="h-4 w-4" />
                  <span>
                    {contract.updatedAt?.toDate?.()
                      ? contract.updatedAt.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                      : 'Recent'}
                  </span>
                </div>

                <div className="flex items-center justify-end">
                  <ArrowRight className="h-4 w-4 text-on-surface/35" />
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
