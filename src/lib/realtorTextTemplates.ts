// Text templates for realtor communication
export type RealtorTextTemplate = {
  id: string;
  name: string;
  nameEs: string;
  subject: string;
  subjectEs: string;
  template: string;
  templateEs: string;
};

export const REALTOR_TEXT_TEMPLATES: RealtorTextTemplate[] = [
  {
    id: 'new_brokerage_welcome',
    name: 'New Brokerage Welcome',
    nameEs: 'Bienvenida a Nueva Agencia',
    subject: 'Congrats on joining your new brokerage!',
    subjectEs: '¡Felicidades por unirse a su nueva agencia!',
    template: `Hi {realtorFname} 👋

Congrats on joining {brokerage}!

My name is {LO fullname} and we are the preferred lender.

Would love to have a quick chat to discuss how we can partner together.

☎️ {LO phone}
📧 {LO email}`,
    templateEs: `Hola {realtorFname} 👋

¡Felicidades por unirse a {brokerage}!

Mi nombre es {LO fullname} y somos el prestamista preferido.

Me encantaría tener una charla rápida para discutir cómo podemos asociarnos.

☎️ {LO phone}
📧 {LO email}`,
  },
  {
    id: 'intro_partnership',
    name: 'Introduction / Partnership',
    nameEs: 'Introducción / Asociación',
    subject: 'Partnership Opportunity - Mortgage Lending',
    subjectEs: 'Oportunidad de Asociación - Préstamos Hipotecarios',
    template: `Hi {realtorFname} 👋

This is {LO fullname} with loanDepot (2nd largest mortgage lender in the US).

I'd love to connect and discuss how we can work together to help your clients achieve their homeownership goals. I offer fast preapprovals and excellent communication throughout the loan process.

Let me know if you'd like to chat!

☎️ {LO phone}
📧 {LO email}`,
    templateEs: `Hola {realtorFname} 👋

Soy {LO fullname} de loanDepot (el segundo prestamista hipotecario más grande de EE. UU.).

Me encantaría conectar y discutir cómo podemos trabajar juntos para ayudar a sus clientes a lograr sus metas de ser propietarios. Ofrezco preaprobaciones rápidas y excelente comunicación durante todo el proceso de préstamo.

¡Avíseme si le gustaría conversar!

☎️ {LO phone}
📧 {LO email}`,
  },
  {
    id: 'follow_up',
    name: 'Follow Up',
    nameEs: 'Seguimiento',
    subject: 'Following up on our conversation',
    subjectEs: 'Seguimiento de nuestra conversación',
    template: `Hi {realtorFname} 👋

This is {LO fullname} with loanDepot.

Just following up on our previous conversation. I wanted to see if you have any clients looking to buy or refinance that I could help with.

I'm here whenever you need me!

☎️ {LO phone}
📧 {LO email}`,
    templateEs: `Hola {realtorFname} 👋

Soy {LO fullname} de loanDepot.

Solo hago seguimiento de nuestra conversación anterior. Quería ver si tiene clientes que buscan comprar o refinanciar con los que pueda ayudar.

¡Estoy aquí cuando me necesite!

☎️ {LO phone}
📧 {LO email}`,
  },
  {
    id: 'client_update',
    name: 'Client Update',
    nameEs: 'Actualización de Cliente',
    subject: 'Update on your client',
    subjectEs: 'Actualización sobre su cliente',
    template: `Hi {realtorFname} 👋

This is {LO fullname} with loanDepot.

I wanted to give you a quick update on your client's loan progress. Everything is moving along smoothly!

Feel free to reach out if you have any questions.

☎️ {LO phone}
📧 {LO email}`,
    templateEs: `Hola {realtorFname} 👋

Soy {LO fullname} de loanDepot.

Quería darle una actualización rápida sobre el progreso del préstamo de su cliente. ¡Todo va bien!

No dude en comunicarse si tiene alguna pregunta.

☎️ {LO phone}
📧 {LO email}`,
  },
  {
    id: 'preapproval_offer',
    name: 'Preapproval Offer',
    nameEs: 'Oferta de Preaprobación',
    subject: 'Free preapprovals for your clients',
    subjectEs: 'Preaprobaciones gratuitas para sus clientes',
    template: `Hi {realtorFname} 👋

This is {LO fullname} with loanDepot.

I wanted to reach out and let you know I'm offering fast, free preapprovals for your clients. I can typically turn them around in 24 hours or less!

Send them my way and I'll take great care of them.

☎️ {LO phone}
📧 {LO email}`,
    templateEs: `Hola {realtorFname} 👋

Soy {LO fullname} de loanDepot.

Quería comunicarme y hacerle saber que ofrezco preaprobaciones rápidas y gratuitas para sus clientes. ¡Normalmente puedo completarlas en 24 horas o menos!

Envíemelos y los cuidaré muy bien.

☎️ {LO phone}
📧 {LO email}`,
  },
  {
    id: 'thank_you_referral',
    name: 'Thank You for Referral',
    nameEs: 'Gracias por la Referencia',
    subject: 'Thank you for the referral!',
    subjectEs: '¡Gracias por la referencia!',
    template: `Hi {realtorFname} 👋

This is {LO fullname} with loanDepot.

Thank you so much for the referral! I really appreciate you thinking of me. I'll make sure to take excellent care of your client.

Looking forward to working together more in the future!

☎️ {LO phone}
📧 {LO email}`,
    templateEs: `Hola {realtorFname} 👋

Soy {LO fullname} de loanDepot.

¡Muchas gracias por la referencia! Realmente aprecio que haya pensado en mí. Me aseguraré de cuidar excelentemente a su cliente.

¡Espero trabajar más juntos en el futuro!

☎️ {LO phone}
📧 {LO email}`,
  },
  {
    id: 'check_in',
    name: 'Check In',
    nameEs: 'Verificación',
    subject: 'Checking in',
    subjectEs: 'Verificando',
    template: `Hi {realtorFname} 👋

This is {LO fullname} with loanDepot.

Just checking in to see how things are going. Let me know if there's anything I can help with!

Hope to connect soon.

☎️ {LO phone}
📧 {LO email}`,
    templateEs: `Hola {realtorFname} 👋

Soy {LO fullname} de loanDepot.

Solo verifico para ver cómo van las cosas. ¡Avíseme si hay algo en lo que pueda ayudar!

Espero conectar pronto.

☎️ {LO phone}
📧 {LO email}`,
  },
];

