
import { useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function AuthPage() {
  useEffect(() => {
    const signInUrl = `${process.env.CLERK_FRONTEND_API}/sign-in?redirect_url=${window.location.origin}`;
    window.location.href = signInUrl;
  }, []);

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Welcome to Deep Research</CardTitle>
            <CardDescription>
              Redirecting to sign in...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>Please wait while we redirect you to the login page...</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
