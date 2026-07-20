/* ─────────────────────────────────────────────────────────────
   shared.jsx — Shared helpers & display components
   Used by all Bank Reconciliation tab files.
───────────────────────────────────────────────────────────── */

/* ── Formatters ── */
export const fmt = (v) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v ?? 0);

export const normalizeSearchValue = (value) => String(value ?? '').toLowerCase();

export const formatStatementMonthLabel = (value) => {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}$/.test(text)) return text;
  const [year, month] = text.split('-').map(Number);
  const dt = new Date(year, month - 1, 1);
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
};

export const formatBankAccountOptionLabel = (bankName, accountNumber) => {
  return String(bankName ?? '').trim() || 'Unknown Bank';
};

export const getTopLevelEntityName = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';
  const splitByDash = text.split(' - ');
  if (splitByDash.length >= 2) {
    return splitByDash.slice(1).join(' - ').trim();
  }
  return text;
};

/* ── Display Components ── */

export const Badge = ({ type }) => {
  const map = { debit: 'bg-red-100 text-red-600', credit: 'bg-green-100 text-green-600' };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${map[type] ?? 'bg-gray-100 text-gray-500'}`}>
      {type}
    </span>
  );
};

export const StatusPill = ({ matched }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${matched ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
    <span className={`w-1.5 h-1.5 rounded-full ${matched ? 'bg-green-500' : 'bg-amber-500'}`} />
    {matched ? 'Matched' : 'Unmatched'}
  </span>
);

export const EmptyState = ({ icon, title, subtitle }) => (
  <div className="flex flex-col items-center justify-center py-20 text-center">
    <div className="text-5xl mb-4">{icon}</div>
    <h3 className="text-gray-700 font-semibold text-lg mb-1">{title}</h3>
    <p className="text-gray-400 text-sm max-w-xs">{subtitle}</p>
  </div>
);

export const SummaryCard = ({ label, value, color }) => (
  <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex flex-col gap-1">
    <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">{label}</span>
    <span className={`text-xl font-bold ${color ?? 'text-gray-800'}`}>{value}</span>
  </div>
);

export const AccountBanner = ({ accountNumber, extra }) => {
  if (!accountNumber) return null;
  return (
    <div className="flex items-center gap-3 bg-[#1e9bd8]/8 border border-[#1e9bd8]/20 rounded-xl px-5 py-3 mb-5">
      <div className="w-8 h-8 rounded-lg bg-[#1e9bd8] flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth={1.8} />
          <line x1="2" y1="10" x2="22" y2="10" strokeWidth={1.8} />
        </svg>
      </div>
      <div>
        <span className="text-xs text-[#1e9bd8] font-medium uppercase tracking-wide">GL Account</span>
        <p className="font-bold text-gray-800 text-base leading-tight">{accountNumber}</p>
      </div>
      {extra && <div className="ml-auto text-sm text-gray-400">{extra}</div>}
    </div>
  );
};
