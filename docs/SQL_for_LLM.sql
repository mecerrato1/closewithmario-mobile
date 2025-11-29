-- ============================================================================
-- COMPREHENSIVE LEAD MANAGEMENT ANALYTICS FOR AI ANALYSIS
-- Run this query to get complete system insights for feature recommendations
-- ============================================================================

WITH 

-- 1. OVERALL LEAD STATISTICS BY SOURCE
lead_overview AS (
  SELECT 
    'LEAD_OVERVIEW' as section,
    'website_leads' as col2,
    COUNT(*) as col3,
    COUNT(CASE WHEN status = 'new' THEN 1 END) as col4,
    COUNT(CASE WHEN status = 'contacted' THEN 1 END) as col5,
    COUNT(CASE WHEN status = 'gathering_docs' THEN 1 END) as col6,
    COUNT(CASE WHEN status = 'qualified' THEN 1 END) as col7,
    COUNT(CASE WHEN status = 'nurturing' THEN 1 END) as col8,
    COUNT(CASE WHEN status = 'closed' THEN 1 END) as col9,
    COUNT(CASE WHEN status = 'unqualified' THEN 1 END) as col10,
    COUNT(CASE WHEN status = 'no_response' THEN 1 END) as col11,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as col12,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as col13,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as col14,
    ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/3600), 2) as col15,
    COUNT(DISTINCT lo_id) as col16,
    COUNT(CASE WHEN lo_id IS NULL THEN 1 END) as col17,
    ROUND(COUNT(CASE WHEN status IN ('qualified', 'closed') THEN 1 END)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as col18
  FROM leads
  
  UNION ALL
  
  SELECT 
    'LEAD_OVERVIEW' as section,
    'meta_ads' as col2,
    COUNT(*) as col3,
    COUNT(CASE WHEN status = 'new' THEN 1 END) as col4,
    COUNT(CASE WHEN status = 'contacted' THEN 1 END) as col5,
    COUNT(CASE WHEN status = 'gathering_docs' THEN 1 END) as col6,
    COUNT(CASE WHEN status = 'qualified' THEN 1 END) as col7,
    COUNT(CASE WHEN status = 'nurturing' THEN 1 END) as col8,
    COUNT(CASE WHEN status = 'closed' THEN 1 END) as col9,
    COUNT(CASE WHEN status = 'unqualified' THEN 1 END) as col10,
    COUNT(CASE WHEN status = 'no_response' THEN 1 END) as col11,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as col12,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as col13,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as col14,
    ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/3600), 2) as col15,
    COUNT(DISTINCT lo_id) as col16,
    COUNT(CASE WHEN lo_id IS NULL THEN 1 END) as col17,
    ROUND(COUNT(CASE WHEN status IN ('qualified', 'closed') THEN 1 END)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as col18
  FROM meta_ads
),

-- 2. ACTIVITY ENGAGEMENT METRICS
activity_metrics AS (
  SELECT 
    'ACTIVITY_METRICS' as section,
    'website_leads' as source,
    COUNT(*) as col3,
    COUNT(CASE WHEN activity_type = 'call' THEN 1 END) as col4,
    COUNT(CASE WHEN activity_type = 'text' THEN 1 END) as col5,
    COUNT(CASE WHEN activity_type = 'email' THEN 1 END) as col6,
    COUNT(CASE WHEN activity_type = 'note' THEN 1 END) as col7,
    COUNT(DISTINCT lead_id) as col8,
    COUNT(DISTINCT created_by) as col9,
    ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/86400), 2) as col10,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as col11,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as col12,
    0 as col13,
    0 as col14,
    0 as col15,
    0 as col16,
    0 as col17,
    0 as col18
  FROM lead_activities
  
  UNION ALL
  
  SELECT 
    'ACTIVITY_METRICS' as section,
    'meta_ads' as source,
    COUNT(*) as col3,
    COUNT(CASE WHEN activity_type = 'call' THEN 1 END) as col4,
    COUNT(CASE WHEN activity_type = 'text' THEN 1 END) as col5,
    COUNT(CASE WHEN activity_type = 'email' THEN 1 END) as col6,
    COUNT(CASE WHEN activity_type = 'note' THEN 1 END) as col7,
    COUNT(DISTINCT meta_ad_id) as col8,
    COUNT(DISTINCT created_by) as col9,
    ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/86400), 2) as col10,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as col11,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '7 days' THEN 1 END) as col12,
    0 as col13,
    0 as col14,
    0 as col15,
    0 as col16,
    0 as col17,
    0 as col18
  FROM meta_ad_activities
),

