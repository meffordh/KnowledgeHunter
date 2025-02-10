import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { History, LogOut, Search } from "lucide-react";
import { motion } from "framer-motion";
import { useClerk } from "@clerk/clerk-react";

export default function Navbar() {
  const { user } = useAuth();
  const [location, navigate] = useLocation();
  const { signOut } = useClerk();

  if (!user) return null;

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  return (
    <motion.nav 
      className="bg-orange-700"
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center space-x-8">
          <Button 
            variant="link" 
            className="text-xl font-bold p-0 flex items-center gap-2 hover:scale-105 transition-transform text-white" 
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
                d="M12 3C7.58172 3 4 6.58172 4 11C4 13.9611 5.55972 16.5465 7.93706 17.9297L8 18V21.5059C8 21.7015 8.1189 21.8783 8.30546 21.9586C8.49202 22.0389 8.70876 22.0067 8.86852 21.8749L12.0103 19.3086L12.093 19.3583C12.0622 19.3479 12.0314 19.3374 12 19.3269C16.4183 19.3269 20 15.7452 20 11.3269C20 6.90861 16.4183 3.32689 12 3.32689V3ZM9.64645 9.64645C9.84171 9.45118 10.1583 9.45118 10.3536 9.64645L12 11.2929L13.6464 9.64645C13.8417 9.45118 14.1583 9.45118 14.3536 9.64645C14.5488 9.84171 14.5488 10.1583 14.3536 10.3536L12.7071 12L14.3536 13.6464C14.5488 13.8417 14.5488 14.1583 14.3536 14.3536C14.1583 14.5488 13.8417 14.5488 13.6464 14.3536L12 12.7071L10.3536 14.3536C10.1583 14.5488 9.84171 14.5488 9.64645 14.3536C9.45118 14.1583 9.45118 13.8417 9.64645 13.6464L11.2929 12L9.64645 10.3536C9.45118 10.1583 9.45118 9.84171 9.64645 9.64645Z" 
                fill="currentColor"
              />
            </motion.svg>
            KnowledgeHunter
          </Button>
          <div className="flex items-center space-x-4">
            <motion.div whileHover={{ scale: 1.05 }}>
              <Button 
                variant="link" 
                className={`flex items-center space-x-2 p-0 transition-colors duration-200 text-white/80 hover:text-white ${location === '/' && 'text-white font-medium'}`}
                onClick={() => navigate("/")}
              >
                <Search className="h-4 w-4" />
                <span>Research</span>
              </Button>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }}>
              <Button
                variant="link"
                className={`flex items-center space-x-2 p-0 transition-colors duration-200 text-white/80 hover:text-white ${location === '/history' && 'text-white font-medium'}`}
                onClick={() => navigate("/history")}
              >
                <History className="h-4 w-4" />
                <span>History</span>
              </Button>
            </motion.div>
          </div>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-white/80 hidden sm:inline-block">{user.email}</span>
          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }}>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleSignOut}
              className="text-white hover:bg-orange-600/50 hover:text-white/80 transition-colors duration-200"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </motion.div>
        </div>
      </div>
    </motion.nav>
  );
}