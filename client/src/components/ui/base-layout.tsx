import * as React from "react"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

const BaseLayout = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof motion.div>
>(({ className, children, ...props }, ref) => {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "min-h-screen w-full bg-background text-foreground",
        "p-4 md:p-6 lg:p-8", // Responsive padding
        "grid gap-4 md:gap-6 lg:gap-8", // Responsive grid gaps
        "transition-all duration-200 ease-in-out", // Smooth transitions
        className
      )}
      {...props}
    >
      <div className="mx-auto w-full max-w-7xl">
        {children}
      </div>
    </motion.div>
  )
})
BaseLayout.displayName = "BaseLayout"

export { BaseLayout }