-- 3. STALE LEADS ANALYSIS (No activity in 3+ days)
stale_leads AS (
  SELECT 
    'STALE_LEADS' as section,
    'combined' as col2,
    COUNT(*) as col3,
    COUNT(CASE WHEN status = 'new' THEN 1 END) as col4,
    COUNT(CASE WHEN status = 'contacted' THEN 1 END) as col5,
    COUNT(CASE WHEN status = 'gathering_docs' THEN 1 END) as col6,
    COUNT(CASE WHEN status = 'qualified' THEN 1 END) as col7,
    COUNT(CASE WHEN status = 'nurturing' THEN 1 END) as col8,
    ROUND(AVG(days_since_activity), 2) as col9,
    MAX(days_since_activity) as col10,
    0 as col11,
    0 as col12,
    0 as col13,
    0 as col14,
    0 as col15,
    0 as col16,
    0 as col17,
    0 as col18
  FROM (
    SELECT 
      l.status,
      COALESCE(EXTRACT(EPOCH FROM (NOW() - MAX(la.created_at)))/86400, 
               EXTRACT(EPOCH FROM (NOW() - l.created_at))/86400) as days_since_activity
    FROM leads l
    LEFT JOIN lead_activities la ON la.lead_id = l.id
    WHERE l.status NOT IN ('closed', 'unqualified')
    GROUP BY l.id, l.status, l.created_at
    HAVING COALESCE(MAX(la.created_at), l.created_at) < NOW() - INTERVAL '3 days'
    
    UNION ALL
    
    SELECT 
      m.status,
      COALESCE(EXTRACT(EPOCH FROM (NOW() - MAX(ma.created_at)))/86400,
               EXTRACT(EPOCH FROM (NOW() - m.created_at))/86400) as days_since_activity
    FROM meta_ads m
    LEFT JOIN meta_ad_activities ma ON ma.meta_ad_id = m.id
    WHERE m.status NOT IN ('closed', 'unqualified')
    GROUP BY m.id, m.status, m.created_at
    HAVING COALESCE(MAX(ma.created_at), m.created_at) < NOW() - INTERVAL '3 days'
  ) stale
),

-- 4. TEAM PERFORMANCE & WORKLOAD
team_performance AS (
  SELECT 
    'TEAM_PERFORMANCE' as section,
    lo.first_name || ' ' || lo.last_name as col2,
    CAST(lo.active AS INT) as col3,
    CAST(lo.lead_eligible AS INT) as col4,
    COUNT(DISTINCT l.id) as col5,
    COUNT(DISTINCT m.id) as col6,
    COUNT(DISTINCT l.id) + COUNT(DISTINCT m.id) as col7,
    COUNT(DISTINCT CASE WHEN l.status NOT IN ('closed', 'unqualified') THEN l.id END) as col8,
    COUNT(DISTINCT CASE WHEN m.status NOT IN ('closed', 'unqualified') THEN m.id END) as col9,
    COUNT(DISTINCT CASE WHEN l.status = 'new' THEN l.id END) + 
      COUNT(DISTINCT CASE WHEN m.status = 'new' THEN m.id END) as col10,
    COUNT(DISTINCT CASE WHEN l.status = 'qualified' THEN l.id END) + 
      COUNT(DISTINCT CASE WHEN m.status = 'qualified' THEN m.id END) as col11,
    COUNT(DISTINCT CASE WHEN l.status = 'closed' THEN l.id END) + 
      COUNT(DISTINCT CASE WHEN m.status = 'closed' THEN m.id END) as col12,
    ROUND((COUNT(DISTINCT CASE WHEN l.status = 'closed' THEN l.id END) + 
           COUNT(DISTINCT CASE WHEN m.status = 'closed' THEN m.id END))::numeric / 
          NULLIF(COUNT(DISTINCT l.id) + COUNT(DISTINCT m.id), 0)::numeric * 100, 2) as col13,
    0 as col14,
    0 as col15,
    0 as col16,
    0 as col17,
    0 as col18
  FROM loan_officers lo
  LEFT JOIN leads l ON l.lo_id = lo.id
  LEFT JOIN meta_ads m ON m.lo_id = lo.id
  GROUP BY lo.id, lo.first_name, lo.last_name, lo.active, lo.lead_eligible
),

