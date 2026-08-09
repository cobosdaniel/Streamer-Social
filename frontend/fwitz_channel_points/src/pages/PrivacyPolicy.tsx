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

export default function PrivacyPolicy() {
  return (
    <main style={styles.wrap}>
      <h1 style={styles.h1}>Privacy Policy</h1>
      <p style={styles.meta}>Effective {EFFECTIVE_DATE}</p>

      <div style={styles.notice}>
        This policy is written in plain language to explain what Fwitz Channel Points
        ("the Service") actually does. It is not a substitute for legal advice.
      </div>

      <h2 style={styles.h2}>1. Who this covers</h2>
      <p style={styles.p}>
        This policy applies to two kinds of people who interact with the Service:
      </p>
      <ul style={styles.ul}>
        <li>
          <strong>Streamers</strong> — Twitch broadcasters who sign in with Twitch to
          run leaderboards, streaks, and channel point rewards for their community.
        </li>
        <li>
          <strong>Viewers</strong> — people who redeem a tracked channel points reward
          on a streamer's Twitch channel. Viewers do not create an account with the
          Service and never sign in to it.
        </li>
      </ul>

      <h2 style={styles.h2}>2. Information we collect</h2>

      <h3 style={styles.h3}>From streamers</h3>
      <ul style={styles.ul}>
        <li>Your Twitch user ID and username, obtained via Twitch OAuth.</li>
        <li>
          An OAuth access token and refresh token, scoped to{" "}
          <code>channel:read:redemptions</code> — this is the only permission we
          request, and it only lets us read redemption events on your channel.
        </li>
        <li>Reward and schedule configuration you set up (e.g. which rewards feed the leaderboard, your streak schedule).</li>
        <li>A session token (cookie, or in local storage on browsers that block cross-site cookies) that keeps you signed in.</li>
      </ul>

      <h3 style={styles.h3}>From viewers</h3>
      <p style={styles.p}>
        We do not ask viewers for anything. Instead, whenever a viewer redeems a
        tracked channel points reward on a streamer's channel, Twitch's EventSub API
        tells us:
      </p>
      <ul style={styles.ul}>
        <li>the viewer's Twitch user ID and username,</li>
        <li>which reward was redeemed and when,</li>
        <li>and, if the streamer has a streak feature configured, a running count of check-ins.</li>
      </ul>
      <p style={styles.p}>
        We do not collect chat messages, watch time, IP addresses, or any other
        Twitch activity. The only viewer data we ever see is what Twitch sends us
        about a channel points redemption.
      </p>

      <h2 style={styles.h2}>3. How we use it</h2>
      <p style={styles.p}>
        Streamer and viewer data is used only to run the features the streamer has
        enabled — real-time redemption feeds, points leaderboards, and watch streaks
        — and to keep streamers signed in. We do not run ads, sell data, or share it
        with data brokers or analytics/advertising networks.
      </p>

      <h2 style={styles.h2}>4. Why viewer data doesn't require separate consent</h2>
      <p style={styles.p}>
        Redeeming a channel points reward is a voluntary, repeatable action a viewer
        takes on Twitch, on a streamer's public channel, using Twitch's own reward
        system. Recording that action is the entire point of the reward — it's how
        the leaderboard and streak features work. That processing happens under the
        streamer's Twitch account and is covered by the Twitch Terms of Service and
        Twitch Privacy Policy that the viewer already agreed to by using Twitch.
      </p>

      <h2 style={styles.h2}>5. Sharing</h2>
      <p style={styles.p}>We share data with:</p>
      <ul style={styles.ul}>
        <li><strong>Twitch</strong> — to authenticate streamers and receive redemption events, via Twitch's own API.</li>
        <li><strong>Our hosting providers</strong> (application hosting and database hosting) — solely to run the Service's servers and store data securely. They do not use the data for their own purposes.</li>
      </ul>
      <p style={styles.p}>We never sell personal data.</p>

      <h2 style={styles.h2}>6. How long we keep data</h2>
      <p style={styles.p}>
        Streamer account data and the redemption/streak history collected on their
        channel are kept until the streamer deletes their account, or until a
        deletion request is honored under Section 7. There is no separate retention
        timer — this is a small, self-hosted tool, not a data warehouse.
      </p>

      <h2 style={styles.h2}>7. Your rights and how to delete data</h2>

      <h3 style={styles.h3}>If you're a streamer</h3>
      <p style={styles.p}>
        You can permanently delete your account at any time from your profile menu
        in the dashboard ("Delete Account"). This immediately revokes our access to
        your Twitch token and erases your account, your reward/schedule
        configuration, and every redemption and streak record collected on your
        channel. This action cannot be undone.
      </p>

      <h3 style={styles.h3}>If you're a viewer</h3>
      <p style={styles.p}>
        Since viewers don't have accounts with us, there's no self-service deletion
        button for you to use. To request that your redemption or streak history be
        deleted, email <a style={styles.a} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> with
        the streamer's channel and your Twitch username, and we'll remove the
        matching records.
      </p>
      <div style={styles.callout}>
        <strong>A limit worth being upfront about:</strong> your redemption/streak
        data only exists because you redeemed a channel points reward. Deleting past
        records doesn't and can't prevent new ones — if you keep redeeming the same
        reward on that channel afterward, it will be tracked again, because tracking
        it is what the reward does. The only way to avoid being tracked at all is to
        not redeem the rewards that power the leaderboard/streak feature on that
        channel.
      </div>

      <h2 style={styles.h2}>8. Cookies and local storage</h2>
      <p style={styles.p}>
        We use a single first-party session cookie (or, on browsers that block
        cross-site cookies, an equivalent value in local storage) to keep streamers
        signed in. We don't use third-party analytics, advertising, or tracking
        cookies.
      </p>

      <h2 style={styles.h2}>9. Security</h2>
      <p style={styles.p}>
        Your Twitch tokens and account data are stored on our servers and used only
        to call Twitch's API on your behalf. They are never exposed to viewers or
        other streamers. We restrict access to the database and infrastructure to
        what's needed to run the Service.
      </p>

      <h2 style={styles.h2}>10. Children's privacy</h2>
      <p style={styles.p}>
        Twitch requires account holders to be at least 13 years old, and we rely on
        that. We don't knowingly collect data from anyone under 13. If you believe we
        have, contact us and we'll delete it.
      </p>

      <h2 style={styles.h2}>11. Changes to this policy</h2>
      <p style={styles.p}>
        If we materially change what we collect or how we use it, we'll update the
        effective date at the top of this page.
      </p>

      <h2 style={styles.h2}>12. Contact</h2>
      <p style={styles.p}>
        Questions or deletion requests: <a style={styles.a} href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </main>
  );
}
