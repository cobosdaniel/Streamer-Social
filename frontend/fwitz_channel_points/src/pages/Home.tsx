import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  SOCIALS,
  TIP_LINK,
  TWITCH_URL,
  CONTACT_EMAIL,
} from "../components/socials";

type HomeProps = {
  isAuthenticated: boolean;
};

const ABOUT_TAGS = [
  "Gaming",
  "Streamer",
  "Community-First",
  "Interactive Rewards",
  "Good Vibes",
];

const FEATURES = [
  {
    icon: "🎁",
    title: "Channel Point Rewards",
    text: "Redeem custom rewards live and help shape where the stream goes next.",
  },
  {
    icon: "🔥",
    title: "Watch Streaks",
    text: "Check in every stream to build your streak — and defend your spot.",
  },
  {
    icon: "🏆",
    title: "Leaderboards",
    text: "Earn points for placements and climb the ranks against the community.",
  },
  {
    icon: "⚡",
    title: "Live Tracking",
    text: "Redemptions update in real time on the dashboard while we're live.",
  },
];

export default function Home({ isAuthenticated }: HomeProps) {
  return (
    <main className="home">
      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="hero">
        <span className="hero-eyebrow">✦ Live on Twitch</span>
        <h1 className="hero-title">Fwitz</h1>
        <div className="hero-subtitle">Twitch streamer &amp; content creator</div>
        <p className="hero-text">
          Hang out, redeem channel points, climb the leaderboards, and keep your
          watch streak alive. This is home base for everything I make — and the
          rewards that make my streams interactive.
        </p>

        <div className="hero-actions">
          <a
            className="primary-btn"
            href={TWITCH_URL}
            target="_blank"
            rel="noreferrer"
          >
            Watch on Twitch
          </a>
          {isAuthenticated ? (
            <Link to="/dashboard" className="secondary-btn">
              Go to Dashboard
            </Link>
          ) : (
            <a href="#socials" className="secondary-btn">
              Find me online
            </a>
          )}
        </div>
      </section>

      {/* ── About ────────────────────────────────────────────── */}
      <section id="about" className="section-card home-section">
        <div className="about-grid">
          <div className="about-text">
            <span className="section-eyebrow">About</span>
            <h2 className="section-title">Hey, I'm Fwitz 👋</h2>
            <p className="section-text">
              I'm a Marvel Rivals streamer who loves to share my whimsical
              personality with my chat. Whether we're grinding a new
              game, chatting, or simply being fat chuds, the goal is always the same:
              a welcoming space where the community can thrive!
            </p>
            <p className="section-text">
              Channel points can be a big part of that. Every reward, streak, and
              leaderboard spot is a way for you to jump in, leave your mark, and
              keep things fun stream after stream.
            </p>
            <div className="tag-row">
              {ABOUT_TAGS.map((tag) => (
                <span key={tag} className="tag">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <aside className="about-aside">
            <div className="aside-label">Catch a stream</div>
            <p className="aside-text">
              Follow on Twitch so you never miss when I go live.
            </p>
            <a
              className="primary-btn aside-btn"
              href={TWITCH_URL}
              target="_blank"
              rel="noreferrer"
            >
              Follow on Twitch
            </a>
            <a className="aside-tip" href={TIP_LINK} target="_blank" rel="noreferrer">
              ♥ Tip / Support
            </a>
          </aside>
        </div>
      </section>

      {/* ── Features ─────────────────────────────────────────── */}
      <section className="home-section features">
        <div className="features-head">
          <span className="section-eyebrow">Channel Points</span>
          <h2 className="section-title">Make every stream count</h2>
          <p className="section-text">
            The rewards system that keeps streams interactive — all tracked in
            real time.
          </p>
        </div>
        <div className="feature-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature-card">
              <div className="feature-icon">{f.icon}</div>
              <h3 className="feature-title">{f.title}</h3>
              <p className="feature-text">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Socials ──────────────────────────────────────────── */}
      <section id="socials" className="section-card home-section">
        <span className="section-eyebrow">Socials</span>
        <h2 className="section-title">Find me online</h2>
        <p className="section-text">
          New videos, clips, and announcements drop across all platforms — come
          say hi wherever you hang out.
        </p>
        <div className="socials-grid">
          {SOCIALS.map((s) => (
            <a
              key={s.name}
              href={s.href}
              target="_blank"
              rel="noreferrer"
              className="social-card"
              style={{ "--brand": s.color } as CSSProperties}
            >
              <span className="social-card-icon">{s.icon}</span>
              <span className="social-card-meta">
                <span className="social-card-name">{s.name}</span>
                <span className="social-card-handle">{s.handle}</span>
              </span>
            </a>
          ))}
        </div>
      </section>

      {/* ── Contact ──────────────────────────────────────────── */}
      <section id="contact" className="section-card home-section">
        <span className="section-eyebrow">Contact</span>
        <h2 className="section-title">Get in touch</h2>
        <p className="section-text">
          Business inquiries, collabs, or just want to say hello? Reach out by
          email or slide into the DMs on any of my socials above.
        </p>
        <div className="contact-row">
          <a className="contact-card" href={`mailto:${CONTACT_EMAIL}`}>
            <span className="contact-card-label">Email</span>
            <span className="contact-card-value">{CONTACT_EMAIL}</span>
          </a>
          <a
            className="contact-card contact-card-tip"
            href={TIP_LINK}
            target="_blank"
            rel="noreferrer"
          >
            <span className="contact-card-label">Support</span>
            <span className="contact-card-value">♥ Donations &amp; Tips</span>
          </a>
        </div>
      </section>
    </main>
  );
}
