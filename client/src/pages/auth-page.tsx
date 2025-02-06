import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertUserSchema, type InsertUser } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { SiLinkedin } from "react-icons/si";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2 } from "lucide-react";

export default function AuthPage() {
  const [location, setLocation] = useLocation();
  const { user, loginMutation, registerMutation } = useAuth();
  const error = new URLSearchParams(window.location.search).get('error');

  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  const loginForm = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const registerForm = useForm<InsertUser>({
    resolver: zodResolver(insertUserSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onLogin = (data: InsertUser) => {
    console.log('Attempting login with:', { email: data.email });
    loginMutation.mutate(data);
  };

  const onRegister = (data: InsertUser) => {
    console.log('Attempting registration with:', { email: data.email });
    registerMutation.mutate(data);
  };

  const handleLinkedInLogin = () => {
    window.location.href = '/api/auth/signin/linkedin';
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div className="flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Welcome to Deep Research</CardTitle>
            <CardDescription>
              Sign in or create an account to start your research journey
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertDescription>{decodeURIComponent(error)}</AlertDescription>
                </Alert>
              )}

              <Button
                type="button"
                variant="outline"
                className="w-full flex items-center justify-center gap-2"
                onClick={handleLinkedInLogin}
              >
                <SiLinkedin className="h-5 w-5 text-[#0A66C2]" />
                Sign in with LinkedIn
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="hidden md:flex flex-col justify-center p-8 bg-slate-50">
        <div className="max-w-md mx-auto">
          <h1 className="text-4xl font-bold mb-4">
            Unlock Deep Research Insights
          </h1>
          <p className="text-lg text-slate-600">
            Our AI-powered research assistant helps you discover and analyze information across multiple sources, providing comprehensive insights for your research needs.
          </p>
        </div>
      </div>
    </div>
  );
}