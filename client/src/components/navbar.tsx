import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { History, LogOut, Search } from "lucide-react";

export default function Navbar() {
  const { user, logoutMutation } = useAuth();
  const [location] = useLocation();

  if (!user) return null;

  return (
    <nav className="border-b">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <Link href="/">
            <a className="text-xl font-bold">ResearchHunter</a>
          </Link>
          <div className="flex items-center space-x-4">
            <Link href="/">
              <a className={`flex items-center space-x-2 ${location === '/' ? 'text-primary' : 'text-muted-foreground'}`}>
                <Search className="h-4 w-4" />
                <span>Research</span>
              </a>
            </Link>
            <Link href="/history">
              <a className={`flex items-center space-x-2 ${location === '/history' ? 'text-primary' : 'text-muted-foreground'}`}>
                <History className="h-4 w-4" />
                <span>History</span>
              </a>
            </Link>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-muted-foreground">{user.email}</span>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
