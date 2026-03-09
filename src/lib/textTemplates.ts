export type TextTemplate = {
  id: string;
  name: string;
  nameEs: string;
  subject: string;
  subjectEs: string;
  template: string;
  templateEs: string;
};

export const TEXT_TEMPLATES: TextTemplate[] = [
  {
    id: 'initial_contact',
    name: 'Initial Contact',
    nameEs: 'Contacto Inicial',
    subject: 'Following up about your home financing inquiry',
    subjectEs: 'Seguimiento sobre su consulta de financiamiento de vivienda',
    template: `Hi {fname} 👋

This is {LO fullname} with {company}.

I'm reaching out about the ad you clicked on {platform}. Tried calling you earlier - are you available for a quick chat to see how we can help you become a homeowner? 🏡

☎️ Mobile {LO phone}
📧 Email {LO email}`,
    templateEs: `Hola {fname} 👋

Soy {LO fullname} de {company}.

Me comunico sobre el anuncio en el que hizo clic en {platform}. Intenté llamarlo antes, ¿está disponible para una charla rápida para ver cómo podemos ayudarlo a convertirse en propietario de vivienda? 🏡

☎️ Móvil {LO phone}
📧 Email {LO email}`,
  },
  {
    id: 'document_followup',
    name: 'Document Follow-up',
    nameEs: 'Seguimiento de Documentos',
    subject: 'Documents needed for your preapproval',
    subjectEs: 'Documentos necesarios para su preaprobación',
    template: `Hi {fname} 👋

This is {LO fullname} with {company}.

Just following up on the documents we need to get you preapproved. Let me know if you have any questions! 📄

You can reach me at:
☎️ {LO phone}
📧 {LO email}`,
    templateEs: `Hola {fname} 👋

Soy {LO fullname} de {company}.

Solo hago seguimiento de los documentos que necesitamos para pre-aprobarlo. ¡Avíseme si tiene alguna pregunta! 📄

Puede comunicarse conmigo en:
☎️ {LO phone}
📧 {LO email}`,
  },
  {
    id: 'preapproval_checkin',
    name: 'Pre-approval Check-in',
    nameEs: 'Verificación de Pre-aprobación',
    subject: 'Checking in about your home loan preapproval',
    subjectEs: 'Seguimiento sobre su preaprobación de hipoteca',
    template: `Hi {fname} 👋

This is {LO fullname} with {company}.

Just checking in to see if you're ready to move forward with getting preapproved for your home mortgage. I'm here to help! 🏠✅

Feel free to call or text me:
☎️ {LO phone}
📧 {LO email}`,
    templateEs: `Hola {fname} 👋

Soy {LO fullname} de {company}.

Solo verifico para ver si está listo para avanzar con la pre-aprobación de su hipoteca. ¡Estoy aquí para ayudar! 🏠✅

No dude en llamarme o enviarme un mensaje:
☎️ {LO phone}
📧 {LO email}`,
  },
  {
    id: 'stop_paying_rent',
    name: 'Stop Paying Rent',
    nameEs: 'Deje de Pagar Alquiler',
    subject: 'Let’s explore how to stop paying rent',
    subjectEs: 'Veamos cómo puede dejar de pagar alquiler',
    template: `Hi {fname} 👋

This is {LO fullname} with {company}.

I don't mean to bug you, but I really think I can help you get into your own home and stop paying rent. Let's chat when you have a moment! 🏡💰

Reach me at:
☎️ {LO phone}
📧 {LO email}`,
    templateEs: `Hola {fname} 👋

Soy {LO fullname} de {company}.

No quiero molestarlo, pero realmente creo que puedo ayudarlo a tener su propia casa y dejar de pagar alquiler. ¡Hablemos cuando tenga un momento! 🏡💰

Contácteme en:
☎️ {LO phone}
📧 {LO email}`,
  },
  {
    id: 'not_ready_general',
    name: 'Not Ready - General',
    nameEs: 'No Está Listo - General',
    subject: 'Thank you for your time',
    subjectEs: 'Gracias por su tiempo',
    template: `Hi {fname} 👋

This is {LO fullname}, good speaking to you.

I understand that you're not ready right now, but feel free to contact me when you are.

☎️ Mobile {LO phone}
📧 Email {LO email}

Good luck! 🍀`,
    templateEs: `Hola {fname} 👋

Soy {LO fullname}, fue un placer hablar con usted.

Entiendo que no está listo en este momento, pero no dude en contactarme cuando lo esté.

☎️ Móvil {LO phone}
📧 Email {LO email}

¡Buena suerte! 🍀`,
  },
  {
    id: 'not_ready_credit',
    name: 'Not Ready - Working on Credit',
    nameEs: 'No Está Listo - Trabajando en Crédito',
    subject: 'Next steps once you’ve worked on your credit',
    subjectEs: 'Próximos pasos después de trabajar en su crédito',
    template: `Hi {fname} 👋

This is {LO fullname}, good speaking to you.

I understand that you're going to be working on your credit. Feel free to contact me when you're ready.

☎️ Mobile {LO phone}
📧 Email {LO email}

Good luck! 🍀`,
    templateEs: `Hola {fname} 👋

Soy {LO fullname}, fue un placer hablar con usted.

Entiendo que va a trabajar en su crédito. No dude en contactarme cuando esté listo.

☎️ Móvil {LO phone}
📧 Email {LO email}

¡Buena suerte! 🍀`,
  },
  {
    id: 'callback_confirmation',
    name: 'Callback Confirmation',
    nameEs: 'Confirmación de Llamada',
    subject: 'Callback confirmation',
    subjectEs: 'Confirmación de llamada',
    template: `Hi {fname} 👋

This is {LO fullname}, good speaking to you.

Look forward to our callback{callbackTime}

☎️ Mobile {LO phone}
📧 Email {LO email}`,
    templateEs: `Hola {fname} 👋

Soy {LO fullname}, fue un placer hablar con usted.

Espero con ansias nuestra llamada{callbackTime}

☎️ Móvil {LO phone}
📧 Email {LO email}`,
  },
  {
    id: 'hung_up',
    name: 'Hung Up on Me',
    nameEs: 'Colgó la Llamada',
    subject: 'Following up on our recent call',
    subjectEs: 'Seguimiento de nuestra llamada reciente',
    template: `Hi {fname} 👋

This is {LO fullname} with {company}. I believe you just hung up the call thinking I was a spam call.

I am not, I am simply responding to the ad you clicked on {platform}.

If you changed your mind, I can mark you as not interested and will not call you again.

This call is to see how we can help you become a homeowner? 🏡

☎️ Mobile {LO phone}
📧 Email {LO email}`,
    templateEs: `Hola {fname} 👋

Soy {LO fullname} de {company}. Creo que acaba de colgar la llamada pensando que era una llamada de spam.

No lo soy, simplemente estoy respondiendo al anuncio en el que hizo clic en {platform}.

Si cambió de opinión, puedo marcarlo como no interesado y no lo volveré a llamar.

Esta llamada es para ver cómo podemos ayudarlo a convertirse en propietario de vivienda? 🏡

☎️ Móvil {LO phone}
📧 Email {LO email}`,
  },
  {
    id: 'variable_income_docs',
    name: 'Variable Income Docs',
    nameEs: 'Documentos de Ingresos Variables',
    subject: 'Documents needed for your preapproval',
    subjectEs: 'Documentos necesarios para su preaprobación',
    template: `Hi {fname} 👋

Here's the list of documents needed for your preapproval:

📄 Most recent paystub
📄 Last paystub of {recentYear}
📄 Last paystub of {prevYear}
📄 {recentYear} W-2
📄 {prevYear} W-2
📄 Driver's license

Please send these when you get a chance! Let me know if you have any questions.

☎️ Mobile {LO phone}
📧 Email {LO email}`,
    templateEs: `Hola {fname} 👋

Aquí está la lista de documentos necesarios para su pre-aprobación:

📄 Talón de pago más reciente
📄 Último talón de pago de {recentYear}
📄 Último talón de pago de {prevYear}
📄 W-2 de {recentYear}
📄 W-2 de {prevYear}
📄 Licencia de conducir

¡Por favor envíe estos cuando pueda! Avíseme si tiene alguna pregunta.

☎️ Móvil {LO phone}
📧 Email {LO email}`,
  },
  {
    id: 'w2_regular',
    name: 'W2 Regular',
    nameEs: 'W2 Regular',
    subject: 'Documents needed for your preapproval',
    subjectEs: 'Documentos necesarios para su preaprobación',
    template: `Hi {fname} 👋

Here's the list of documents needed for your preapproval:

📄 Most recent paystub
📄 {recentYear} W-2
📄 {prevYear} W-2
📄 Driver's license

Please send these when you get a chance! Let me know if you have any questions.

☎️ Mobile {LO phone}
📧 Email {LO email}`,
    templateEs: `Hola {fname} 👋

Aquí está la lista de documentos necesarios para su pre-aprobación:

📄 Talón de pago más reciente
📄 W-2 de {recentYear}
📄 W-2 de {prevYear}
📄 Licencia de conducir

¡Por favor envíe estos cuando pueda! Avíseme si tiene alguna pregunta.

☎️ Móvil {LO phone}
📧 Email {LO email}`,
  },
  {
    id: 'self_employed_docs',
    name: 'Self-Employed Docs',
    nameEs: 'Documentos de Trabajador Independiente',
    subject: 'Self-employed documents for your preapproval',
    subjectEs: 'Documentos para su preaprobación como trabajador independiente',
    template: `Hi {fname} 👋

Here's the list of documents needed for your preapproval:

📄 {recentYear} personal tax returns (all pages)
📄 {prevYear} personal tax returns (all pages)
📄 {recentYear} W-2 (issued from business)
📄 {prevYear} W-2 (issued from business)
📄 Driver's license

Please send these when you get a chance! Let me know if you have any questions.

☎️ Mobile {LO phone}
📧 Email {LO email}`,
    templateEs: `Hola {fname} 👋

Aquí está la lista de documentos necesarios para su pre-aprobación:

📄 Declaración de impuestos personales de {recentYear} (todas las páginas)
📄 Declaración de impuestos personales de {prevYear} (todas las páginas)
📄 W-2 de {recentYear} (emitido por el negocio)
📄 W-2 de {prevYear} (emitido por el negocio)
📄 Licencia de conducir

¡Por favor envíe estos cuando pueda! Avíseme si tiene alguna pregunta.

☎️ Móvil {LO phone}
📧 Email {LO email}`,
  },
  {
    id: 'no_response',
    name: 'No Response',
    nameEs: 'Sin Respuesta',
    subject: 'Checking in on your pre-approval inquiry',
    subjectEs: 'Seguimiento de su consulta de preaprobación',
    template: `Hey {fname} 👋

I’ve reached out a couple times about the pre-approval you inquired about on {platform} on {adDate}.

Haven’t heard back, so I wanted to check in.

Where do we go from here; are you still looking for help, or should I step back for now?

☎️ Mobile {LO phone}
📧 Email {LO email}`,
    templateEs: `Hola {fname} 👋

He intentado contactarlo un par de veces sobre la preaprobación por la que preguntó en {platform} el {adDate}.

No he sabido nada de usted, así que quería ver cómo está todo.

¿Cómo seguimos? ¿Todavía busca ayuda o prefiere que lo deje por ahora?

☎️ Móvil {LO phone}
📧 Email {LO email}`,
  },
];

