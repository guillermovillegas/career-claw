-- CareerClaw Database Schema
-- PostgreSQL (Supabase) - Job tracking, freelance proposals, clients, outreach
-- Extends the jobbai schema concept for PostgreSQL with freelance support

-- ============================================================================
-- Core Job Tracking Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT,
    salary_min INTEGER,
    salary_max INTEGER,
    job_type TEXT CHECK (job_type IN ('full-time', 'part-time', 'contract', 'freelance')),
    work_mode TEXT CHECK (work_mode IN ('remote', 'hybrid', 'on-site')),
    description TEXT,
    requirements TEXT,
    url TEXT,
    platform TEXT NOT NULL CHECK (platform IN ('linkedin', 'indeed', 'upwork', 'fiverr', 'direct', 'referral', 'other')),
    posting_date DATE,
    deadline DATE,
    skills_required JSONB DEFAULT '[]'::jsonb,
    experience_required INTEGER,
    match_score INTEGER CHECK (match_score BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
    platform TEXT NOT NULL CHECK (platform IN ('linkedin', 'indeed', 'upwork', 'fiverr', 'direct', 'referral', 'other')),
    status TEXT NOT NULL DEFAULT 'interested' CHECK (status IN (
        'interested', 'applied', 'phone_screen', 'interview',
        'final', 'offer', 'hired', 'rejected', 'withdrawn'
    )),
    cover_letter TEXT,
    proposal_text TEXT,
    resume_version TEXT,
    application_date DATE,
    last_contact_date DATE,
    next_followup_date DATE,
    priority INTEGER DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
    source TEXT,
    referral_contact TEXT,
    salary_expectation INTEGER,
    notes TEXT,
    match_score INTEGER CHECK (match_score BETWEEN 0 AND 100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    position TEXT,
    linkedin_url TEXT,
    relationship TEXT CHECK (relationship IN ('recruiter', 'hiring_manager', 'employee', 'referral', 'client', 'networking')),
    notes TEXT,
    last_contact_date DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS application_contacts (
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('recruiter', 'hiring_manager', 'interviewer', 'referral')),
    PRIMARY KEY (application_id, contact_id)
);

-- ============================================================================
-- Freelance Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS freelance_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
    platform TEXT NOT NULL CHECK (platform IN ('upwork', 'fiverr', 'direct')),
    project_title TEXT NOT NULL,
    project_url TEXT,
    client_name TEXT,
    client_country TEXT,
    budget_min NUMERIC,
    budget_max NUMERIC,
    budget_type TEXT CHECK (budget_type IN ('fixed', 'hourly')),
    proposal_text TEXT,
    bid_amount NUMERIC,
    estimated_duration TEXT,
    status TEXT DEFAULT 'submitted' CHECK (status IN (
        'draft', 'submitted', 'viewed', 'shortlisted',
        'interview', 'hired', 'rejected', 'withdrawn'
    )),
    submitted_at TIMESTAMPTZ,
    response_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    company TEXT,
    email TEXT,
    platform TEXT CHECK (platform IN ('upwork', 'fiverr', 'direct', 'referral')),
    platform_profile_url TEXT,
    relationship_started TIMESTAMPTZ,
    total_revenue NUMERIC DEFAULT 0,
    status TEXT DEFAULT 'active' CHECK (status IN ('lead', 'active', 'paused', 'completed', 'churned')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS client_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    budget NUMERIC,
    budget_type TEXT CHECK (budget_type IN ('fixed', 'hourly', 'retainer')),
    status TEXT DEFAULT 'active' CHECK (status IN ('proposal', 'active', 'paused', 'completed', 'cancelled')),
    start_date DATE,
    due_date DATE,
    completed_date DATE,
    hours_logged NUMERIC DEFAULT 0,
    amount_invoiced NUMERIC DEFAULT 0,
    amount_paid NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Outreach & Communication
-- ============================================================================

CREATE TABLE IF NOT EXISTS outreach_sequences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    sequence_type TEXT NOT NULL CHECK (sequence_type IN (
        'job_followup', 'cold_outreach', 'networking', 'client_followup'
    )),
    current_step INTEGER DEFAULT 0,
    max_steps INTEGER DEFAULT 3,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'replied', 'bounced')),
    next_send_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS communication_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('application', 'client', 'contact', 'proposal')),
    entity_id UUID NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'linkedin', 'upwork', 'fiverr', 'phone', 'video', 'in_person')),
    direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
    subject TEXT,
    content_summary TEXT,
    full_content TEXT,
    sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Calendar & Scheduling
