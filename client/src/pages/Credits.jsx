import '../styles/Credits.css';

const developers = [
  'Christian Chad Villamor',
  'Carl Wayne Oliva',
  'Justherine Mae Benavides',
  'Neil Vhanjo Barroca'
];

export default function Credits({ onNavigate }) {
  return (
    <div className="credits-page">
      <section className="credits-hero">
        <div className="credits-hero-copy">
          <span className="credits-eyebrow">Project Credits</span>
          <h1>Built by the BARK development team.</h1>
          <p>
            The individuals who contributed to the development of the Board Exam &amp; Review Kit 
            for National University Laguna.
          </p>
          <button type="button" onClick={() => onNavigate?.('Dashboard')}>
            Back to Home
          </button>
        </div>
      </section>

      <section className="credits-panel" aria-label="Development team">
        <div className="credits-section-heading">
          <span>Development Team</span>
          <h2>Creators</h2>
        </div>

        <div className="credits-grid">
          {developers.map((name, index) => (
            <article className="credit-person" key={name}>
              <span className="credit-number">{String(index + 1).padStart(2, '0')}</span>
              <h3>{name}</h3>
              <p>Developer</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
