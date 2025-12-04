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
 * Save contact to phone's contacts with native UI
 * iOS & Android: Opens native contact form for user to review and save
 */
export async function saveContact(contact: ContactInfo): Promise<void> {
  try {
    // Request permission to access contacts
    const { status } = await Contacts.requestPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'Please grant contacts permission to save this lead as a contact.',
        [{ text: 'OK' }]
      );
      return;
    }

    // Prepare contact data
    const newContact: Partial<Contacts.Contact> = {
      contactType: Contacts.ContactTypes.Person,
      name: `${contact.firstName} ${contact.lastName}`,
      firstName: contact.firstName,
      lastName: contact.lastName,
      company: contact.company || '',
    };

    // Add phone number if available
    if (contact.phone) {
      const cleanPhone = contact.phone.replace(/\D/g, '');
      newContact.phoneNumbers = [
        {
          label: 'mobile',
          number: cleanPhone,
        },
      ];
    }

    // Add email if available
    if (contact.email) {
      newContact.emails = [
        {
          label: 'home',
          email: contact.email,
        },
      ];
    }

    // Add notes if available
    if (contact.notes) {
      newContact.note = contact.notes;
    }

    // Present native contact form for user to review and save
    await Contacts.presentFormAsync(null, newContact as Contacts.Contact);
    
    // Note: presentFormAsync doesn't return a result, so we can't show a success message
    // The user will see the native contact form and can save or cancel themselves
  } catch (error: any) {
    console.error('Error presenting contact form:', error);
    Alert.alert(
      'Error',
      'Failed to open contact form. Please try again.',
      [{ text: 'OK' }]
    );
    throw error;
  }
}
