import { Platform, Alert } from 'react-native';
import * as Contacts from 'expo-contacts';

export interface ContactInfo {
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  company?: string;
  notes?: string;
}

/**
 * Save contact to phone's contacts with native UI.
 * iOS & Android: Opens native contact form for user to review and save.
 */
export async function saveContact(info: ContactInfo): Promise<void> {
  // Guard against platforms that don't support native contacts
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    console.log('[Contacts] saveContact called on unsupported platform:', Platform.OS);
    Alert.alert(
      'Not supported',
      'Saving contacts is only available on iOS and Android devices.'
    );
    return;
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
      return;
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
      return;
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

    console.log('[Contacts] Presenting contact form with contact:', contact);

    // Present native contact form for user to review and save
    const result = await Contacts.presentFormAsync(null, contact as Contacts.Contact);

    // presentFormAsync returns the contactId if the user saved it, or undefined if canceled
    console.log('[Contacts] presentFormAsync result:', result);
  } catch (error: any) {
    console.error('[Contacts] Error presenting contact form:', error);
    Alert.alert(
      'Error',
      'Failed to open the contact form. Please try again.',
      [{ text: 'OK' }]
    );
    // Do not rethrow – we want a soft failure, not a fatal crash
  }
}
