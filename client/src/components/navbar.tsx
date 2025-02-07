
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { History, LogOut, Search } from "lucide-react";

export default function Navbar() {
  const { user, logoutMutation } = useAuth();
  const [location, navigate] = useLocation();

  if (!user) return null;

  return (
    <nav className="border-b">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <Button variant="link" className="text-xl font-bold p-0 flex items-center gap-2" onClick={() => navigate("/")}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            ResearchHunter
          </Button>
          <div className="flex items-center space-x-4">
            <Button 
              variant="link" 
              className={`flex items-center space-x-2 p-0 ${location === '/' ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => navigate("/")}
            >
              <Search className="h-4 w-4" />
              <span>Research</span>
            </Button>
            <Button
              variant="link"
              className={`flex items-center space-x-2 p-0 ${location === '/history' ? 'text-primary' : 'text-muted-foreground'}`}
              onClick={() => navigate("/history")}
            >
              <History className="h-4 w-4" />
              <span>History</span>
            </Button>
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
