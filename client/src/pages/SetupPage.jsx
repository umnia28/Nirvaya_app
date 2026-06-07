import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  saveLocalProfile,
  getLocalProfile,
  saveEmergencyContacts,
  getEmergencyContacts,
} from "../services/localProfileService";

import { getOrCreateDeviceId } from "../services/deviceService";

import "./SetupPage.css";

const emptyContact = {
  name: "",
  phone: "",
  relation: "",
  is_primary: false,
};

export default function SetupPage() {
  const navigate = useNavigate();

  const [profile, setProfile] = useState({
    name: "",
    phone: "",
  });

  const [contacts, setContacts] = useState([
    {
      ...emptyContact,
      is_primary: true,
    },
  ]);

  const [deviceId, setDeviceId] = useState("");

  useEffect(() => {
    const id = getOrCreateDeviceId();
    setDeviceId(id);

    const savedProfile = getLocalProfile();
    const savedContacts = getEmergencyContacts();

    if (savedProfile) {
      setProfile({
        name: savedProfile.name || "",
        phone: savedProfile.phone || "",
      });
    }

    if (savedContacts.length > 0) {
      setContacts(savedContacts);
    }
  }, []);

  const updateProfile = (field, value) => {
    setProfile((previous) => ({
      ...previous,
      [field]: value,
    }));
  };

  const updateContact = (index, field, value) => {
    setContacts((previous) => {
      const updated = [...previous];

      updated[index] = {
        ...updated[index],
        [field]: value,
      };

      return updated;
    });
  };

  const setPrimaryContact = (index) => {
    setContacts((previous) =>
      previous.map((contact, currentIndex) => ({
        ...contact,
        is_primary: currentIndex === index,
      }))
    );
  };

  const addContact = () => {
    setContacts((previous) => [
      ...previous,
      {
        ...emptyContact,
        is_primary: previous.length === 0,
      },
    ]);
  };

  const removeContact = (index) => {
    if (contacts.length === 1) {
      alert("At least one emergency contact is required.");
      return;
    }

    setContacts((previous) => {
      const updated = previous.filter((_, currentIndex) => currentIndex !== index);

      if (!updated.some((contact) => contact.is_primary)) {
        updated[0].is_primary = true;
      }

      return updated;
    });
  };

  const validateForm = () => {
    const validContacts = contacts.filter(
      (contact) => contact.name.trim() && contact.phone.trim()
    );

    if (validContacts.length === 0) {
      alert("Please add at least one emergency contact with name and phone.");
      return false;
    }

    for (const contact of validContacts) {
      if (contact.phone.trim().length < 6) {
        alert(`Phone number for ${contact.name} looks too short.`);
        return false;
      }
    }

    return true;
  };

  const handleSave = () => {
    if (!validateForm()) return;

    const cleanProfile = {
      name: profile.name.trim() || "Nirvaya User",
      phone: profile.phone.trim(),
    };

    const cleanContacts = contacts
      .filter((contact) => contact.name.trim() && contact.phone.trim())
      .map((contact, index) => ({
        name: contact.name.trim(),
        phone: contact.phone.trim(),
        relation: contact.relation.trim(),
        is_primary: Boolean(contact.is_primary) || index === 0,
      }));

    if (!cleanContacts.some((contact) => contact.is_primary)) {
      cleanContacts[0].is_primary = true;
    }

    saveLocalProfile(cleanProfile);
    saveEmergencyContacts(cleanContacts);

    navigate("/sos", {
  replace: true,
});
  };

  const skipProfileButKeepContacts = () => {
    if (!validateForm()) return;

    const cleanContacts = contacts
      .filter((contact) => contact.name.trim() && contact.phone.trim())
      .map((contact, index) => ({
        name: contact.name.trim(),
        phone: contact.phone.trim(),
        relation: contact.relation.trim(),
        is_primary: Boolean(contact.is_primary) || index === 0,
      }));

    saveLocalProfile({
      name: "Nirvaya User",
      phone: "",
    });

    saveEmergencyContacts(cleanContacts);

   navigate("/sos", {
  replace: true,
});
  };

  return (
    <main className="setup-page">
      <section className="setup-card">
        <div className="brand-row">
          <div className="brand-icon">N</div>

          <div>
            <h1>Nirvaya Setup</h1>
            <p>Set emergency contacts for SOS alerts.</p>
          </div>
        </div>

        <div className="info-box">
          <strong>No login needed.</strong>
          <span>
            Your profile and contacts are saved only in this browser. During SOS,
            contacts are sent to the backend with your live tracking link.
          </span>
        </div>

        <section className="form-section">
          <h2>Your basic info</h2>

          <label>Your name</label>
          <input
            value={profile.name}
            onChange={(event) => updateProfile("name", event.target.value)}
            placeholder="Example: Raisa"
          />

          <label>Your phone number</label>
          <input
            value={profile.phone}
            onChange={(event) => updateProfile("phone", event.target.value)}
            placeholder="Example: 017XXXXXXXX"
          />
        </section>

        <section className="form-section">
          <div className="section-header">
            <h2>Emergency contacts</h2>

            <button type="button" className="small-outline" onClick={addContact}>
              + Add
            </button>
          </div>

          {contacts.map((contact, index) => (
            <div className="contact-card" key={index}>
              <div className="contact-top">
                <strong>Contact {index + 1}</strong>

                <button
                  type="button"
                  className="delete-button"
                  onClick={() => removeContact(index)}
                >
                  Remove
                </button>
              </div>

              <label>Name</label>
              <input
                value={contact.name}
                onChange={(event) =>
                  updateContact(index, "name", event.target.value)
                }
                placeholder="Example: Mother"
              />

              <label>Phone</label>
              <input
                value={contact.phone}
                onChange={(event) =>
                  updateContact(index, "phone", event.target.value)
                }
                placeholder="Example: 017XXXXXXXX"
              />

              <label>Relation</label>
              <input
                value={contact.relation}
                onChange={(event) =>
                  updateContact(index, "relation", event.target.value)
                }
                placeholder="Example: Mother / Brother / Friend"
              />

              <button
                type="button"
                className={
                  contact.is_primary ? "primary-contact active" : "primary-contact"
                }
                onClick={() => setPrimaryContact(index)}
              >
                {contact.is_primary ? "✓ Primary contact" : "Make primary"}
              </button>
            </div>
          ))}
        </section>

        <div className="device-box">
          <span>Device ID</span>
          <code>{deviceId}</code>
        </div>

        <div className="button-row">
          <button className="secondary-button" onClick={skipProfileButKeepContacts}>
            Save contacts only
          </button>

          <button className="primary-button" onClick={handleSave}>
            Save & Continue
          </button>
        </div>
      </section>
    </main>
  );
}