-- 5. PLATFORM & CAMPAIGN PERFORMANCE (Meta Ads)
platform_performance AS (
  SELECT 
    'PLATFORM_PERFORMANCE' as section,
    COALESCE(platform, 'unknown') as col2,
    COUNT(*) as col3,
    COUNT(CASE WHEN status = 'qualified' THEN 1 END) as col4,
    COUNT(CASE WHEN status = 'closed' THEN 1 END) as col5,
    COUNT(CASE WHEN status = 'unqualified' THEN 1 END) as col6,
    ROUND(COUNT(CASE WHEN status = 'qualified' THEN 1 END)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as col7,
    ROUND(COUNT(CASE WHEN status = 'closed' THEN 1 END)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as col8,
    0 as col9,
    0 as col10,
    0 as col11,
    0 as col12,
    0 as col13,
    0 as col14,
    0 as col15,
    0 as col16,
    0 as col17,
    0 as col18
  FROM meta_ads
  GROUP BY platform
),

campaign_performance AS (
  SELECT 
    'CAMPAIGN_PERFORMANCE' as section,
    COALESCE(campaign_name, 'unknown') as col2,
    COUNT(*) as col3,
    COUNT(CASE WHEN status = 'qualified' THEN 1 END) as col4,
    COUNT(CASE WHEN status = 'closed' THEN 1 END) as col5,
    COUNT(CASE WHEN status = 'unqualified' THEN 1 END) as col6,
    COUNT(CASE WHEN created_at > NOW() - INTERVAL '30 days' THEN 1 END) as col7,
    ROUND(COUNT(CASE WHEN status = 'qualified' THEN 1 END)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as col8,
    ROUND(COUNT(CASE WHEN status = 'closed' THEN 1 END)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as col9,
    0 as col10,
    0 as col11,
    0 as col12,
    0 as col13,
    0 as col14,
    0 as col15,
    0 as col16,
    0 as col17,
    0 as col18
  FROM meta_ads
  GROUP BY campaign_name
  ORDER BY col3 DESC
  LIMIT 15
),

-- 6. LANGUAGE PREFERENCE ANALYSIS
language_analysis AS (
  SELECT 
    'LANGUAGE_ANALYSIS' as section,
    COALESCE(preferred_language, 'english') as col2,
    COUNT(*) as col3,
    COUNT(CASE WHEN status = 'qualified' THEN 1 END) as col4,
    COUNT(CASE WHEN status = 'closed' THEN 1 END) as col5,
    ROUND(COUNT(CASE WHEN status = 'qualified' THEN 1 END)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as col6,
    ROUND(AVG(EXTRACT(EPOCH FROM (NOW() - created_at))/86400), 2) as col7,
    0 as col8,
    0 as col9,
    0 as col10,
    0 as col11,
    0 as col12,
    0 as col13,
    0 as col14,
    0 as col15,
    0 as col16,
    0 as col17,
    0 as col18
  FROM meta_ads
  GROUP BY preferred_language
),

-- 7. CALLBACK STATISTICS
callback_stats AS (
  SELECT 
    'CALLBACK_STATS' as section,
    'combined' as source,
    COUNT(*) as col3,
    COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END) as col4,
    COUNT(CASE WHEN completed_at IS NULL AND scheduled_for < NOW() THEN 1 END) as col5,
    COUNT(CASE WHEN completed_at IS NULL AND scheduled_for >= NOW() THEN 1 END) as col6,
    COUNT(CASE WHEN scheduled_for > NOW() AND scheduled_for < NOW() + INTERVAL '24 hours' THEN 1 END) as col7,
    ROUND(COUNT(CASE WHEN completed_at IS NOT NULL THEN 1 END)::numeric / NULLIF(COUNT(*), 0)::numeric * 100, 2) as col8,
    0 as col9,
    0 as col10,
    0 as col11,
    0 as col12,
    0 as col13,
    0 as col14,
    0 as col15,
    0 as col16,
    0 as col17,
    0 as col18
  FROM lead_callbacks
),

-- 8. RESPONSE TIME ANALYSIS (for new leads)
response_time AS (
  SELECT 
    'RESPONSE_TIME' as section,
    'combined' as source,
    COUNT(*) as col3,
    COUNT(CASE WHEN age_hours < 1 THEN 1 END) as col4,
    COUNT(CASE WHEN age_hours >= 1 AND age_hours < 24 THEN 1 END) as col5,
    COUNT(CASE WHEN age_hours >= 24 AND age_hours < 48 THEN 1 END) as col6,
    COUNT(CASE WHEN age_hours >= 48 THEN 1 END) as col7,
    ROUND(AVG(age_hours), 2) as col8,
    MAX(age_hours) as col9,
    0 as col10,
    0 as col11,
    0 as col12,
    0 as col13,
    0 as col14,
    0 as col15,
    0 as col16,
    0 as col17,
    0 as col18
  FROM (
    SELECT EXTRACT(EPOCH FROM (NOW() - created_at))/3600 as age_hours
    FROM leads WHERE status = 'new'
    UNION ALL
    SELECT EXTRACT(EPOCH FROM (NOW() - created_at))/3600 as age_hours
    FROM meta_ads WHERE status = 'new'
  ) new_leads
),

-- 9. TEAM SUMMARY
team_summary AS (
  SELECT 
    'TEAM_SUMMARY' as section,
    'loan_officers' as col2,
    COUNT(*) as col3,
    COUNT(CASE WHEN active = true THEN 1 END) as col4,
    COUNT(CASE WHEN lead_eligible = true THEN 1 END) as col5,
    0 as col6,
    0 as col7,
    0 as col8,
    0 as col9,
    0 as col10,
    0 as col11,
    0 as col12,
    0 as col13,
    0 as col14,
    0 as col15,
    0 as col16,
    0 as col17,
    0 as col18
  FROM loan_officers
  
  UNION ALL
  
  SELECT 
    'TEAM_SUMMARY' as section,
    'realtors' as col2,
    COUNT(*) as col3,
    COUNT(CASE WHEN active = true THEN 1 END) as col4,
    0 as col5,
    0 as col6,
    0 as col7,
    0 as col8,
    0 as col9,
    0 as col10,
    0 as col11,
    0 as col12,
    0 as col13,
    0 as col14,
    0 as col15,
    0 as col16,
    0 as col17,
    0 as col18
  FROM realtors
)

-- COMBINE ALL RESULTS INTO SINGLE OUTPUT
SELECT * FROM lead_overview
UNION ALL SELECT * FROM activity_metrics
UNION ALL SELECT * FROM stale_leads
UNION ALL SELECT * FROM team_performance
UNION ALL SELECT * FROM platform_performance
UNION ALL SELECT * FROM campaign_performance
UNION ALL SELECT * FROM language_analysis
UNION ALL SELECT * FROM callback_stats
UNION ALL SELECT * FROM response_time
UNION ALL SELECT * FROM team_summary
ORDER BY section, col2;