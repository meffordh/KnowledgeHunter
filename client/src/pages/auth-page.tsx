
import { SignInButton, SignOutButton } from "@clerk/clerk-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function AuthPage() {
  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Welcome to ResearchHunter</CardTitle>
            <CardDescription>
              Please sign in to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-center">
              <SignInButton mode="modal">
                <Button size="lg" className="mr-4">
                  Sign in with Clerk
                </Button>
              </SignInButton>
              <SignOutButton>
                <Button size="lg" variant="outline">
                  Sign out
                </Button>
              </SignOutButton>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