-- ============================================================================

CREATE TABLE IF NOT EXISTS calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN ('interview', 'follow_up', 'deadline', 'client_call', 'networking')),
    title TEXT NOT NULL,
    description TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    location TEXT,
    meeting_url TEXT,
    cal_com_event_id TEXT,
    status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Platform Profiles
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform TEXT NOT NULL UNIQUE CHECK (platform IN ('upwork', 'fiverr', 'linkedin', 'toptal', 'guru')),
    profile_url TEXT,
    headline TEXT,
    bio TEXT,
    hourly_rate NUMERIC,
    skills TEXT[],
    last_updated TIMESTAMPTZ,
    profile_score INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Interview Preparation
-- ============================================================================

CREATE TABLE IF NOT EXISTS interview_prep (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
    company_research TEXT,
    likely_questions JSONB DEFAULT '[]'::jsonb,
    prepared_answers JSONB DEFAULT '[]'::jsonb,
    technical_prep TEXT,
    questions_to_ask JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Automation & Tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS automation_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type TEXT NOT NULL CHECK (action_type IN (
        'job_search', 'application_submit', 'proposal_submit',
        'email_send', 'follow_up', 'profile_update', 'calendar_sync'
    )),
    platform TEXT,
    success BOOLEAN DEFAULT TRUE,
    details JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,
    execution_time_ms INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_jobs_platform ON jobs(platform);
CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_platform ON applications(platform);
CREATE INDEX IF NOT EXISTS idx_applications_next_followup ON applications(next_followup_date);
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_freelance_proposals_platform ON freelance_proposals(platform);
CREATE INDEX IF NOT EXISTS idx_freelance_proposals_status ON freelance_proposals(status);

CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);

CREATE INDEX IF NOT EXISTS idx_client_projects_client_id ON client_projects(client_id);
CREATE INDEX IF NOT EXISTS idx_client_projects_status ON client_projects(status);

CREATE INDEX IF NOT EXISTS idx_outreach_sequences_status ON outreach_sequences(status);
CREATE INDEX IF NOT EXISTS idx_outreach_sequences_next_send ON outreach_sequences(next_send_at);

CREATE INDEX IF NOT EXISTS idx_communication_log_entity ON communication_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_communication_log_created_at ON communication_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_calendar_events_start_time ON calendar_events(start_time);
CREATE INDEX IF NOT EXISTS idx_calendar_events_application_id ON calendar_events(application_id);

CREATE INDEX IF NOT EXISTS idx_automation_logs_action_type ON automation_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_automation_logs_created_at ON automation_logs(created_at DESC);

-- ============================================================================
-- Updated-at triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_jobs_updated_at BEFORE UPDATE ON jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_applications_updated_at BEFORE UPDATE ON applications
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_contacts_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_freelance_proposals_updated_at BEFORE UPDATE ON freelance_proposals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_client_projects_updated_at BEFORE UPDATE ON client_projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_outreach_sequences_updated_at BEFORE UPDATE ON outreach_sequences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_calendar_events_updated_at BEFORE UPDATE ON calendar_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_platform_profiles_updated_at BEFORE UPDATE ON platform_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_interview_prep_updated_at BEFORE UPDATE ON interview_prep
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
