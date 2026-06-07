const PROFILE_KEY = "nirvaya_local_profile";
const CONTACTS_KEY = "nirvaya_emergency_contacts";

export const saveLocalProfile = (profile) => {
  localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
};

export const getLocalProfile = () => {
  const data = localStorage.getItem(PROFILE_KEY);
  return data ? JSON.parse(data) : null;
};

export const saveEmergencyContacts = (contacts) => {
  localStorage.setItem(CONTACTS_KEY, JSON.stringify(contacts));
};

export const getEmergencyContacts = () => {
  const data = localStorage.getItem(CONTACTS_KEY);
  return data ? JSON.parse(data) : [];
};

export const isSetupComplete = () => {
  const profile = getLocalProfile();
  const contacts = getEmergencyContacts();

  return Boolean(profile?.name) && contacts.length > 0;
};