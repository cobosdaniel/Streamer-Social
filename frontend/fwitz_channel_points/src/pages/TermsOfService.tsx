import { Link } from "react-router-dom";
import { CONTACT_EMAIL } from "../components/socials";

const EFFECTIVE_DATE = "August 8, 2026";

const styles = {
  wrap: {
    maxWidth: "760px",
    margin: "0 auto",
    padding: "48px 24px 80px",
    color: "#e6e6e9",
    lineHeight: 1.65,
  },
  h1: {
    fontSize: "clamp(28px, 4vw, 38px)",
    marginBottom: "4px",
    color: "#fff",
  },
  meta: {
    color: "rgba(255,255,255,0.55)",
    fontSize: "14px",
    marginBottom: "28px",
  },
  notice: {
    background: "rgba(145,71,255,0.1)",
    border: "1px solid rgba(145,71,255,0.35)",
    borderRadius: "12px",
    padding: "14px 16px",
    fontSize: "14px",
    color: "#d8c9ff",
    marginBottom: "36px",
  },
  h2: {
    fontSize: "20px",
    color: "#fff",
    marginTop: "36px",
    marginBottom: "10px",
  },
  h3: {
    fontSize: "16px",
    color: "#fff",
    marginTop: "20px",
    marginBottom: "8px",
  },
  p: {
    color: "#cfcfd2",
    fontSize: "15px",
    marginBottom: "12px",
  },
  ul: {
    color: "#cfcfd2",
    fontSize: "15px",
    marginBottom: "12px",
    paddingLeft: "20px",
  },
  callout: {
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "12px",
    padding: "14px 16px",
    fontSize: "14.5px",
    color: "#cfcfd2",
    margin: "12px 0",
  },
  a: { color: "#c4a4ff" },
} as const;

export default function TermsOfService() {
  return (
    <main style={styles.wrap}>
      <h1 style={styles.h1}>Terms of Service</h1>
      <p style={styles.meta}>Effective {EFFECTIVE_DATE}</p>

      <div style={styles.notice}>
        This is a plain-language agreement for a small, independently-run tool. It is
        not a substitute for legal advice.
      </div>

      <h2 style={styles.h2}>1. Acceptance of these terms</h2>
      <p style={styles.p}>
        By signing in with Twitch or otherwise using Fwitz Channel Points ("the
        Service"), you agree to these Terms of Service and to our{" "}
        <Link style={styles.a} to="/privacy">Privacy Policy</Link>. If you don't
        agree, don't use the Service.
      </p>

      <h2 style={styles.h2}>2. What the Service is</h2>
      <p style={styles.p}>
        The Service is a companion app for Twitch streamers. Streamers sign in with
        Twitch to run channel-points-driven leaderboards, streaks, and reward
        tracking for their community. Viewers don't sign in — the Service reads
        channel points redemption events from Twitch to power those features.
      </p>

      <h2 style={styles.h2}>3. Not affiliated with Twitch</h2>
      <p style={styles.p}>
        The Service is an independent, third-party tool built on Twitch's public
        API. It is not operated, endorsed, or certified by Twitch Interactive, Inc.
        Your use of Twitch itself is governed by Twitch's own Terms of Service and
        Privacy Policy, which you must also follow.
      </p>

      <h2 style={styles.h2}>4. Eligibility</h2>
      <p style={styles.p}>
        You must meet Twitch's own minimum age requirement (currently 13) to use
        Twitch, and by extension to use this Service. Streamers must have a Twitch
        account in good standing to sign in.
      </p>

      <h2 style={styles.h2}>5. Streamer accounts</h2>
      <ul style={styles.ul}>
        <li>
          You're responsible for the reward and schedule configuration you set up,
          and for how you present leaderboard/streak data to your community.
        </li>
        <li>
          You authorize the Service to read channel points redemption events on your
          channel via the <code>channel:read:redemptions</code> Twitch scope — that's
          the only permission we request.
        </li>
        <li>
          You can revoke access and permanently delete your account and all data
          collected on your channel at any time from your dashboard's profile menu.
        </li>
      </ul>

      <h2 style={styles.h2}>6. Acceptable use</h2>
      <p style={styles.p}>You agree not to:</p>
      <ul style={styles.ul}>
        <li>use the Service to harass, deceive, or retaliate against viewers based on their redemption or streak history;</li>
        <li>attempt to access another streamer's account or data;</li>
        <li>interfere with, overload, or reverse-engineer the Service beyond what's needed for ordinary use;</li>
        <li>use the Service in a way that violates Twitch's Developer Services Agreement or Terms of Service.</li>
      </ul>

      <h2 style={styles.h2}>7. Viewer data</h2>
      <p style={styles.p}>
        Redemption and streak data collected about viewers belongs to the context of
        the streamer's channel and is used only to power the features described in
        our <Link style={styles.a} to="/privacy">Privacy Policy</Link>. Streamers should
        review that policy, since deleting their account deletes that data too.
      </p>

      <h2 style={styles.h2}>8. Service availability</h2>
      <p style={styles.p}>
        The Service is provided "as is" and "as available," with no guarantee of
        uptime or accuracy. It depends on Twitch's own API and EventSub
        infrastructure, which can change, rate-limit, or go down independent of
        anything we do. We may modify, suspend, or discontinue features — or the
        whole Service — at any time.
      </p>

      <h2 style={styles.h2}>9. Limitation of liability</h2>
      <p style={styles.p}>
        To the fullest extent permitted by law, the Service and its operator are not
        liable for indirect, incidental, or consequential damages arising from your
        use of it — including lost data, lost leaderboard history, or disputes
        between a streamer and their viewers over rewards or streaks.
      </p>

      <h2 style={styles.h2}>10. Termination</h2>
      <p style={styles.p}>
        You may stop using the Service and delete your account at any time. We may
        suspend or terminate access for accounts that violate these terms, Twitch's
        own policies, or applicable law.
      </p>

      <h2 style={styles.h2}>11. Changes to these terms</h2>
      <p style={styles.p}>
        If we materially change these terms, we'll update the effective date at the
        top of this page.
      </p>

      <h2 style={styles.h2}>12. Contact</h2>
      <p style={styles.p}>
        Questions about these terms: <a style={styles.a} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </main>
  );
}
