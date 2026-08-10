import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import { Metadata } from "next";

interface PageProps {
  params: Promise<{
    prefix: string;
  }>;
}

// App Store URL
const APP_STORE_URL = "https://apps.apple.com/us/app/junjun-study-community/id6798144458";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { prefix } = await params;
  const user = await prisma.user.findFirst({
    where: { id: { startsWith: prefix } },
    select: { name: true },
  });

  if (!user) {
    return {
      title: "User Not Found - JunJun",
    };
  }

  return {
    title: `${user.name || "User"} - JunJun`,
    description: "Study Community JunJun",
  };
}

export default async function UserLinkPage({ params }: PageProps) {
  const { prefix } = await params;

  const user = await prisma.user.findFirst({
    where: { id: { startsWith: prefix } },
    select: {
      id: true,
      name: true,
      iconEmoji: true,
      iconBackgroundColor: true,
    },
  });

  if (!user) {
    notFound();
  }

  const emoji = user.iconEmoji || "👤";
  const bgColor = user.iconBackgroundColor || "#e2e8f0";
  const name = user.name || "User";

  const appSchemeLink = `junjun://u/${prefix}`;

  return (
    <main style={styles.container}>
      {/* Keyframe animation for spinner */}
      <style>{`
        @keyframes spinnerRotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        .loading-spinner {
          display: inline-block;
          width: 18px;
          height: 18px;
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          border-top-color: #ffffff;
          animation: spinnerRotate 0.8s linear infinite;
          vertical-align: middle;
        }
      `}</style>

      <div style={styles.content}>
        {/* Header: Study Community (small) & JunJun (large) above profile */}
        <div style={styles.headerSection}>
          <p style={styles.subTitle}>Study Community</p>
          <h2 style={styles.brandTitle}>JunJun</h2>
        </div>

        {/* Profile Section */}
        <div
          style={{
            ...styles.iconContainer,
            backgroundColor: bgColor,
          }}
        >
          <span style={styles.iconEmoji}>{emoji}</span>
        </div>
        <h1 style={styles.name}>{name}</h1>

        {/* Action Button & Platform Note */}
        <div style={styles.actionSection}>
          <a
            href={appSchemeLink}
            id="open-in-app-btn"
            style={styles.primaryButton}
          >
            <span id="btn-text">Open in App</span>
            <span id="btn-spinner" style={{ display: "none" }} className="loading-spinner" />
          </a>
          <p style={styles.platformNote}>
            Available only on iOS, iPadOS, macOS, and visionOS.
          </p>
        </div>
      </div>

      {/* Inline script to handle spinner stop after transition */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            function resetBtn() {
              var btnText = document.getElementById('btn-text');
              var btnSpinner = document.getElementById('btn-spinner');
              if (btnText && btnSpinner) {
                btnText.style.display = 'inline';
                btnSpinner.style.display = 'none';
              }
            }

            document.getElementById('open-in-app-btn')?.addEventListener('click', function() {
              var btnText = document.getElementById('btn-text');
              var btnSpinner = document.getElementById('btn-spinner');
              if (btnText && btnSpinner) {
                btnText.style.display = 'none';
                btnSpinner.style.display = 'inline-block';
              }
              var start = Date.now();
              setTimeout(function() {
                if (Date.now() - start < 2500 && !document.hidden) {
                  window.location.href = "${APP_STORE_URL}";
                }
                setTimeout(resetBtn, 2000);
              }, 1500);
            });

            window.addEventListener('pageshow', resetBtn);
            window.addEventListener('focus', resetBtn);
            document.addEventListener('visibilitychange', function() {
              if (!document.hidden) {
                resetBtn();
              }
            });
          `,
        }}
      />
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    color: "#0f172a",
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    padding: "24px",
    margin: 0,
  },
  content: {
    width: "100%",
    maxWidth: "320px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },
  headerSection: {
    marginBottom: "32px",
  },
  subTitle: {
    fontSize: "12px",
    fontWeight: 500,
    color: "#64748b",
    letterSpacing: "0.02em",
    margin: "0 0 2px 0",
  },
  brandTitle: {
    fontSize: "32px",
    fontWeight: 800,
    color: "#0f172a",
    letterSpacing: "-0.03em",
    margin: 0,
  },
  iconContainer: {
    width: "88px",
    height: "88px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "16px",
  },
  iconEmoji: {
    fontSize: "44px",
    lineHeight: 1,
  },
  name: {
    fontSize: "22px",
    fontWeight: 700,
    color: "#0f172a",
    margin: "0 0 32px 0",
  },
  actionSection: {
    width: "100%",
  },
  primaryButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: "48px",
    backgroundColor: "#000000",
    color: "#ffffff",
    borderRadius: "12px",
    fontWeight: 600,
    fontSize: "15px",
    textDecoration: "none",
    boxSizing: "border-box",
  },
  platformNote: {
    fontSize: "12px",
    color: "#94a3b8",
    marginTop: "16px",
    marginBottom: 0,
    lineHeight: 1.4,
  },
};
