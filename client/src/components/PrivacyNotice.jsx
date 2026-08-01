import { useState, useRef, useEffect } from 'react';
import barkLogo from '../assets/barklogo.png';
import npcSeal from '../assets/npc-seal.png';
import '../styles/components/PrivacyNotice.css';

/**
 * PrivacyNotice
 * Shown as a full-screen overlay once per browser session after login.
 * The "I Agree and Continue" button is disabled until the user checks the consent box.
 */
export default function PrivacyNotice({ onAccept }) {
  const [checked, setChecked] = useState(false);
  const bodyRef = useRef(null);

  // Prevent background scroll while open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <div className="pn-overlay" role="dialog" aria-modal="true" aria-labelledby="pn-title">
      <div className="pn-card">

        {/* ── Scrollable content ── */}
        <div className="pn-body" ref={bodyRef}>
          
          {/* ── Hero Banner ── */}
          <div className="pn-hero">
            <div className="pn-hero-left">
              <div className="pn-hero-brand">
                <img src={barkLogo} alt="BARK logo" className="pn-hero-logo" />
                <div className="pn-hero-text">
                  <h1 id="pn-title" className="pn-hero-title">BARK Privacy Notice</h1>
                  <p className="pn-hero-subtitle">Please read and accept before continuing</p>
                </div>
              </div>
              <hr className="pn-hero-divider" />
              
              <p className="pn-intro">
                Welcome to the <strong>Board Assessment and Review Kit (BARK)</strong>, an online board exam reviewer
                platform developed in National University – Laguna (NUL). We value your privacy and are committed to
                protecting your personal information. As a student, alumni, or faculty member using this digital board
                exam reviewer platform, this policy explains how your data is collected, used, and safeguarded
                specifically within the BARK website. By continuing, you acknowledge that your information will be
                handled responsibly, securely, and in accordance with applicable data protection regulations.
              </p>

              <p className="pn-intro">
                This Privacy Notice explains how the BARK system processes your personal data. Whether you are a student
                or alumni answering online reviewers, or a faculty member uploading exam materials and monitoring
                performance, this document describes exactly what information the platform collects, why it is needed to
                deliver these digital review services, how it is protected, and your rights under the{' '}
                <strong>Data Privacy Act of 2012 (RA 10173)</strong>.
              </p>
            </div>
            <div className="pn-hero-right">
              <img src={npcSeal} alt="National Privacy Commission seal" className="pn-hero-npc" />
            </div>
          </div>

          <div className="pn-content">

          {/* Personal Data We Collect */}
          <section className="pn-section">
            <h2 className="pn-section-title">Personal Data We Collect</h2>
            <p>To provide a customized and secure digital review experience, BARK collects the following information:</p>
            <ul>
              <li>
                Identity &amp; Contact Information: Your Name, Student ID, Personal Email, School Email, and Program/Course.
                <br />
                <em>Why we collect this:</em> To verify your identity, communicate with you, and ensure you are correctly segregated into your respective program (e.g., ensuring Civil Engineering students only access Civil Engineering reviewers).
              </li>
              <li>
                Assessment &amp; Performance Data: Your exam answers, submitted reviewers, and computed scores.
                <br />
                <em>Why we collect this:</em> To provide you with accurate feedback on your performance and allow faculty to monitor the overall readiness of the student body.
              </li>
              <li>
                Uploaded Files (For Faculty): Images and documents containing exam questions.
                <br />
                <em>Why we collect this:</em> To build the online reviewer database.
              </li>
            </ul>
          </section>

          {/* Purpose of Data Processing */}
          <section className="pn-section">
            <h2 className="pn-section-title">Purpose of Data Processing</h2>
            <p>Your personal data is strictly processed for educational and administrative purposes, specifically:</p>
            <ul>
              <li>User Authentication &amp; Role-Based Access: To log you into the platform and restrict access based on your role (Student, Alumni, Faculty, Program Chair, Dean, or Superadmin).</li>
              <li>Digitalization of Reviewers: To convert traditional face-to-face board exam reviewers into a centralized, remote, and accessible online platform.</li>
              <li>Performance Monitoring: To allow Deans and Program Chairs to track statistical data regarding student and alumni performance on the reviewers.</li>
              <li>System Notifications: To dispatch important platform updates and registration emails.</li>
            </ul>
          </section>

          {/* Use of Artificial Intelligence */}
          <section className="pn-section">
            <h2 className="pn-section-title">Use of Artificial Intelligence</h2>
            <p>BARK utilizes Artificial Intelligence (AI) specifically for Document Reading and Extraction.</p>
            <ul>
              <li>How it works: When faculty members bulk-upload question files, the AI reads the documents, extracts the text, and automatically formats the questions into the website.</li>
              <li>Privacy limitations: This AI function is used solely to process educational content (the exam questions). No personal data or student profiles are fed into the AI model, and it is not used to make automated decisions or predictions about your personal performance.</li>
            </ul>
          </section>

          {/* Website Logs and Technical Data */}
          <section className="pn-section">
            <h2 className="pn-section-title">Website Logs and Technical Data</h2>
            <p>To maintain the security and functionality of the BARK platform, we collect certain technical data:</p>
            <ul>
              <li>IP Addresses: Logged temporarily to enforce rate limiting, which protects the platform from malicious attacks and spam.</li>
              <li>Cookies &amp; Temporary Tokens: Used to securely manage your login sessions and temporarily hold necessary data while you navigate the platform.</li>
            </ul>
          </section>

          {/* Sharing and Disclosure */}
          <section className="pn-section">
            <h2 className="pn-section-title">Sharing and Disclosure of Information</h2>
            <p>Your privacy is our priority. BARK strictly does not sell your personal information. Information is only accessed by or shared with:</p>
            <ul>
              <li>Authorized University Personnel: Deans, Program Chairs, and Superadmins can access performance statistics and user lists strictly for their respective departments.</li>
              <li>Brevo (Third-Party Service): We utilize Brevo solely as our email dispatch service to send you registration confirmations and platform notifications.</li>
            </ul>
          </section>

          {/* Data Retention */}
          <section className="pn-section">
            <h2 className="pn-section-title">Data Retention</h2>
            <p>
              BARK retains your personal data only for as long as it is necessary to fulfill the educational purposes outlined above and to comply
              with NUL's institutional requirements. Once the retention period expires, or the data is no longer legally required, it will be
              securely disposed of and permanently deleted from our databases.
            </p>
          </section>

          {/* Security Measures */}
          <section className="pn-section">
            <h2 className="pn-section-title">Security Measures</h2>
            <p>We implement strict organizational, physical, and technical security measures to protect your data, including:</p>
            <ul>
              <li>Encryption: HTTPS for secure web browsing and AES encryption for sensitive database entries.</li>
              <li>Authentication: Password hashing and JSON Web Tokens (JWT) to secure user sessions.</li>
              <li>Access Control: Strict role-based access control ensuring users only see what is permitted for their account level.</li>
              <li>Traffic Management: IP rate limiting to prevent unauthorized access attempts.</li>
            </ul>
          </section>

          {/* Your User Rights */}
          <section className="pn-section">
            <h2 className="pn-section-title">Your User Rights</h2>
            <p>Under the Data Privacy Act of 2012, you have the right to:</p>
            <ul>
              <li>Be Informed about how your data is collected and processed.</li>
              <li>Access the personal information BARK holds about you.</li>
              <li>Object to the processing of your data.</li>
              <li>Rectification to correct any inaccurate data.</li>
              <li>Erasure or Blocking to request the deletion of your personal data.</li>
              <li>Data Portability to securely obtain a copy of your data.</li>
              <li>Lodge a Complaint with the National Privacy Commission (NPC) if your privacy rights are violated.</li>
            </ul>
          </section>

          {/* Contact Information */}
          <section className="pn-section">
            <h2 className="pn-section-title">Contact Information</h2>
            <p>If you have any questions, concerns, or requests regarding your personal data within the BARK platform, please contact:</p>
            <div className="pn-contact-block">
              <p><strong>BARK Superadmin</strong></p>
              <p>Email: <a href="mailto:nubarksuperadmin@gmail.com">nubarksuperadmin@gmail.com</a></p>
            </div>
          </section>

          </div>
        </div>

        {/* ── Footer / consent ── */}
        <footer className="pn-footer">
          <p className="pn-scroll-hint">Please scroll up to read the full notice before accepting.</p>

          <label className="pn-consent-row" htmlFor="pn-consent-check">
            <input
              id="pn-consent-check"
              type="checkbox"
              className="pn-consent-checkbox"
              checked={checked}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span className="pn-consent-label">
              I have read and understood the BARK Privacy Notice and voluntarily consent to the collection,
              processing, storage, and use of my personal information for the purposes described above.
            </span>
          </label>

          <button
            type="button"
            className="pn-agree-btn"
            disabled={!checked}
            onClick={onAccept}
          >
            I Agree and Continue
          </button>
        </footer>

      </div>
    </div>
  );
}
