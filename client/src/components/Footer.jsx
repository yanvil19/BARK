import '../styles/components/Footer.css';

export default function Footer({ onNavigate, isPublic = false, landingSectionsAvailable = false }) {
  const year = new Date().getFullYear();

  const goToRoute = (routeName) => {
    onNavigate?.(routeName);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToSection = (sectionId) => {
    const scrollToTarget = () => {
      const target = document.getElementById(sectionId);
      if (!target) return;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    if (!landingSectionsAvailable) {
      onNavigate?.('landing');
      window.setTimeout(scrollToTarget, 120);
      return;
    }

    scrollToTarget();
  };

  if (!isPublic) {
    return (
      <footer id="Footer" className="footer-compact">
        <span>&copy; {year} BARK | National University Laguna</span>
      </footer>
    );
  }

  return (
    <footer id="Footer">
      <div className="footer-inner">
        <section className="footer-brand" aria-label="BARK summary">
          <p className="footer-kicker">NU Laguna Review Platform</p>
          <h2>BARK</h2>
          <p>
            Board Exam &amp; Review Kit supports faculty-managed mock exams,
            student review, and progress tracking for licensure preparation.
          </p>
        </section>

        <nav className="footer-links" aria-label="Footer navigation">
          <button type="button" onClick={() => goToSection('about')}>About</button>
          <button type="button" onClick={() => goToSection('programs')}>Programs</button>
          <button type="button" onClick={() => goToSection('mock-exams')}>Mock Exams</button>
        </nav>

        <section className="footer-meta" aria-label="Platform details">
          <span>National University Laguna</span>
          <span>Academic access only</span>
          <span>Faculty-curated content</span>
        </section>
      </div>

      <div className="footer-bottom">
        <span>&copy; {year} BARK. All rights reserved.</span>
        <button type="button" onClick={() => goToRoute('credits')}>View Credits</button>
      </div>
    </footer>
  );
}
