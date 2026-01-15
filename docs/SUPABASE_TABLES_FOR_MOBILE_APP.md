# Supabase Tables for Mobile Loan Officer App

This document outlines the relevant Supabase tables for building a mobile app that allows loan officers to manage their realtor network and related data.

---

## Core Tables for Realtor Management

### 1. `realtors` - Main Realtor Database

The primary table storing all realtor/agent information.

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
first_name text NOT NULL
last_name text NOT NULL
phone text
email text
brokerage text
active boolean DEFAULT true
campaign_eligible boolean DEFAULT true
email_opt_out boolean DEFAULT false
created_by_user_id uuid          -- Which user created this realtor
user_id uuid                      -- Links to auth.users if realtor has account
created_at timestamptz DEFAULT now()
updated_at timestamptz DEFAULT now()
```

### 2. `realtor_assignments` - LO ↔ Realtor Relationships

**This is the key table** - links loan officers to their assigned realtors. Each LO only sees realtors assigned to them.

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
realtor_id uuid NOT NULL REFERENCES realtors(id) ON DELETE CASCADE
lo_user_id uuid NOT NULL          -- auth.uid() of the loan officer
created_at timestamptz DEFAULT now()
UNIQUE (realtor_id, lo_user_id)   -- Prevents duplicate assignments
```

---

## Supporting Tables

### 3. `loan_officers` - LO Profiles

Stores loan officer profile information.

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
first_name text NOT NULL
last_name text NOT NULL
phone text
email text
user_id uuid                      -- Links to auth.users
active boolean DEFAULT true
created_at timestamptz DEFAULT now()
```

### 4. `leads` - Client/Lead Database

Tracks leads/clients with their assigned LO and referring realtor.

```sql
id uuid PRIMARY KEY
name text
email text
phone text
lo_id uuid REFERENCES loan_officers(id) ON DELETE SET NULL
realtor_id uuid REFERENCES realtors(id) ON DELETE SET NULL
source text
status text
notes text
created_at timestamptz DEFAULT now()
```

### 5. `email_campaigns` - Marketing Campaigns

Stores email campaigns sent to realtors.

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
created_by_user_id uuid NOT NULL
subject text NOT NULL
html text NOT NULL
audience text NOT NULL CHECK (audience IN ('ALL_REALTORS', 'MY_REALTORS'))
created_at timestamptz DEFAULT now()
```

### 6. `email_campaign_recipients` - Campaign Tracking

Tracks individual email sends and their status.

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
campaign_id uuid NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE
realtor_id uuid REFERENCES realtors(id)
email text NOT NULL
status text NOT NULL CHECK (status IN ('sent', 'failed'))
provider_id text                  -- Resend message ID
error text
sent_at timestamptz DEFAULT now()
```

### 7. `email_unsubscribes` - Opt-out Tracking

Tracks realtors who have unsubscribed from emails.

```sql
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
email text NOT NULL
realtor_id uuid REFERENCES realtors(id)
unsubscribed_at timestamptz DEFAULT now()
```

---

## Table Priority for Mobile App

| Priority | Table | Use Case |
|----------|-------|----------|
| **High** | `realtors` | View/manage agent contacts |
| **High** | `realtor_assignments` | Filter to show only YOUR agents |
| **High** | `leads` | View leads referred by each agent |
| **Medium** | `loan_officers` | LO profile info |
| **Medium** | `email_campaigns` | View sent campaigns |
| **Low** | `email_campaign_recipients` | Campaign analytics |
| **Low** | `email_unsubscribes` | Check opt-out status |

---

## Key Mobile App Features These Enable

### 1. My Agents List
Query `realtor_assignments` joined with `realtors` where `lo_user_id = currentUser.id`

```typescript
const { data: myAgents } = await supabase
  .from('realtor_assignments')
  .select(`
    realtor_id,
    realtors (
      id, first_name, last_name, email, phone, brokerage, active
    )
  `)
  .eq('lo_user_id', user.id);
```

### 2. Agent Details
Full realtor profile with contact info, brokerage

### 3. Leads by Agent
Query `leads` where `realtor_id = selectedAgent.id`

```typescript
const { data: agentLeads } = await supabase
  .from('leads')
  .select('*')
  .eq('realtor_id', selectedAgentId);
```

### 4. Add/Remove Agents
Insert/delete from `realtor_assignments`

```typescript
// Add agent to my list
await supabase
  .from('realtor_assignments')
  .insert({ realtor_id: agentId, lo_user_id: user.id });

// Remove agent from my list
await supabase
  .from('realtor_assignments')
  .delete()
  .eq('realtor_id', agentId)
  .eq('lo_user_id', user.id);
```

### 5. Campaign History
View emails sent to agents

### 6. Quick Contact
Phone/email directly from agent card

---

## Row Level Security (RLS) Notes

All tables have RLS enabled with policies that:

- **Admins**: Full access to all data
- **Loan Officers**: Can only see/modify their assigned realtors
- **Assignment-based access**: LOs access realtors through `realtor_assignments` table

Key RLS functions:
- `is_admin_email(email)` - Checks if user is an admin
- `is_loan_officer(user_id)` - Checks if user is an active LO

---

## Related Migration Files

- `docs/CREATE_TEAM_TABLES.sql` - Initial table creation
- `docs/migrations/001_realtor_assignments_and_campaigns.sql` - Assignments & campaigns
- `docs/migrations/002_email_unsubscribe.sql` - Unsubscribe functionality
