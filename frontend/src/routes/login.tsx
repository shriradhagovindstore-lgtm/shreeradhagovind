import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { toast } from "sonner";
import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import { DiwaliDecoration } from "@/components/DiwaliDecoration";
const defaultHeroBanner = "/home-devotional-hero.png";
const logo = "/brand-logo-large.png";

export const Route = createFileRoute("/login")({
  component: Login,
  head: () => ({
    meta: [
      { title: "Sign In - Shri Radha Govind Store" },
      { name: "description", content: "Sign in to your Shri Radha Govind Store account to view orders, wishlist and track shipments." },
      { property: "og:title", content: "Sign In - Shri Radha Govind Store" },
      { property: "og:url", content: "https://www.shriradhagovindstore.com/login" },
      { name: "robots", content: "noindex, nofollow" },
    ],
    links: [{ rel: "canonical", href: "https://www.shriradhagovindstore.com/login" }],
  }),
});

function Login() {
  const { login, sendLoginOtp, verifyLoginOtp, createPassword, loginGoogle } = useStore();
  const nav = useNavigate();

  // Mode: "otp" | "password"
  const [mode, setMode] = useState<"otp" | "password">("otp");

  // OTP Step: "email" | "otp" | "create_password"
  const [step, setStep] = useState<"email" | "otp" | "create_password">("email");

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [pw, setPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [show, setShow] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [setPasswordToken, setSetPasswordToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !pw) return;
    setLoading(true);
    try {
      await login(email, pw);
      nav({ to: "/orders" });
    } catch {
      /* toast shown in store */
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^\S+@\S+\.\S+$/.test(email.trim())) {
      toast.error("Please enter a valid email address");
      return;
    }
    setLoading(true);
    try {
      await sendLoginOtp(email.trim());
      setStep("otp");
      setResendCooldown(60);
    } catch {
      /* toast shown in store */
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || loading) return;
    setLoading(true);
    try {
      await sendLoginOtp(email.trim());
      setResendCooldown(60);
    } catch {
      /* toast shown in store */
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length < 4) {
      toast.error("Please enter the OTP sent to your email");
      return;
    }
    setLoading(true);
    try {
      const res = await verifyLoginOtp(email.trim(), cleanOtp);
      if (res.requiresPasswordSet && res.setPasswordToken) {
        setSetPasswordToken(res.setPasswordToken);
        setStep("create_password");
      } else {
        nav({ to: "/orders" });
      }
    } catch {
      /* toast shown in store */
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPw || newPw.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    if (newPw !== confirmPw) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await createPassword(setPasswordToken, newPw);
      nav({ to: "/orders" });
    } catch {
      /* toast shown in store */
    } finally {
      setLoading(false);
    }
  };

  // If setting password for auto-created account:
  if (step === "create_password") {
    return (
      <AuthShell
        title="Create Your Password"
        subtitle="Set a password so you can easily sign in to your account and access your orders."
      >
        <form onSubmit={handleCreatePassword} className="space-y-4">
          <Field
            icon={Lock}
            type={show ? "text" : "password"}
            placeholder="New Password (min 6 characters)"
            value={newPw}
            onChange={setNewPw}
            right={
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
          <Field
            icon={Lock}
            type={showConfirm ? "text" : "password"}
            placeholder="Confirm Password"
            value={confirmPw}
            onChange={setConfirmPw}
            right={
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="text-muted-foreground hover:text-foreground"
              >
                {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-full bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Creating Password..." : "Create Password & Access Orders"}
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle={
        mode === "otp"
          ? step === "otp"
            ? `Enter the 6-digit code sent to ${email}`
            : "Sign in with Email OTP or password"
          : "Sign in with your password"
      }
    >
      <GoogleSignInButton
        onCredential={async (credential) => {
          try {
            await loginGoogle(credential);
            nav({ to: "/orders" });
          } catch {
            /* toast shown in store */
          }
        }}
      />
      <Divider />

      {/* Mode Switch Tabs */}
      <div className="flex rounded-full bg-muted p-1 mb-6 text-sm font-medium">
        <button
          type="button"
          onClick={() => {
            setMode("otp");
            setStep("email");
          }}
          className={`flex-1 py-2 rounded-full transition ${
            mode === "otp"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Email OTP Sign-in
        </button>
        <button
          type="button"
          onClick={() => setMode("password")}
          className={`flex-1 py-2 rounded-full transition ${
            mode === "password"
              ? "bg-white text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Password Sign-in
        </button>
      </div>

      {mode === "otp" ? (
        step === "email" ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <Field
              icon={Mail}
              type="email"
              placeholder="Enter your email address"
              value={email}
              onChange={setEmail}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-full bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Sending OTP..." : "Send OTP"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-4">
            <Field
              icon={Lock}
              type="text"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={setOtp}
              maxLength={6}
            />
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <button
                type="button"
                onClick={() => setStep("email")}
                className="text-primary hover:underline font-medium"
              >
                Change email ({email})
              </button>
              <button
                type="button"
                disabled={resendCooldown > 0 || loading}
                onClick={handleResendOtp}
                className="text-primary hover:underline font-medium disabled:text-muted-foreground disabled:no-underline"
              >
                {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend OTP"}
              </button>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full h-12 rounded-full bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Verifying..." : "Verify OTP & Continue"}
            </button>
          </form>
        )
      ) : (
        <form onSubmit={handlePasswordSubmit} className="space-y-3">
          <Field
            icon={Mail}
            type="email"
            placeholder="Email address"
            value={email}
            onChange={setEmail}
          />
          <Field
            icon={Lock}
            type={show ? "text" : "password"}
            placeholder="Password"
            value={pw}
            onChange={setPw}
            right={
              <button
                type="button"
                onClick={() => setShow(!show)}
                className="text-muted-foreground hover:text-foreground"
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />
          <div className="text-right">
            <Link to="/forgot-password" className="text-sm font-medium text-primary">
              Forgot password?
            </Link>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-full bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      )}

      <p className="text-center text-sm text-muted-foreground mt-6">
        New here?{" "}
        <Link to="/signup" className="text-primary font-medium">
          Create account
        </Link>
      </p>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const { settings } = useStore();
  const heroBanner = settings?.homeHeroImage?.trim() || defaultHeroBanner;

  return (
    <div className="min-h-screen grid lg:grid-cols-2 relative">
      <DiwaliDecoration isAuth />
      <div className="hidden lg:block relative overflow-hidden bg-slate-900">
        <img
          src={heroBanner}
          className="absolute inset-0 h-full w-full object-cover object-center opacity-90"
          alt="Shri Radha Govind Devotional"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
        <div className="absolute bottom-10 left-10 text-white z-10">
          <p className="font-display text-5xl">॥ Hare Krishna ॥</p>
          <p className="mt-2 text-white/90 max-w-sm text-sm">Authentic sacred products delivered from the holy land of Vrindavan.</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <Link to="/" className="flex items-center gap-2.5 mb-8">
            <img src={logo} alt="Shri Radha Govind Store" className="h-10 w-10 rounded-full object-cover ring-1 ring-primary/30" />
            <span className="font-display text-xl">Shri Radha Govind Store</span>
          </Link>
          <h1 className="font-display text-4xl">{title}</h1>
          <p className="text-muted-foreground mt-2 mb-8">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

type FieldProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
  icon: React.ComponentType<{ className?: string }>;
  right?: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
};
export function Field({ icon: Icon, right, value, onChange, ...rest }: FieldProps) {
  return (
    <div className="relative">
      <Icon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <input {...rest} value={value} onChange={(e) => onChange(e.target.value)} className="w-full h-12 pl-11 pr-11 rounded-full border bg-card focus:outline-none focus:border-primary" />
      {right && <div className="absolute right-4 top-1/2 -translate-y-1/2">{right}</div>}
    </div>
  );
}
export function Divider() {
  return <div className="my-6 flex items-center gap-4"><div className="flex-1 h-px bg-border" /><span className="text-xs text-muted-foreground uppercase tracking-wider">or</span><div className="flex-1 h-px bg-border" /></div>;
}
export function GoogleIcon() {
  return <svg className="h-5 w-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"/></svg>;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export function GoogleSignInButton({ onCredential, text = "continue_with" }: {
  onCredential: (credential: string) => void | Promise<void>;
  text?: "continue_with" | "signup_with";
}) {
  const container = useRef<HTMLDivElement>(null);
  const clientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();

  useEffect(() => {
    if (!clientId || !container.current) return;
    const render = () => {
      if (!window.google || !container.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: ({ credential }) => void onCredential(credential),
      });
      container.current.replaceChildren();
      window.google.accounts.id.renderButton(container.current, {
        type: "standard", theme: "outline", size: "large", shape: "pill",
        text, width: Math.min(container.current.clientWidth || 400, 400),
      });
    };

    const existing = document.querySelector<HTMLScriptElement>('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      if (window.google) render();
      else existing.addEventListener("load", render, { once: true });
      return () => existing.removeEventListener("load", render);
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.addEventListener("load", render, { once: true });
    document.head.appendChild(script);
    return () => script.removeEventListener("load", render);
  }, [clientId, onCredential, text]);

  if (!clientId) return <p className="text-sm text-destructive">Google sign-in is not configured.</p>;
  return <div ref={container} className="w-full min-h-11 flex justify-center" />;
}

