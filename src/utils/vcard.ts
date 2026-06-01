import { Platform, Alert } from 'react-native';
import * as Contacts from 'expo-contacts';
import { File as FSFile, Paths } from 'expo-file-system';

export interface ContactInfo {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  company?: string;
  notes?: string;
  imageUri?: string;
}

export interface PickedContact {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  imageUri?: string;
}

const CONTACT_LOOKUP_FIELDS: Contacts.FieldType[] = [
  Contacts.Fields.Name,
  Contacts.Fields.FirstName,
  Contacts.Fields.LastName,
  Contacts.Fields.PhoneNumbers,
  Contacts.Fields.Emails,
];

const normalizePhoneForLookup = (phone?: string | null) => {
  const digits = (phone || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const normalizeEmailForLookup = (email?: string | null) => (email || '').trim().toLowerCase();

const deviceContactMatches = (
  contact: Contacts.ExistingContact,
  phoneDigits: string,
  email: string
) => {
  if (phoneDigits) {
    const hasPhone = contact.phoneNumbers?.some((entry) => {
      const contactDigits = normalizePhoneForLookup(entry.number);
      return contactDigits === phoneDigits;
    });
    if (hasPhone) return true;
  }

  if (email) {
    const hasEmail = contact.emails?.some((entry) => normalizeEmailForLookup(entry.email) === email);
    if (hasEmail) return true;
  }

  return false;
};

async function hasMatchingDeviceContact(info: ContactInfo): Promise<boolean> {
  const phoneDigits = normalizePhoneForLookup(info.phone);
  const email = normalizeEmailForLookup(info.email);

  if (!phoneDigits && !email) {
    return false;
  }

  const name = [info.firstName, info.lastName].filter(Boolean).join(' ').trim();
  const queries: Contacts.ContactQuery[] = name
    ? [{ fields: CONTACT_LOOKUP_FIELDS, name }]
    : [];

  queries.push({ fields: CONTACT_LOOKUP_FIELDS });

  const seenContactIds = new Set<string>();

  for (const query of queries) {
    const { data } = await Contacts.getContactsAsync(query);

    for (const contact of data) {
      if (seenContactIds.has(contact.id)) continue;
      seenContactIds.add(contact.id);

      if (deviceContactMatches(contact, phoneDigits, email)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Fetch all device contacts for display in a searchable picker.
 * Returns an array of PickedContact or null on failure.
 */
export async function getDeviceContacts(): Promise<PickedContact[] | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    Alert.alert('Not supported', 'Contacts are only available on iOS and Android devices.');
    return null;
  }

  try {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== Contacts.PermissionStatus.GRANTED) {
      Alert.alert(
        'Permission required',
        'Please allow access to your contacts to import a realtor.'
      );
      return null;
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [
        Contacts.Fields.FirstName,
        Contacts.Fields.LastName,
        Contacts.Fields.PhoneNumbers,
        Contacts.Fields.Emails,
        Contacts.Fields.Image,
      ],
      sort: Contacts.SortTypes.FirstName,
    });

    if (!data || data.length === 0) {
      Alert.alert('No Contacts', 'No contacts found on this device.');
      return null;
    }

    return data
      .filter((c) => c.firstName || c.lastName)
      .map((c) => ({
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        phone: c.phoneNumbers?.[0]?.number || undefined,
        email: c.emails?.[0]?.email || undefined,
        imageUri: c.image?.uri || undefined,
      }));
  } catch (error: any) {
    console.error('[Contacts] Error fetching contacts:', error);
    Alert.alert('Error', 'Failed to access contacts. Please try again.');
    return null;
  }
}

/**
 * Save contact to phone's contacts with native UI.
 * iOS & Android: Opens native contact form for user to review and save.
 */
export async function saveContact(info: ContactInfo): Promise<boolean> {
  // Guard against platforms that don't support native contacts
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    console.log('[Contacts] saveContact called on unsupported platform:', Platform.OS);
    Alert.alert(
      'Not supported',
      'Saving contacts is only available on iOS and Android devices.'
    );
    return false;
  }

  try {
    console.log('[Contacts] Requesting contacts permission…');
    const { status } = await Contacts.requestPermissionsAsync();

    if (status !== Contacts.PermissionStatus.GRANTED) {
      console.warn('[Contacts] Permission not granted:', status);
      Alert.alert(
        'Permission required',
        'Please allow access to your contacts to save this lead.'
      );
      return false;
    }

    // Normalize all incoming fields so we never pass undefined / null
    const firstName = (info.firstName || '').trim() || 'Lead';
    const lastName = (info.lastName || '').trim();
    const phone = (info.phone || '').trim();
    const email = (info.email || '').trim();
    const company = (info.company || '').trim();
    const notes = (info.notes || '').trim();

    if (!phone && !email) {
      console.warn('[Contacts] No phone or email provided, skipping save');
      Alert.alert(
        'Missing contact info',
        'This lead has no phone number or email to save.'
      );
      return false;
    }

    // Build the Contacts.Contact object in a very defensive way
    // Use legacy structure with name field to help iOS prioritize name over company
    const contact: Partial<Contacts.Contact> = {
      contactType: Contacts.ContactTypes.Person,
      name: `${firstName} ${lastName}`.trim(),
      firstName: firstName,
      lastName: lastName,
    };

    if (company) {
      (contact as any).company = company;
    }

    if (phone) {
      (contact as any)[Contacts.Fields.PhoneNumbers] = [
        { label: 'mobile', number: phone } as Contacts.PhoneNumber,
      ];
    }

    if (email) {
      (contact as any)[Contacts.Fields.Emails] = [
        { label: 'home', email } as any,
      ];
    }

    if (notes) {
      (contact as any)[Contacts.Fields.Note] = notes;
    }

    // Download remote image to local temp file if provided
    if (info.imageUri) {
      try {
        const downloaded = await FSFile.downloadFileAsync(info.imageUri, Paths.cache);
        (contact as any).image = { uri: downloaded.uri };
        console.log('[Contacts] Attached profile image from:', downloaded.uri);
      } catch (imgError) {
        console.warn('[Contacts] Could not download profile image:', imgError);
      }
    }

    console.log('[Contacts] Presenting contact form with contact:', contact);

    // Present native contact form for user to review and save
    const result = await Contacts.presentFormAsync(null, contact as Contacts.Contact);

    console.log('[Contacts] presentFormAsync result:', result);
    const saved = await hasMatchingDeviceContact({
      ...info,
      firstName,
      lastName,
      phone,
      email,
    });
    console.log('[Contacts] Matching device contact found after form:', saved);
    return saved;
  } catch (error: any) {
    console.error('[Contacts] Error presenting contact form:', error);
    Alert.alert(
      'Error',
      'Failed to open the contact form. Please try again.',
      [{ text: 'OK' }]
    );
    // Do not rethrow – we want a soft failure, not a fatal crash
    return false;
  }
}
