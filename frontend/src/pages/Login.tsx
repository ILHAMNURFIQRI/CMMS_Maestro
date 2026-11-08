import { useState, type FormEvent } from "react";
import { Activity, LockKeyhole } from "lucide-react";
import { useNavigate } from "react-router-dom";

type DemoRole = "manager" | "operator" | "customer";

const API_ORIGIN = import.meta.env.VITE_API_URL || "http://localhost:8000";

const demoRoles: { role: DemoRole; label: string; path: string }[] = [
  { role: "manager", label: "Manager", path: "/app" },
  { role: "operator", label: "Operator", path: "/app/fleet" },
  { role: "customer", label: "Customer", path: "/customer" },
];

export const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API_ORIGIN}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body: unknown = await response.json().catch(() => null);
        const detail =
          typeof body === "object" &&
          body !== null &&
          "detail" in body &&
          typeof body.detail === "string"
            ? body.detail
            : `Login failed (${response.status})`;
        throw new Error(detail);
      }

      const result = (await response.json()) as {
        user: { role: DemoRole };
      };
      sessionStorage.removeItem("maestro_demo_role");
      sessionStorage.setItem("maestro_auth_role", result.user.role);
      navigate(result.user.role === "customer" ? "/customer" : "/app");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Could not connect to the backend",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const startDemo = (role: DemoRole, path: string) => {
    sessionStorage.removeItem("maestro_auth_role");
    sessionStorage.setItem("maestro_demo_role", role);
    setError(null);
    navigate(path);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-neo-bg p-6">
      <section className="neo-card w-full max-w-2xl bg-white p-8 md:p-10">
        <div className="mb-8 flex items-center gap-3">
          <Activity size={32} strokeWidth={3} />
          <div>
            <h1 className="m-0 text-3xl font-black tracking-widest">MAESTRO</h1>
            <p className="m-0 font-mono text-xs font-bold">CMMS &amp; PRODUCTION</p>
          </div>
        </div>

        <h2 className="mb-2 text-2xl">Sign in</h2>
        <p className="mb-6 font-mono text-sm text-neo-muted">
          Use the account provided by your manager.
        </p>

        <form className="space-y-4" onSubmit={(event) => void submit(event)}>
          <label className="block font-mono text-sm font-bold">
            EMAIL
            <input
              autoComplete="username"
              className="mt-1 w-full border-[3px] border-neo-black p-3 font-sans"
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label className="block font-mono text-sm font-bold">
            PASSWORD
            <input
              autoComplete="current-password"
              className="mt-1 w-full border-[3px] border-neo-black p-3 font-sans"
              type="password"
              required
              maxLength={256}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error && (
            <p className="border-2 border-neo-black bg-red-100 p-3 font-mono text-sm text-red-800">
              {error}
            </p>
          )}
          <button
            className="neo-btn neo-btn-primary flex w-full items-center justify-center gap-2"
            disabled={submitting}
            type="submit"
          >
            <LockKeyhole size={16} />
            {submitting ? "SIGNING IN..." : "SIGN IN"}
          </button>
        </form>

        <div className="mt-5 text-center font-mono text-xs text-neo-muted">
          <span>Simulasi login sebagai: </span>
          {demoRoles.map(({ role, label, path }, index) => (
            <span key={role}>
              <button
                className="font-black text-neo-blue underline underline-offset-2 hover:text-neo-black"
                onClick={() => startDemo(role, path)}
                type="button"
              >
                {label}
              </button>
              {index < demoRoles.length - 1 && <span> · </span>}
            </span>
          ))}
          <p className="mb-0 mt-2">
            Pilihan simulasi hanya untuk melihat tampilan role, bukan login akun
            sebenarnya.
          </p>
        </div>
      </section>
    </main>
  );
};
