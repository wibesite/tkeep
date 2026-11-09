-- Existing estimates stay in USD; new forms explicitly submit BYN.
ALTER TABLE leads ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'
  CHECK (currency IN ('USD', 'BYN'));
