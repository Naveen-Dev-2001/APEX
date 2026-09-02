import API from '../../api/api';

export const reconciliationApi = {
  // Upload bank statement (multipart — includes optional account_number field)
  uploadStatement: (formData) =>
    API.post('/reconciliation/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  // Get all statements
  getStatements: () => API.get('/reconciliation/statements'),
  
  // Delete a statement
  deleteStatement: (id) => API.delete(`/reconciliation/statements/${id}`),

  // Get transactions for a specific statement
  getStatementTransactions: (statementId) =>
    API.get(`/reconciliation/statements/${statementId}/transactions`),

  // Fetch Sage GL transactions (optionally scoped to account and financial entity)
  fetchSageTransactions: (accountNumber = null, financialEntity = null) => {
    const params = {};
    if (accountNumber) params.account_number = accountNumber;
    if (financialEntity) params.financial_entity = financialEntity;
    return API.post('/reconciliation/fetch-sage-transactions', null, { params });
  },

  // Get cached Sage GL transactions (optionally filtered by account)
  getSageTransactions: (accountNumber = null) => {
    const params = accountNumber ? { account_number: accountNumber } : {};
    return API.get('/reconciliation/sage-transactions', { params });
  },

  // Run matching (optionally scoped to account or statement)
  runMatching: (accountNumber = null, statementId = null) => {
    const params = {};
    if (accountNumber) params.account_number = accountNumber;
    if (statementId) params.statement_id = statementId;
    return API.post('/reconciliation/match', null, { params });
  },

  // Manually mark selected bank/sage pairs as matched
  markMatchedPairs: (bankTransactionIds = [], sageTransactionIds = []) =>
    API.post('/reconciliation/mark-matched', {
      bank_transaction_ids: bankTransactionIds,
      sage_transaction_ids: sageTransactionIds,
    }),

  // Get results grouped by GL account
  getResults: (accountNumber = null) => {
    const params = accountNumber ? { account_number: accountNumber } : {};
    return API.get('/reconciliation/results', { params });
  },

  // Upload bank accounts master file
  uploadBankAccounts: (formData) =>
    API.post('/reconciliation/bank-accounts/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  // List bank accounts
  getBankAccounts: () => API.get('/reconciliation/bank-accounts'),

  // Delete a bank account row
  deleteBankAccount: (id) => API.delete(`/reconciliation/bank-accounts/${id}`),

  // Upload Sage GL transactions from Excel/CSV file
  uploadSageTransactions: (formData) =>
    API.post('/reconciliation/upload-sage-transactions', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),

  // Sync bank accounts from cached Sage transactions
  syncBankAccounts: () => API.post('/reconciliation/bank-accounts/sync'),
};
