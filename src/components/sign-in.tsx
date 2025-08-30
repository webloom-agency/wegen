"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useObjectState } from "@/hooks/use-object-state";

import { Loader } from "lucide-react";
import { safe } from "ts-safe";
import { authClient } from "auth/client";
import { toast } from "sonner";
import { GithubIcon } from "ui/github-icon";
import { GoogleIcon } from "ui/google-icon";
import { useTranslations } from "next-intl";
import { MicrosoftIcon } from "ui/microsoft-icon";
import { SocialAuthenticationProvider } from "app-types/authentication";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "ui/dialog";

export default function SignIn({
  emailAndPasswordEnabled,
  signUpEnabled,
  socialAuthenticationProviders,
}: {
  emailAndPasswordEnabled: boolean;
  signUpEnabled: boolean;
  socialAuthenticationProviders: SocialAuthenticationProvider[];
}) {
  const t = useTranslations("Auth.SignIn");

  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

  const [formData, setFormData] = useObjectState({
    email: "",
    password: "",
  });

  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  const resendVerification = async () => {
    if (!formData.email) {
      toast.error("Enter your email first");
      return;
    }
    await authClient
      .sendVerificationEmail({ email: formData.email, callbackURL: "/" })
      .then(() => toast.success("Verification email sent. Check your inbox."))
      .catch((e) => toast.error(e?.message || "Failed to send verification email"));
  };

  const emailAndPasswordSignIn = () => {
    setLoading(true);
    setNeedsVerification(false);
    safe(() =>
      authClient.signIn.email(
        {
          email: formData.email,
          password: formData.password,
          callbackURL: "/",
        },
        {
          onError(ctx) {
            if (ctx.error.status === 403) {
              setNeedsVerification(true);
              toast.error("Please verify your email address");
            } else {
              toast.error(ctx.error.message || ctx.error.statusText);
            }
          },
        },
      ),
    )
      .watch(() => setLoading(false))
      .unwrap();
  };

  const handleSocialSignIn = (provider: SocialAuthenticationProvider) => {
    authClient.signIn.social({ provider }).catch((e) => {
      toast.error(e.error);
    });
  };

  const openReset = () => {
    setResetEmail(formData.email || "");
    setResetOpen(true);
  };

  const sendReset = async () => {
    const email = resetEmail.trim();
    if (!email) {
      toast.error("Enter your email");
      return;
    }
    try {
      await authClient.password.reset.request({ email, callbackURL: "/" });
      toast.success("Password reset link sent. Check your inbox.");
      setResetOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "Failed to send reset email");
    }
  };

  return (
    <div className="w-full h-full flex flex-col p-4 md:p-8 justify-center">
      <Card className="w-full md:max-w-md bg-background border-none mx-auto shadow-none animate-in fade-in duration-1000">
        <CardHeader className="my-4">
          <CardTitle className="text-2xl text-center my-1">
            {t("title")}
          </CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col">
          {emailAndPasswordEnabled && (
            <div className="flex flex-col gap-6">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  autoFocus
                  disabled={loading}
                  value={formData.email}
                  onChange={(e) => setFormData({ email: e.target.value })}
                  type="email"
                  placeholder="user@example.com"
                  required
                />
              </div>
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <button
                    type="button"
                    onClick={openReset}
                    className="text-xs text-primary underline underline-offset-4"
                    disabled={loading}
                  >
                    Forgot your password?
                  </button>
                </div>
                <Input
                  id="password"
                  disabled={loading}
                  value={formData.password}
                  placeholder="********"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      emailAndPasswordSignIn();
                    }
                  }}
                  onChange={(e) => setFormData({ password: e.target.value })}
                  type="password"
                  required
                />
              </div>
              <Button
                className="w-full"
                onClick={emailAndPasswordSignIn}
                disabled={loading}
              >
                {loading ? (
                  <Loader className="size-4 animate-spin ml-1" />
                ) : (
                  t("signIn")
                )}
              </Button>
              {needsVerification && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={resendVerification}
                  disabled={loading}
                >
                  Resend verification email
                </Button>
              )}
            </div>
          )}
          {socialAuthenticationProviders.length > 0 && (
            <>
              {emailAndPasswordEnabled && (
                <div className="flex items-center my-4">
                  <div className="flex-1 h-px bg-accent"></div>
                  <span className="px-4 text-sm text-muted-foreground">
                    {t("orContinueWith")}
                  </span>
                  <div className="flex-1 h-px bg-accent"></div>
                </div>
              )}
              <div className="flex flex-col gap-2 w-full">
                {socialAuthenticationProviders.includes("google") && (
                  <Button
                    variant="outline"
                    onClick={() => handleSocialSignIn("google")}
                    className="flex-1 w-full"
                  >
                    <GoogleIcon className="size-4 fill-foreground" />
                    Google
                  </Button>
                )}
                {socialAuthenticationProviders.includes("github") && (
                  <Button
                    variant="outline"
                    onClick={() => handleSocialSignIn("github")}
                    className="flex-1 w-full"
                  >
                    <GithubIcon className="size-4 fill-foreground" />
                    GitHub
                  </Button>
                )}
                {socialAuthenticationProviders.includes("microsoft") && (
                  <Button
                    variant="outline"
                    onClick={() => handleSocialSignIn("microsoft")}
                    className="flex-1 w-full"
                  >
                    <MicrosoftIcon className="size-4 fill-foreground" />
                    Microsoft
                  </Button>
                )}
              </div>
            </>
          )}
          {signUpEnabled && (
            <div className="my-8 text-center text-sm text-muted-foreground">
              {t("noAccount")}
              <Link href="/sign-up" className="underline-offset-4 text-primary">
                {t("signUp")}
              </Link>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Password reset</DialogTitle>
            <DialogDescription>Enter your email to receive a reset link.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-2">
            <Label htmlFor="reset-email">Email</Label>
            <Input
              id="reset-email"
              type="email"
              value={resetEmail}
              onChange={(e) => setResetEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setResetOpen(false)}>
              Cancel
            </Button>
            <Button onClick={sendReset}>Send reset link</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