export type RealtorTemplateVariables = {
  realtorFname: string;
  brokerage: string;
  loFullname: string;
  loFname: string;
  loPhone: string;
  loEmail: string;
};

/**
 * Format phone number for display
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return '[Phone]';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === '1') {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

/**
 * Get the template text based on language preference
 */
export function getRealtorTemplateText(template: RealtorTextTemplate, useSpanish: boolean): string {
  return useSpanish ? template.templateEs : template.template;
}

/**
 * Get the template name based on language preference
 */
export function getRealtorTemplateName(template: RealtorTextTemplate, useSpanish: boolean): string {
  return useSpanish ? template.nameEs : template.name;
}

/**
 * Get the template subject based on language preference
 */
export function getRealtorTemplateSubject(template: RealtorTextTemplate, useSpanish: boolean): string {
  return useSpanish ? template.subjectEs : template.subject;
}

/**
 * Fill template with actual values
 */
export function fillRealtorTemplate(
  template: string,
  variables: RealtorTemplateVariables
): string {
  let result = template;
  
  // Replace {realtorFname} with realtor's first name
  result = result.replace(/{realtorFname}/g, variables.realtorFname || '[Realtor Name]');
  
  // Replace {brokerage} with realtor's brokerage name
  result = result.replace(/{brokerage}/g, variables.brokerage || '[Brokerage]');
  
  // Replace {LO fullname} with loan officer's full name
  result = result.replace(/{LO fullname}/g, variables.loFullname || '[Loan Officer]');
  
  // Replace {LO fname} with loan officer's first name
  result = result.replace(/{LO fname}/g, variables.loFname || '[LO First Name]');
  
  // Replace {LO phone} with loan officer's formatted phone
  result = result.replace(/{LO phone}/g, formatPhoneForDisplay(variables.loPhone) || '[LO Phone]');
  
  // Replace {LO email} with loan officer's email
  result = result.replace(/{LO email}/g, variables.loEmail || '[LO Email]');
  
  return result;
}
