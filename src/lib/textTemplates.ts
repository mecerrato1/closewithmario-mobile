export type TextTemplate = {
  id: string;
  name: string;
  template: string;
};

export const TEXT_TEMPLATES: TextTemplate[] = [
  {
    id: 'initial_contact',
    name: 'Initial Contact',
    template: `Hi {fname} 👋

This is {LO fullname} with loanDepot (2nd largest mortgage lender in the US).

I'm reaching out about the ad you clicked on {platform}. Tried calling you earlier - are you available for a quick chat to see how we can help you become a homeowner? 🏡

My mobile is {LO phone} ☎️
My email is {LO email} 📧`,
  },
  {
    id: 'document_followup',
    name: 'Document Follow-up',
    template: `Hi {fname} 👋

This is {LO fullname} with loanDepot.

Just following up on the documents we need to get you preapproved. Let me know if you have any questions! 📄

You can reach me at:
☎️ {LO phone}
📧 {LO email}`,
  },
  {
    id: 'preapproval_checkin',
    name: 'Pre-approval Check-in',
    template: `Hi {fname} 👋

This is {LO fullname} with loanDepot.

Just checking in to see if you're ready to move forward with getting preapproved for your home mortgage. I'm here to help! 🏠✅

Feel free to call or text me:
☎️ {LO phone}
📧 {LO email}`,
  },
  {
    id: 'stop_paying_rent',
    name: 'Stop Paying Rent',
    template: `Hi {fname} 👋

This is {LO fullname} with loanDepot.

I don't mean to bug you, but I really think I can help you get into your own home and stop paying rent. Let's chat when you have a moment! 🏡💰

Reach me at:
☎️ {LO phone}
📧 {LO email}`,
  },
  {
    id: 'not_ready_general',
    name: 'Not Ready - General',
    template: `Hi {fname} 👋

This is {LO fullname}, good speaking to you.

I understand that you're not ready right now, but feel free to contact me when you are.

My mobile is {LO phone} ☎️
My email is {LO email} 📧

Good luck! 🍀`,
  },
  {
    id: 'not_ready_credit',
    name: 'Not Ready - Working on Credit',
    template: `Hi {fname} 👋

This is {LO fullname}, good speaking to you.

I understand that you're going to be working on your credit. Feel free to contact me when you're ready.

My mobile is {LO phone} ☎️
My email is {LO email} 📧

Good luck! 🍀`,
  },
];

export type TemplateVariables = {
  fname: string;
  loFullname: string;
  loFname: string;
  loPhone: string;
  loEmail: string;
  platform: string;
};

/**
 * Formats a phone number to (XXX) XXX-XXXX format
 * @param phone - The phone number (e.g., '3052192788')
 * @returns Formatted phone number
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return phone;
  
  // Remove all non-digit characters
  const cleaned = phone.replace(/\D/g, '');
  
  // Format as (XXX) XXX-XXXX for 10-digit numbers
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  
  // Return original if not 10 digits
  return phone;
}

/**
 * Converts platform codes to friendly names
 * @param platform - The platform code (e.g., 'FB', 'IG')
 * @returns Friendly platform name
 */
export function formatPlatformName(platform: string): string {
  if (!platform) return 'our website';
  
  const upperPlatform = platform.toUpperCase();
  const platformMap: Record<string, string> = {
    'FB': 'Facebook',
    'IG': 'Instagram',
    'FACEBOOK': 'Facebook',
    'INSTAGRAM': 'Instagram',
  };
  
  return platformMap[upperPlatform] || platform;
}

/**
 * Replaces template variables with actual values
 * @param template - The template string with {variable} placeholders
 * @param variables - Object containing the variable values
 * @returns The template with variables replaced
 */
export function fillTemplate(
  template: string,
  variables: TemplateVariables
): string {
  let result = template;
  
  // Replace {fname} with first name
  result = result.replace(/{fname}/g, variables.fname || '[First Name]');
  
  // Replace {LO fullname} with loan officer's full name
  result = result.replace(/{LO fullname}/g, variables.loFullname || '[Loan Officer]');
  
  // Replace {LO fname} with loan officer's first name
  result = result.replace(/{LO fname}/g, variables.loFname || '[LO First Name]');
  
  // Replace {LO phone} with loan officer's formatted phone
  result = result.replace(/{LO phone}/g, formatPhoneNumber(variables.loPhone) || '[LO Phone]');
  
  // Replace {LO email} with loan officer's email
  result = result.replace(/{LO email}/g, variables.loEmail || '[LO Email]');
  
  // Replace {platform} with the friendly platform name
  result = result.replace(/{platform}/g, formatPlatformName(variables.platform));
  
  return result;
}
