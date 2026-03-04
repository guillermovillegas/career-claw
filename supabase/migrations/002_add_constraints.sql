-- CareerClaw Schema Constraints (Phase 2)
-- Adds UNIQUE on contacts.email (partial, where not null)
-- Adds CHECK on freelance_proposals.submitted_at

-- Unique email for contacts (only where email is not null)
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_email_unique
    ON contacts (email) WHERE email IS NOT NULL;

-- Ensure submitted_at is not in the future
ALTER TABLE freelance_proposals
    ADD CONSTRAINT chk_proposals_submitted_at_not_future
    CHECK (submitted_at IS NULL OR submitted_at <= NOW() + INTERVAL '1 hour');

-- Ensure submitted_at is set when status is beyond 'draft'
ALTER TABLE freelance_proposals
    ADD CONSTRAINT chk_proposals_submitted_at_required
    CHECK (status = 'draft' OR submitted_at IS NOT NULL);
