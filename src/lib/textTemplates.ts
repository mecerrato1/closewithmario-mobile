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

I'm reaching out about the ad you clicked on {platform}. Tried calling you earlier - are you available for a quick chat to see how we can help you become a homeowner? 🏡`,
  },
  {
    id: 'document_followup',
    name: 'Document Follow-up',
    template: `Hi {fname} 👋

This is {LO fullname} with loanDepot.

Just following up on the documents we need to get you preapproved. Let me know if you have any questions! 📄`,
  },
  {
    id: 'preapproval_checkin',
    name: 'Pre-approval Check-in',
    template: `Hi {fname} 👋

This is {LO fullname} with loanDepot.

Just checking in to see if you're ready to move forward with getting preapproved for your home mortgage. I'm here to help! 🏠✅`,
  },
  {
    id: 'stop_paying_rent',
    name: 'Stop Paying Rent',
    template: `Hi {fname} 👋

This is {LO fullname} with loanDepot.

I don't mean to bug you, but I really think I can help you get into your own home and stop paying rent. Let's chat when you have a moment! 🏡💰`,
  },
];

export type TemplateVariables = {
  fname: string;
  loFullname: string;
  platform: string;
};

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
  
  // Replace {platform} with the friendly platform name
  result = result.replace(/{platform}/g, formatPlatformName(variables.platform));
  
  return result;
}
