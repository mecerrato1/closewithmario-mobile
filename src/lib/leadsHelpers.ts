// Lead helper functions and constants extracted from App.tsx
import type { AttentionBadge } from './types/leads';

// Status values must match database check constraint exactly
export const STATUSES = [
  'new',
  'contacted',
  'gathering_docs',
  'qualified',
  'nurturing',
  'closed',
  'unqualified',
  'no_response',
];

// Map status to display names matching website
export const STATUS_DISPLAY_MAP: Record<string, string> = {
  'new': 'New',
  'contacted': 'Contacted',
  'gathering_docs': 'Docs Requested',
  'qualified': 'Qualified',
  'nurturing': 'Nurturing',
  'closed': 'Closed',
  'unqualified': 'Unqualified',
  'no_response': 'No Response',
};

// Map status to colors for visual distinction
export const STATUS_COLOR_MAP: Record<string, { bg: string; text: string; border: string }> = {
  'new': { bg: '#E3F2FD', text: '#1976D2', border: '#90CAF9' },
  'contacted': { bg: '#FFF3E0', text: '#F57C00', border: '#FFB74D' },
  'gathering_docs': { bg: '#F3E5F5', text: '#7B1FA2', border: '#CE93D8' },
  'qualified': { bg: '#D1FAE5', text: '#059669', border: '#10B981' },
  'nurturing': { bg: '#FFF9C4', text: '#F9A825', border: '#FFF59D' },
  'closed': { bg: '#D1FAE5', text: '#047857', border: '#10B981' },
  'unqualified': { bg: '#FFEBEE', text: '#C62828', border: '#EF5350' },
  'no_response': { bg: '#F5F5F5', text: '#616161', border: '#BDBDBD' },
};

// Attention badge logic (matches web implementation)
export function getLeadAlert(lead: { status: string | null; created_at: string; last_contact_date?: string | null }): AttentionBadge {
  const status = lead.status || 'new';
  const createdAt = new Date(lead.created_at);
  const now = new Date();
  const hoursSinceCreated = (now.getTime() - createdAt.getTime()) / (1000 * 60 * 60);
  
  // New leads (>24h old, not contacted)
  if (status === 'new' && hoursSinceCreated > 24) {
    return { type: 'new', label: 'New >24h', color: '#EF4444' }; // Red
  }
  
  // No activity for 2+ days (contacted/qualified/nurturing)
  if (['contacted', 'qualified', 'nurturing'].includes(status)) {
    const lastContact = lead.last_contact_date ? new Date(lead.last_contact_date) : createdAt;
    const daysSinceContact = (now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24);
    
    if (daysSinceContact >= 2) {
      return { type: 'no_activity', label: 'No Activity 2+ days', color: '#F59E0B' }; // Orange
    }
  }
  
  // Stale leads (>3 days since last contact, gathering_docs/no_response)
  if (['gathering_docs', 'no_response'].includes(status)) {
    const lastContact = lead.last_contact_date ? new Date(lead.last_contact_date) : createdAt;
    const daysSinceContact = (now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceContact > 3) {
      return { type: 'stale', label: 'Stale >3 days', color: '#F59E0B' }; // Orange
    }
  }
  
  return null;
}

// Helper to format status for display using the map
export const formatStatus = (status: string): string => {
  return STATUS_DISPLAY_MAP[status] || status;
};

// Helper to get time ago
export const getTimeAgo = (date: Date): string => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
