import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { History, LogOut, Search } from "lucide-react";
import { motion } from "framer-motion";

export default function Navbar() {
  const { user, logoutMutation } = useAuth();
  const [location, navigate] = useLocation();

  if (!user) return null;

  return (
    <motion.nav 
      className="border-b"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <Button 
            variant="link" 
            className="text-xl font-bold p-0 flex items-center gap-2 hover:scale-105 transition-transform" 
            onClick={() => navigate("/")}
          >
            <motion.svg 
              width="24" 
              height="24" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              whileHover={{ rotate: 360 }}
              transition={{ duration: 0.5 }}
            >
              <path 
                d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              />
            </motion.svg>
            ResearchHunter
          </Button>
          <div className="flex items-center space-x-4">
            <motion.div whileHover={{ scale: 1.05 }}>
              <Button 
                variant="link" 
                className={`flex items-center space-x-2 p-0 transition-colors duration-200 ${location === '/' ? 'text-primary font-medium' : 'text-muted-foreground hover:text-primary'}`}
                onClick={() => navigate("/")}
              >
                <Search className="h-4 w-4" />
                <span>Research</span>
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }}>
              <Button
                variant="link"
                className={`flex items-center space-x-2 p-0 transition-colors duration-200 ${location === '/history' ? 'text-primary font-medium' : 'text-muted-foreground hover:text-primary'}`}
                onClick={() => navigate("/history")}
              >
                <History className="h-4 w-4" />
                <span>History</span>
              </Button>
            </motion.div>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-muted-foreground hidden sm:inline-block">{user.email}</span>
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="hover:bg-destructive/10 hover:text-destructive transition-colors duration-200"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </div>
    </motion.nav>
  );
}