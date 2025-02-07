
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
          <Button variant="link" className="text-xl font-bold p-0" onClick={() => navigate("/")}>
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
