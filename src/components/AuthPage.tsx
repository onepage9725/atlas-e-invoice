import { useState } from "react";
import { supabase } from "../lib/supabaseClient";

type AuthPageProps = {
  isPasswordRecovery?: boolean;
  onPasswordResetComplete?: () => void;
};

export function AuthPage({ isPasswordRecovery = false, onPasswordResetComplete }: AuthPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetEmailSubmitting, setIsResetEmailSubmitting] = useState(false);

  const getPasswordResetRedirectUrl = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("reset_password", "true");
    url.hash = "";
    return url.toString();
  };

  const clearPasswordResetQuery = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("reset_password");
    url.hash = "";
    const nextSearch = url.searchParams.toString();
    const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}`;
    window.history.replaceState({}, document.title, nextUrl);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setIsSubmitting(false);
      return;
    }

    const userId = data.user?.id ?? data.session?.user.id ?? null;
    if (userId) {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("id", userId)
        .single();

      if (!profileError && profileData?.is_active === false) {
        await supabase.auth.signOut();
        const inactiveMessage = "This account is deactivated. To activate it again, please let an admin activate your account.";
        window.alert(inactiveMessage);
        setError(inactiveMessage);
        setIsSubmitting(false);
        return;
      }
    }

    setIsSubmitting(false);
  };

  const handleForgotPassword = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setError("Please enter your email first, then click Forgot password.");
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setIsResetEmailSubmitting(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: getPasswordResetRedirectUrl(),
    });

    if (resetError) {
      setError(resetError.message);
      setIsResetEmailSubmitting(false);
      return;
    }

    setSuccessMessage("Password reset email sent. Please check your inbox.");
    setIsResetEmailSubmitting(false);
  };

  const handlePasswordReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccessMessage(null);

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });

    if (updateError) {
      setError(updateError.message);
      setIsSubmitting(false);
      return;
    }

    await supabase.auth.signOut();
    clearPasswordResetQuery();
    setSuccessMessage("Password updated successfully. Please login with your new password.");
    setNewPassword("");
    setConfirmPassword("");
    setIsSubmitting(false);
    onPasswordResetComplete?.();
  };

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cover bg-center px-6"
      style={{ backgroundImage: "url('/atlaslogin.png')" }}
    >
      <div className="absolute inset-0 bg-slate-950/45" />

      <div className="relative w-full max-w-md rounded-3xl border border-white/30 bg-white/18 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-6 text-center">
          <img
            src="/AOGfavicon.png"
            alt="ATLAS OLSEN logo"
            className="mx-auto mb-4 h-20 w-20 rounded-full border border-white/80 bg-white p-1.5 object-contain shadow-lg"
          />
          <h1 className="text-2xl font-bold text-white">ATLAS OLSEN</h1>
          <p className="mt-2 text-sm text-white/85">
            {isPasswordRecovery ? "Set your new password" : "Sign in to your account"}
          </p>
        </div>

        <form onSubmit={isPasswordRecovery ? handlePasswordReset : handleSubmit} className="space-y-4">
          {isPasswordRecovery ? (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-white">New password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full rounded-xl border border-white/45 bg-white/85 p-2.5 text-sm text-gray-900 placeholder:text-gray-500 outline-none focus:border-white focus:ring-1 focus:ring-white/70"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-white">Confirm new password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  placeholder="Re-enter your new password"
                  className="w-full rounded-xl border border-white/45 bg-white/85 p-2.5 text-sm text-gray-900 placeholder:text-gray-500 outline-none focus:border-white focus:ring-1 focus:ring-white/70"
                  required
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium text-white">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  className="w-full rounded-xl border border-white/45 bg-white/85 p-2.5 text-sm text-gray-900 placeholder:text-gray-500 outline-none focus:border-white focus:ring-1 focus:ring-white/70"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-white">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Minimum 6 characters"
                  className="w-full rounded-xl border border-white/45 bg-white/85 p-2.5 text-sm text-gray-900 placeholder:text-gray-500 outline-none focus:border-white focus:ring-1 focus:ring-white/70"
                  required
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={isSubmitting || isResetEmailSubmitting}
                  className="text-sm font-medium text-white/90 underline underline-offset-2 transition hover:text-white disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isResetEmailSubmitting ? "Sending..." : "Forgot password?"}
                </button>
              </div>
            </>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50/95 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/95 px-3 py-2 text-sm text-emerald-700">
              {successMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || isResetEmailSubmitting}
            className="w-full rounded-xl border border-white/55 bg-white/20 py-2.5 text-sm font-medium text-white shadow-lg shadow-black/20 backdrop-blur-md transition hover:bg-white/28 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? "Please wait..." : isPasswordRecovery ? "Update password" : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
