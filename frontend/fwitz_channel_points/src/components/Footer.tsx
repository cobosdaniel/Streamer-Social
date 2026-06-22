import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import { SOCIALS, TIP_LINK, CONTACT_EMAIL } from "./socials";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="site-footer">
      <div className="footer-inner">
        {/* Brand + support */}
        <div className="footer-col footer-brand-col">
          <div className="footer-brand">Fwitz</div>
          <p className="footer-tagline">
            Twitch streamer building a fun, interactive community—
            powered by channel points, streaks, and good vibes.
          </p>
          <a
            className="footer-tip"
            href={TIP_LINK}
            target="_blank"
            rel="noreferrer"
          >
            ♥ Support the stream
          </a>
        </div>

        {/* Quick links */}
        <div className="footer-col">
          <h4 className="footer-heading">Explore</h4>
          <nav className="footer-links">
            <Link to="/">Home</Link>
            <Link to="/#about">About</Link>
            <Link to="/#contact">Contact</Link>
            <Link to="/dashboard">Dashboard</Link>
          </nav>
        </div>

        {/* Socials + contact */}
        <div className="footer-col">
          <h4 className="footer-heading">Find me online</h4>
          <div className="footer-socials">
            {SOCIALS.map((s) => (
              <a
                key={s.name}
                href={s.href}
                target="_blank"
                rel="noreferrer"
                aria-label={s.name}
                title={s.name}
                className="social-icon"
                style={{ "--brand": s.color } as CSSProperties}
              >
                {s.icon}
              </a>
            ))}
          </div>
          <a className="footer-email" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <span>© {year} Fwitz. All rights reserved.</span>
        <span className="footer-meta">Fwitz Channel Points Dashboard</span>
      </div>
    </footer>
  );
}
