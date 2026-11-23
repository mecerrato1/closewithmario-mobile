import { CRM_API_BASE_URL, type CrmLeadSource } from './crmLeadApi';

const APPLICATION_PLACEHOLDER = '{LO application URL}';

export function prefersSpanish(language?: string | null): boolean {
  return ['spanish', 'es', 'español'].includes(language?.trim().toLowerCase() || '');
}

export function assertResolvedTemplate(message: string, spanish = false): void {
  const unresolved = message.match(/\{[^{}]+\}|\[(?:First Name|Loan Officer|LO First Name|LO Phone|LO Email|Company|Phone|Email|credit|county)\]/g);
  if (unresolved) {
    throw new Error((spanish
      ? 'Complete los campos pendientes antes de abrir el mensaje: '
      : 'Complete the unresolved template fields before opening the message: ') + [...new Set(unresolved)].join(', '));
  }
}

/** The server selects the assigned LO. Never send the signed-in user's LO ID. */
export async function prepareLeadTemplateMessage({
  message, leadId, leadSource, spanish = false, request,
}: {
  message: string;
  leadId: string;
  leadSource: CrmLeadSource;
  spanish?: boolean;
  request: (url: string, init?: RequestInit) => Promise<Response>;
}): Promise<string> {
  if (message.includes(APPLICATION_PLACEHOLDER)) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const params = new URLSearchParams({ leadId, leadSource });
      let response: Response;
      try {
        response = await request(`${CRM_API_BASE_URL}/api/leads/application-url?${params}`, {
          method: 'GET', signal: controller.signal,
        });
      } catch (error) {
        const sessionExpired = error instanceof Error && /session expired|sign in/i.test(error.message);
        throw new Error(sessionExpired
          ? (spanish ? 'Su sesión expiró. Inicie sesión e inténtelo de nuevo.' : 'Your session expired. Please sign in and try again.')
          : (spanish ? 'No se pudo cargar el enlace. Revise su conexión e inténtelo de nuevo.' : 'Unable to load the application link. Check your connection and try again.'));
      }
      if (!response.ok) {
        const errors: Record<number, [string, string]> = {
          401: ['Please sign in again, then retry.', 'Inicie sesión de nuevo y vuelva a intentarlo.'],
          403: ['You do not have permission to update this lead. Contact your administrator, then retry.', 'No tiene permiso para actualizar este cliente. Contacte a su administrador e inténtelo de nuevo.'],
          404: ['The application-link service is unavailable. The website endpoint must be deployed. Please try again later.', 'El servicio de enlaces no está disponible. Se debe implementar el endpoint del sitio web. Inténtelo más tarde.'],
        };
        const fallback = ['Unable to load the application link. Please try again.', 'No se pudo cargar el enlace. Inténtelo de nuevo.'];
        throw new Error((errors[response.status] || fallback)[spanish ? 1 : 0]);
      }
      let data: { url?: unknown } | null;
      try { data = await response.json(); } catch { data = null; }
      if (data?.url === '' || (typeof data?.url === 'string' && !data.url.trim())) {
        throw new Error(spanish
          ? 'El oficial de préstamos asignado debe guardar una URL de solicitud en línea en Configuración del perfil (Profile Settings).'
          : 'The assigned loan officer must save an online application URL in Profile Settings.');
      }
      let valid = false;
      if (typeof data?.url === 'string') {
        try {
          const url = new URL(data.url);
          valid = url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
        } catch { /* Reject malformed server responses. */ }
      }
      if (!valid) throw new Error(spanish
        ? 'El servicio devolvió un enlace inválido. Inténtelo de nuevo o contacte al administrador.'
        : 'The application-link service returned an invalid response. Retry or contact your administrator.');
      // A callback preserves literal dollar signs in saved URLs.
      message = message.replace(/\{LO application URL\}/g, () => (data!.url as string).trim());
    } finally {
      clearTimeout(timeout);
    }
  }
  assertResolvedTemplate(message, spanish);
  return message;
}