export type TemplateVariables = {
  fname: string;
  loFullname: string;
  loFname: string;
  loPhone: string;
  loEmail: string;
  company: string;
  platform: string;
  recentYear?: string;
  prevYear?: string;
  callbackTime?: string;
  adDate?: string;
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
  
  // Handle 11-digit numbers with country code (e.g., 1 for US)
  if (cleaned.length === 11 && cleaned.startsWith('1')) {
    return `(${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  
  // Return original if not 10 or 11 digits
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
 * Gets the appropriate template text based on language preference
 * @param template - The template object
 * @param useSpanish - Whether to use Spanish version
 * @returns The template text in the appropriate language
 */
export function getTemplateText(template: TextTemplate, useSpanish: boolean): string {
  return useSpanish ? template.templateEs : template.template;
}

/**
 * Gets the appropriate subject line based on language preference
 * @param template - The template object
 * @param useSpanish - Whether to use Spanish version
 * @returns The subject line in the appropriate language
 */
export function getTemplateSubject(template: TextTemplate, useSpanish: boolean): string {
  return useSpanish ? template.subjectEs : template.subject;
}

/**
 * Gets the appropriate template name based on language preference
 * @param template - The template object
 * @param useSpanish - Whether to use Spanish version
 * @returns The template name in the appropriate language
 */
export function getTemplateName(template: TextTemplate, useSpanish: boolean): string {
  return useSpanish ? template.nameEs : template.name;
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
  
  // Replace {company} with company/brokerage name
  result = result.replace(/{company}/g, variables.company || '[Company]');
  
  // Replace {platform} with the friendly platform name
  result = result.replace(/{platform}/g, formatPlatformName(variables.platform));

  // Calculate dynamic years: recentYear = current year - 1, prevYear = current year - 2
  const currentYear = new Date().getFullYear();
  const recentYear = variables.recentYear || String(currentYear - 1);
  const prevYear = variables.prevYear || String(currentYear - 2);
  
  // Replace {recentYear} and {prevYear}
  result = result.replace(/{recentYear}/g, recentYear);
  result = result.replace(/{prevYear}/g, prevYear);

  // Replace {callbackTime} with the formatted callback date/time
  result = result.replace(/{callbackTime}/g, variables.callbackTime || '');

  // Replace {adDate} with the formatted ad clicked date
  result = result.replace(/{adDate}/g, variables.adDate || 'recently');

  return result;
}
